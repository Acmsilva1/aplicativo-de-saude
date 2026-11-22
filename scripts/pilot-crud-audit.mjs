import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const base='http://127.0.0.1:5199',created=[],checks=[];
const checked=result=>{if(result.error)throw Error(result.error.message);return result.data;};
const done=name=>checks.push({name,ok:true});
const password=randomBytes(20).toString('base64url');
const initialPasswords=new Set();
async function call(actor,path,method='GET',body){
 const response=await fetch(`${base}${path}`,{method,headers:{Cookie:actor.cookie||'','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 const cookies=response.headers.getSetCookie?.()||[];
 if(cookies.length)actor.cookie=cookies.map(c=>c.split(';')[0]).join('; ');
 return {status:response.status,data:await response.json()};
}
const auth=(actor,resource,method,body)=>call(actor,`/api/auth?resource=${resource}`,method,body);
const health=(actor,resource,method,body)=>call(actor,`/api/saude?resource=${resource}`,method,body);
async function login(actor,pass=password){const r=await auth(actor,'login','POST',{email:actor.email,password:pass});assert.equal(r.status,200);return r;}
try{
 const email=`ritmo.crud.${Date.now()}@example.com`;
 const {user}=checked(await db.auth.admin.createUser({email,password,email_confirm:true}));
 const admin={id:user.id,email};created.push(admin);
 checked(await db.from('health_user_profiles').insert({user_id:admin.id,nome:'AUDITORIA CRUD',email}));
 checked(await db.from('health_user_roles').insert({user_id:admin.id,role:'admin',access_enabled:true,must_change_password:false}));
 await login(admin);
 async function account(role,professor_id){
  const r=await auth(admin,'accounts','POST',{name:'AUDITORIA CRUD',email:`ritmo.crud.${role}.${Date.now()}@example.com`,role,professor_id});
  assert.equal(r.status,201);const actor=r.data.account;created.push(actor);
  assert.equal(r.data.initialPassword.length,24);
  assert.notEqual(r.data.initialPassword,'123456');
  assert.ok(!initialPasswords.has(r.data.initialPassword));initialPasswords.add(r.data.initialPassword);
  const reset=await auth(admin,'account-temporary-password','POST',{id:actor.id});
  assert.equal(reset.status,200);assert.equal(reset.data.initialPassword.length,24);
  assert.notEqual(reset.data.initialPassword,r.data.initialPassword);
  assert.equal((await auth(actor,'login','POST',{email:actor.email,password:r.data.initialPassword})).status,401);
  await login(actor,reset.data.initialPassword);
  assert.equal((await health(actor,role==='professor'?'professor-users':'agua')).status,403);
  assert.equal((await auth(actor,'change-password','POST',{password})).status,200);
  assert.equal((await auth(admin,'account-temporary-password','POST',{id:actor.id})).status,400);
  return actor;
 }
 const professor=await account('professor');const student=await account('student',professor.id);
 done('unique 24-character temporary passwords; admin regeneration invalidates old password; first access enforced; personal password protected from regeneration');
 const payload={user_id:student.id,titulo:'AUDITORIA dieta semanal',semanal:true,semana:Array.from({length:7},(_,i)=>({titulo:`Dia ${i}`,refeicoes:[{tipo:'almoco',titulo:'Almoço',itens:[{nome:'Arroz',quantidade:'100 g'}]}]}))};
 const diet=await health(professor,'professor-dieta','POST',payload);assert.equal(diet.status,201);
 const id=diet.data.id;assert.ok(id);
 assert.equal((await health(student,'dietas')).data.diets.length,0);
 assert.equal((await health(professor,'professor-dieta','PATCH',{id,user_id:student.id,action:'visibility',visible_to_student:true})).status,200);
 assert.equal((await health(student,'dietas')).data.diets.length,1);
 assert.equal((await health(professor,'professor-dieta','PATCH',{...payload,id,titulo:'AUDITORIA editada'})).status,200);
 assert.equal((await health(student,'dietas')).data.diets[0].titulo,'AUDITORIA editada');
 done('weekly diet create/edit/ON visible to student');
 for(const goal_ml of [2000,2500])assert.equal((await health(professor,'professor-agua-meta','PATCH',{user_id:student.id,goal_ml,nome:'Meta teste'})).status,200);
 assert.equal(checked(await db.from('health_water_goals').select('user_id').eq('user_id',student.id)).length,1);
 assert.equal((await health(student,'agua-checkin','POST',{amount_ml:200})).status,201);
 const monitor=await health(professor,`professor-agua&user_id=${student.id}`);
 assert.equal(monitor.data.water.total_ml,200);assert.equal(monitor.data.water.goal_ml,2500);
 done('single official goal; student check-in visible to linked professor');
 const template=await health(professor,'professor-portfolio','POST',{titulo:'AUDITORIA modelo',refeicoes:[]});assert.equal(template.status,201);
 assert.equal((await health(professor,'professor-portfolio','PATCH',{id:template.data.template.id,titulo:'AUDITORIA modelo editado',refeicoes:[]})).status,200);
 assert.equal((await health(professor,'professor-portfolio','DELETE',{id:template.data.template.id})).status,200);
 done('professor template create/edit/delete');
 assert.equal((await auth(admin,'account-access','PATCH',{id:student.id,access:false})).status,200);
 assert.equal((await health(student,'agua')).status,401);
 assert.equal((await auth(admin,'account-access','PATCH',{id:student.id,access:true})).status,200);
 await login(student);done('block existing session and reenable account');
 assert.equal((await auth(admin,'accounts','DELETE',{id:professor.id})).status,400);
 assert.ok(checked(await db.from('health_user_profiles').select('user_id').eq('user_id',professor.id).single()));
 done('professor linked to student cannot be deleted; profile preserved');
 assert.equal((await health(professor,'professor-dieta','DELETE',{id,user_id:student.id})).status,200);
 assert.equal((await health(student,'dietas')).data.diets.length,0);
 assert.equal((await health(professor,'professor-agua-meta','DELETE',{user_id:student.id})).status,200);
 assert.equal((await health(student,'agua')).data.goal_ml,null);
 assert.equal((await auth(student,'logout','POST',{})).status,200);
 done('diet and goal deletion; logout');
}catch{checks.push({name:'CRUD flow failed',ok:false,detail:'Detailed assertions suppressed to protect temporary credentials.'});process.exitCode=1;}
finally{
 let cleaned=0;for(const actor of [...created].reverse()){const r=await db.auth.admin.deleteUser(actor.id);if(!r.error)cleaned++;}
 console.log(JSON.stringify({checks,cleanup:{created:created.length,deleted:cleaned}},null,2));
 if(cleaned!==created.length)process.exitCode=1;
}
