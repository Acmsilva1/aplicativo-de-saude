import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const file='/tmp/ritmo-pilot-fixtures.json';
const phase=process.argv[2]||'test';
const base=process.env.AUDIT_BASE||'http://127.0.0.1:5199';
const checked=result=>{if(result.error)throw Error(result.error.message);return result.data;};
if(phase==='setup'){
 const fixtures={accounts:[],createdAt:new Date().toISOString()};
 const stamp=Date.now();
 writeFileSync(file,JSON.stringify(fixtures),{mode:0o600});
 for(let i=0;i<13;i++){
  const role=i===12?'admin':i<2?'professor':'student';
  const email=`ritmo.audit.${stamp}.${i}@example.com`,password=randomBytes(24).toString('base64url');
  const {user}=checked(await db.auth.admin.createUser({email,password,email_confirm:true}));
  const account={id:user.id,email,password,role};fixtures.accounts.push(account);
  writeFileSync(file,JSON.stringify(fixtures),{mode:0o600});
  checked(await db.from('health_user_profiles').insert({user_id:user.id,nome:`AUDITORIA TEMP ${i}`,email}));
  checked(await db.from('health_user_roles').insert({user_id:user.id,role,professor_id:role==='student'?fixtures.accounts[0].id:null,access_enabled:true,must_change_password:false}));
  if(role==='student'){
   checked(await db.from('health_water_goals').insert({user_id:user.id,goal_ml:i===3?3000:2000,nome:'AUDITORIA TEMP'}));
   for(const status of ['active','archived'])checked(await db.from('health_diet_plans').insert({user_id:user.id,title:`AUDITORIA ${status}`,status}));
  }
 }
 console.log(JSON.stringify({phase,created:fixtures.accounts.length}));
}else if(phase==='enrich'){
 const fixtures=JSON.parse(readFileSync(file));
 for(const account of fixtures.accounts.slice(2,4)){
  const plans=checked(await db.from('health_diet_plans').select('id,user_id').eq('user_id',account.id));
  for(const plan of plans){
   const meal=checked(await db.from('health_diet_meals').insert({diet_plan_id:plan.id,user_id:account.id,weekday:0,meal_type:'almoco',title:'Almoço'}).select('id').single());
   checked(await db.from('health_diet_items').insert({meal_id:meal.id,user_id:account.id,name:'Arroz de teste',quantity:'100 g'}));
  }
 }
 console.log(JSON.stringify({phase,ok:true}));
}else if(phase==='cleanup'){
 const fixtures=JSON.parse(readFileSync(file));
 const failures=[];
 for(const account of [...fixtures.accounts].reverse()){
  const result=await db.auth.admin.deleteUser(account.id);
  if(result.error)failures.push(account.id);
 }
 console.log(JSON.stringify({phase,deleted:fixtures.accounts.length-failures.length,failures}));
 if(failures.length)process.exitCode=1;
}else{
 const fixtures=JSON.parse(readFileSync(file));
 const results=[],times=[];
 const check=(name,ok,detail)=>results.push({name,ok,...(detail?{detail}: {})});
 const anon=process.env.SUPABASE_ANON_KEY;
 async function login(account){
  const response=await fetch(`${base}/api/auth?resource=login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password})});
  if(!response.ok)throw Error(`Login fixture ${response.status}`);
  account.cookie=(response.headers.getSetCookie?.()||[]).map(c=>c.split(';')[0]).join('; ');
  const client=createClient(process.env.SUPABASE_URL,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=checked(await client.auth.signInWithPassword({email:account.email,password:account.password}));account.token=auth.session.access_token;
 }
 for(const account of fixtures.accounts)await login(account);
 writeFileSync(file,JSON.stringify(fixtures),{mode:0o600});
 const [prof,outsider,a,b]=fixtures.accounts;
 async function api(account,resource,{method='GET',body}={}){
  const begin=performance.now();
  const response=await fetch(`${base}/api/saude?resource=${resource}`,{method,headers:{Cookie:account?.cookie||'','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
  const data=await response.json();return {status:response.status,data,ms:performance.now()-begin};
 }
 async function rest(account,table,filter,method='GET',body){
  const response=await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}?${filter}`,{method,headers:{apikey:anon,Authorization:`Bearer ${account?.token||anon}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  return {status:response.status,data:await response.json()};
 }
 check('unauthenticated API denied',(await api(null,'agua')).status===401);
 for(const table of ['health_user_profiles','health_user_roles','health_diet_plans','health_diet_meals','health_diet_items','health_water_goals','health_water_entries']){
  const result=await rest(a,table,`user_id=eq.${b.id}&select=*`);
  check(`RLS student cannot read colleague: ${table}`,result.status<300&&result.data.length===0);
  const anonResult=await rest(null,table,`user_id=eq.${a.id}&select=*`);
  check(`RLS anonymous cannot read: ${table}`,anonResult.status===401||anonResult.status===403||(Array.isArray(anonResult.data)&&anonResult.data.length===0));
 }
 const visible=await rest(a,'health_diet_plans',`user_id=eq.${a.id}&status=eq.archived&select=id`);
 check('RLS student cannot read OFF diets',visible.status<300&&visible.data.length===0);
 const ownPlans=await rest(a,'health_diet_plans',`user_id=eq.${a.id}&select=id,status`);
 check('RLS positive: student reads own active diet',ownPlans.status===200&&ownPlans.data.length===1&&ownPlans.data[0].status==='active');
 for(const table of ['health_diet_meals','health_diet_items']){
  const ownRows=await rest(a,table,`user_id=eq.${a.id}&select=id`);
  const profRows=await rest(prof,table,`user_id=eq.${a.id}&select=id`);
  check(`RLS hidden diet children denied: ${table}`,ownRows.status===200&&ownRows.data.length===1&&profRows.status===200&&profRows.data.length===2);
 }
 const ownGoal=await rest(a,'health_water_goals',`user_id=eq.${a.id}&select=user_id`);
 check('RLS positive: student reads own water goal',ownGoal.status===200&&ownGoal.data.length===1);
 for(const table of ['health_diet_plans','health_water_goals']){
  const result=await rest(outsider,table,`user_id=eq.${a.id}&select=id` .replace('select=id',table==='health_water_goals'?'select=user_id':'select=id'));
  check(`RLS unlinked professor denied: ${table}`,result.status<300&&result.data.length===0);
  const admin=await rest(fixtures.accounts[12],table,`user_id=eq.${a.id}&select=*`);
  check(`RLS admin cannot read health: ${table}`,admin.status<300&&admin.data.length===0);
 }
 const insert=await rest(a,'health_water_entries','', 'POST',{id:randomUUID(),user_id:b.id,amount_ml:100});
 check('RLS cannot write water for colleague',insert.status>=400);
 await rest(a,'health_user_roles',`user_id=eq.${a.id}`,'PATCH',{role:'admin'});
 const ownRole=checked(await db.from('health_user_roles').select('role').eq('user_id',a.id).single());
 check('RLS cannot self promote',ownRole.role==='student');
 const own=await api(a,`agua&user_id=${b.id}`);
 check('API ignores student forged target',own.status===200&&own.data.goal_ml===2000);
 const denied=await api(outsider,`professor-agua&user_id=${a.id}`);
 check('API unlinked professor denied',denied.status===404);
 check('API student cannot manage diet',(await api(a,'professor-dieta',{method:'POST',body:{user_id:b.id,titulo:'attack'}})).status===403);
 check('API admin health denied',(await api(fixtures.accounts[12],'agua')).status===403);
 // Ten students plus professor: fixed small pilot load, never an unbounded flood.
 const actors=[prof,...fixtures.accounts.filter(x=>x.role==='student')];
 const rounds=Math.min(120,Math.max(12,Number(process.env.AUDIT_ROUNDS)||12));
 const baselines=new Map();
 for(const actor of actors.filter(x=>x.role==='student'))baselines.set(actor.id,(await api(actor,'agua')).data.total_ml);
 const begin=performance.now();
 await Promise.all(actors.map(async actor=>{
  for(let i=0;i<rounds;i++){
   const resource=actor.role==='professor'?`professor-agua&user_id=${a.id}`:i%4===0?'agua-checkin':i%2?'agua':'dietas';
   const result=await api(actor,resource,resource==='agua-checkin'?{method:'POST',body:{amount_ml:100}}:{});
   times.push({status:result.status,ms:result.ms,kind:actor.role==='professor'?'professor-read':resource});
   await new Promise(resolve=>setTimeout(resolve,250));
  }
 }));
 const durationMs=performance.now()-begin;
 for(const actor of actors.filter(x=>x.role==='student')){
  const water=await api(actor,'agua');check('load: exact water total, no lost writes',water.status===200&&water.data.total_ml===baselines.get(actor.id)+Math.ceil(rounds/4)*100);
 }
 const sorted=times.map(x=>x.ms).sort((x,y)=>x-y),percentile=p=>Math.round(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)]);
 const report={createdAt:new Date().toISOString(),base,checks:results,load:{users:11,requests:times.length,durationMs:Math.round(durationMs),rps:Math.round(times.length/durationMs*10000)/10,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:Math.round(sorted.at(-1)),errors:times.filter(x=>x.status>=400).length,byKind:Object.fromEntries([...new Set(times.map(x=>x.kind))].map(kind=>[kind,times.filter(x=>x.kind===kind).length]))}};
 writeFileSync('/tmp/ritmo-pilot-report.json',JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify(report,null,2));
}
