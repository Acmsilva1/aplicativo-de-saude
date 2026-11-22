import { readFileSync, readdirSync } from 'node:fs';
const base=process.env.AUDIT_BASE||'http://127.0.0.1:5199';
// Spoofing must cross the real trusted proxy; a loopback caller is itself trusted.
const publicBase=process.env.AUDIT_PUBLIC_BASE||'https://controle-de-saude.duckdns.org';
const checks=[];
const check=(name,ok)=>checks.push({name,ok});
const page=await fetch(base);
const html=await page.text();
for(const header of ['content-security-policy','strict-transport-security','x-content-type-options','x-frame-options'])check(`security header ${header}`,!!page.headers.get(header));
const api=await fetch(`${base}/api/auth?resource=session`);
check('unauthenticated session denied',api.status===401);
check('API no-store',api.headers.get('cache-control')==='no-store');
const malformed=await fetch(`${base}/api/auth?resource=session`,{headers:{Cookie:'ritmo_saude_session=%invalid'}});
check('malformed cookie rejected without 500',malformed.status===401);
const secrets=['SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','BOOTSTRAP_ADMIN_PASSWORD'].map(key=>process.env[key]).filter(Boolean);
for(const path of ['/.env','/.git/config','/server.js','/lib/supabase.js','/docker-compose.yml']){
 const response=await fetch(`${base}${path}`),text=await response.text();
 check(`no secret/source exposure ${path}`,!secrets.some(secret=>text.includes(secret))&&(response.status===404||text.includes('<html')));
}
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(`${dir}/${item.name}`):[`${dir}/${item.name}`]);}
check('runtime secrets absent from public build',files('/app/dist').every(file=>!secrets.some(secret=>readFileSync(file).includes(Buffer.from(secret)))));
const fixtures=JSON.parse(readFileSync('/tmp/ritmo-pilot-fixtures.json'));
const account=fixtures.accounts[1];
const login=await fetch(`${base}/api/auth?resource=login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password})});
check('synthetic login successful',login.status===200);
const cookie=login.headers.get('set-cookie')||'';
check('cookie HttpOnly Secure SameSite=Strict',/HttpOnly/i.test(cookie)&&/Secure/i.test(cookie)&&/SameSite=Strict/i.test(cookie));
for(let i=0;i<11;i++){
 const response=await fetch(`${publicBase}/api/auth?resource=login`,{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':`192.0.2.${i+1}`},body:JSON.stringify({email:'nonexistent.audit@example.com',password:'invalid-password'})});
 if(i===10)check('brute force blocked despite forged XFF',response.status===429);
}
console.log(JSON.stringify({checks},null,2));
