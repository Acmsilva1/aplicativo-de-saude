import '../styles/saude.css';
import './pwa.js';
import { renderLogin } from './auth/index.js';
import { renderSaudeContent } from './saude/index.js';
import { renderPasswordChange, showWelcome } from './auth/firstAccess.js';
const app=document.querySelector('#app');
const state={user:null,module:'users',accounts:[],metrics:null,profiles:[],diets:[],diet:null,water:null,monitor:null,selectedUserId:'',templates:[],template:null,templateDraft:null,dietDraft:null,dietSourceSelected:false,foodItemContext:null,foods:[],notice:''};
async function request(url,options={}){const r=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options});const data=await r.json();if(!r.ok)throw Error(data.error||'Ação indisponível.');return data;}
const mutate=(resource,method,body)=>request(`/api/saude?resource=${resource}`,{method,body:JSON.stringify(body)});
const initialModule=()=>'home';
async function enter(){
 const dismiss=showWelcome(state.user);
 try{await Promise.all([new Promise(resolve=>setTimeout(resolve,3000)),state.user.must_change_password?Promise.resolve():load(initialModule())]);render();}finally{dismiss();}
}
async function logout(){await request('/api/auth?resource=logout',{method:'POST',body:'{}'});Object.assign(state,{user:null,accounts:[],metrics:null,profiles:[],diets:[],diet:null,water:null,monitor:null,selectedUserId:'',templates:[],template:null,templateDraft:null,dietDraft:null,dietSourceSelected:false,foodItemContext:null,foods:[],notice:''});auth();}
function passwordChange(error=''){renderPasswordChange(app,{user:state.user,error,onLogout:logout,onSubmit:async password=>{try{state.user=(await request('/api/auth?resource=change-password',{method:'POST',body:JSON.stringify({password})})).user;await enter();}catch(e){passwordChange(e.message);}}});}
function auth(error=''){renderLogin(app,{error,onLogin:async credentials=>{try{state.user=(await request('/api/auth?resource=login',{method:'POST',body:JSON.stringify(credentials)})).user;await enter();}catch(e){auth(e.message);}}});}
async function load(module,targetId=''){
 const previousModule=state.module;state.module=module;state.notice='';
 state.foodItemContext=null;
 if(module!==previousModule){state.dietDraft=null;state.templateDraft=null;state.dietSourceSelected=false;}
 if(targetId && !['diet-detail','editDiet','template-detail','editTemplate'].includes(module))state.selectedUserId=targetId;
 try{
  if(state.user.role==='admin'){
   if(module==='observability')state.metrics=await request('/api/auth?resource=observability');
   else if(module==='home'){
    state.accounts=(await request('/api/auth?resource=accounts')).accounts;
    try{state.metrics=await request('/api/auth?resource=observability');}catch{/* métricas opcionais na landing */}
   }else state.accounts=(await request('/api/auth?resource=accounts')).accounts;
  }else if(state.user.role==='professor'){
   state.profiles=(await request('/api/saude?resource=professor-users')).users;
   if(!state.profiles.some(profile=>profile.id===state.selectedUserId))state.selectedUserId=state.profiles[0]?.id||'';
   state.templates=(await request('/api/saude?resource=professor-portfolio')).templates;
   if(!state.foods.length)state.foods=(await request('/api/saude?resource=professor-alimentos')).foods;
   if(['template-detail','editTemplate'].includes(module))state.template=state.templates.find(template=>template.id===(targetId||state.template?.id))||null;
   if(module==='createTemplate')state.template=null;
   if(module==='monitor')state.monitor=await request(`/api/saude?resource=professor-agua&user_id=${encodeURIComponent(state.selectedUserId)}`);
   if(['diets','diet-detail','createDiet','editDiet'].includes(module))state.diets=(await request(`/api/saude?resource=professor-dieta&user_id=${encodeURIComponent(state.selectedUserId)}`)).diets;
  }else{
   if(module==='water'||module==='home')state.water=await request('/api/saude?resource=agua');
   if(module!=='water')state.diets=(await request('/api/saude?resource=dietas')).diets;
  }
  if(['diet-detail','editDiet'].includes(module))state.diet=state.diets.find(x=>x.id===(targetId||state.diet?.id))||null;
  else if(module==='createDiet'||module==='createTemplate')state.diet=null;
  else state.diet=state.diets[0]||null;
 }catch(e){state.notice={text:e.message,type:'error'};state.diets=[];state.diet=null;state.water=null;state.monitor=null;}
}
async function action(work,module='users',targetId='',successNotice='Tudo certo! Alteração salva.'){try{await work();await load(module,targetId);state.notice={text:successNotice,type:'success'};}catch(e){state.notice={text:e.message,type:'error'};}render();}
function render(){if(!state.user)return auth();if(state.user.must_change_password)return passwordChange();renderSaudeContent(app,{state,
 onNavigate:async(module,targetId)=>{await load(module,targetId);render();},
 onLogout:logout,
 onCreateAccount:payload=>action(()=>request('/api/auth?resource=accounts',{method:'POST',body:JSON.stringify(payload)}),'accounts','','Conta criada com sucesso.'),
 onAccountAccess:(id,access)=>action(()=>request('/api/auth?resource=account-access',{method:'PATCH',body:JSON.stringify({id,access})}),'accounts','',access?'Acesso liberado.':'Acesso bloqueado.'),
 onEditAccount:payload=>action(async()=>{const result=await request('/api/auth?resource=accounts',{method:'PATCH',body:JSON.stringify(payload)});if(result.account.id===state.user.id)state.user=result.account;},'accounts','','Conta atualizada.'),
 onDeleteAccount:id=>action(()=>request('/api/auth?resource=accounts',{method:'DELETE',body:JSON.stringify({id})}),'accounts','','Conta excluída.'),
 onSaveTemplate:payload=>(state.templateDraft=payload,action(()=>mutate('professor-portfolio',payload.id?'PATCH':'POST',payload),'portfolio','',payload.id?'Modelo atualizado.':'Modelo criado.')),
 onDeleteTemplate:id=>action(()=>mutate('professor-portfolio','DELETE',{id}),'portfolio','','Modelo excluído.'),
 onUseTemplate:async id=>{const template=state.templates.find(entry=>entry.id===id);if(!template)return;const draft=structuredClone(template);delete draft.id;state.dietDraft=null;state.foodItemContext=null;await load('createDiet');state.templateDraft=draft;state.dietDraft=null;state.dietSourceSelected=true;render();},
 onCreateDiet:payload=>(state.dietDraft=payload,action(()=>mutate('professor-dieta','POST',payload),'diets',payload.user_id,'Dieta criada com sucesso.')),
 onEditDiet:payload=>(state.dietDraft=payload,action(()=>mutate('professor-dieta','PATCH',payload),'diets',payload.user_id,'Dieta atualizada.')),
 onDeleteDiet:(id,userId)=>action(()=>mutate('professor-dieta','DELETE',{id,user_id:userId}),'diets',userId,'Dieta excluída.'),
 onWaterGoal:(id,goal,mode='save')=>action(()=>mutate('professor-agua-meta',mode==='delete'?'DELETE':'PATCH',{user_id:id,goal_ml:goal,nome:state.waterGoalName,action:mode}),'monitor',id,mode==='delete'?'Meta de água removida.':'Meta de água salva.'),
 onWaterAmount:amount=>action(()=>mutate('agua-checkin','POST',{amount_ml:amount}),'water','','Consumo registrado!')
 });}
try{state.user=(await request('/api/auth?resource=session')).user;if(!state.user.must_change_password)await load(initialModule());render();}catch{auth();}

\n