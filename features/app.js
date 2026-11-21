import '../styles/saude.css';
import './pwa.js';
import { renderLogin } from './auth/index.js';
import { renderSaudeContent } from './saude/index.js';
import { renderPasswordChange, showWelcome } from './auth/firstAccess.js';
const app=document.querySelector('#app');
const state={user:null,module:'users',loading:false,accounts:[],accountsLoaded:false,metrics:null,profiles:[],profilesLoaded:false,diets:[],diet:null,water:null,monitor:null,selectedUserId:'',templates:[],templatesLoaded:false,template:null,templateDraft:null,dietDraft:null,dietSourceSelected:false,foodItemContext:null,foods:[],foodsLoaded:false,notice:''};
async function request(url,options={}){const r=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options});const data=await r.json();if(!r.ok)throw Error(data.error||'Ação indisponível.');return data;}
const mutate=(resource,method,body)=>request(`/api/saude?resource=${resource}`,{method,body:JSON.stringify(body)});
const initialModule=()=>'home';
async function enter(){
 const dismiss=showWelcome(state.user);
 try{
  if(!state.user.must_change_password){
   state.loading=true;
   render();
   await load(initialModule());
   state.loading=false;
  }
  render();
 }finally{state.loading=false;dismiss();}
}
async function logout(){await request('/api/auth?resource=logout',{method:'POST',body:'{}'});Object.assign(state,{user:null,module:'users',loading:false,accounts:[],accountsLoaded:false,metrics:null,profiles:[],profilesLoaded:false,diets:[],diet:null,water:null,monitor:null,selectedUserId:'',templates:[],templatesLoaded:false,template:null,templateDraft:null,dietDraft:null,dietSourceSelected:false,foodItemContext:null,foods:[],foodsLoaded:false,notice:''});auth();}
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
   else if(module==='home'||!state.accountsLoaded){
    const [accountData,metrics]=await Promise.all([
     request('/api/auth?resource=accounts'),
     module==='home'?request('/api/auth?resource=observability').catch(()=>null):Promise.resolve(null),
    ]);
    state.accounts=accountData.accounts;
    state.accountsLoaded=true;
    if(metrics)state.metrics=metrics;
   }
  }else if(state.user.role==='professor'){
   const [profileData,templateData,foodData]=await Promise.all([
    state.profilesLoaded?Promise.resolve({users:state.profiles}):request('/api/saude?resource=professor-users'),
    state.templatesLoaded?Promise.resolve({templates:state.templates}):request('/api/saude?resource=professor-portfolio'),
    state.foodsLoaded?Promise.resolve({foods:state.foods}):request('/api/saude?resource=professor-alimentos'),
   ]);
   state.profiles=profileData.users;
   state.templates=templateData.templates;
   state.foods=foodData.foods;
   state.profilesLoaded=true;
   state.templatesLoaded=true;
   state.foodsLoaded=true;
   if(!state.profiles.some(profile=>profile.id===state.selectedUserId))state.selectedUserId=state.profiles[0]?.id||'';
   if(['template-detail','editTemplate'].includes(module))state.template=state.templates.find(template=>template.id===(targetId||state.template?.id))||null;
   if(module==='createTemplate')state.template=null;
   const requests=[];
   if(module==='monitor')requests.push(request(`/api/saude?resource=professor-agua&user_id=${encodeURIComponent(state.selectedUserId)}`).then(data=>{state.monitor=data;}));
   if(['diets','diet-detail','editDiet'].includes(module)){
    const summary=module==='diets'?'&summary=true':'';
    requests.push(request(`/api/saude?resource=professor-dieta&user_id=${encodeURIComponent(state.selectedUserId)}${summary}`).then(data=>{state.diets=data.diets;}));
   }
   await Promise.all(requests);
  }else{
   if(module==='home'){
    const [water,diets]=await Promise.all([request('/api/saude?resource=agua'),request('/api/saude?resource=dietas')]);
    state.water=water;
    state.diets=diets.diets;
   }else if(module==='water')state.water=await request('/api/saude?resource=agua');
   else state.diets=(await request('/api/saude?resource=dietas')).diets;
  }
  if(['diet-detail','editDiet'].includes(module))state.diet=state.diets.find(x=>x.id===(targetId||state.diet?.id))||null;
  else if(module==='createDiet'||module==='createTemplate')state.diet=null;
  else state.diet=state.diets[0]||null;
 }catch(e){state.notice={text:e.message,type:'error'};state.diets=[];state.diet=null;state.water=null;state.monitor=null;}
}
async function navigate(module,targetId='',afterLoad){
 if(state.loading)return;
 state.loading=true;
 render();
 try{await load(module,targetId);afterLoad?.();}finally{state.loading=false;render();}
}
async function action(work,module='users',targetId='',successNotice='Tudo certo! Alteração salva.'){if(state.loading)return;state.loading=true;render();try{await work();if(module==='accounts')state.accountsLoaded=false;if(module==='portfolio')state.templatesLoaded=false;await load(module,targetId);state.notice={text:successNotice,type:'success'};}catch(e){state.notice={text:e.message,type:'error'};}finally{state.loading=false;render();}}
function showInitialPasswordDialog(account,password){
 const dialog=document.createElement('dialog');
 dialog.className='initial-password-dialog';
 dialog.setAttribute('aria-labelledby','initial-password-title');
 dialog.innerHTML='<span class="eyebrow">ACESSO CRIADO</span><h2 id="initial-password-title">Senha de primeiro acesso</h2><p data-initial-password-account></p><label for="initial-account-password">Senha inicial</label><input id="initial-account-password" type="text" readonly autocomplete="off"><p class="initial-password-dialog__hint">Use esta senha no primeiro acesso. Em seguida, o usuário deverá cadastrar uma senha pessoal com pelo menos 8 caracteres.</p><div class="initial-password-dialog__actions"><button type="button" class="saude-btn saude-btn--primary" data-copy-initial-password>Copiar senha</button><button type="button" class="saude-btn" data-close-initial-password>Fechar</button></div>';
 dialog.querySelector('[data-initial-password-account]').textContent='Senha padrão da conta de '+account.name+'.';
 const input=dialog.querySelector('#initial-account-password');
 input.value=password;
 const copyButton=dialog.querySelector('[data-copy-initial-password]');
 copyButton.addEventListener('click',async()=>{
  try{
   await navigator.clipboard.writeText(password);
   copyButton.textContent='Senha copiada';
  }catch{
   input.select();
   copyButton.textContent='Selecione e copie';
  }
 });
 dialog.querySelector('[data-close-initial-password]').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 document.body.append(dialog);
 dialog.showModal();
 copyButton.focus();
}
async function createAccount(payload){
 try{
  const result=await request('/api/auth?resource=accounts',{method:'POST',body:JSON.stringify(payload)});
  state.accountsLoaded=false;
  await load('accounts');
  state.notice={text:'Conta criada. Informe ao usuário a senha de primeiro acesso.',type:'success'};
  render();
  showInitialPasswordDialog(result.account,result.initialPassword);
 }catch(error){
  state.notice={text:error.message,type:'error'};
  render();
 }
}
function render(){if(!state.user)return auth();if(state.user.must_change_password)return passwordChange();renderSaudeContent(app,{state,
 onNavigate:navigate,
 onLogout:logout,
 onCreateAccount:payload=>createAccount(payload),
 onAccountAccess:(id,access)=>action(()=>request('/api/auth?resource=account-access',{method:'PATCH',body:JSON.stringify({id,access})}),'accounts','',access?'Acesso liberado.':'Acesso bloqueado.'),
 onEditAccount:payload=>action(async()=>{const result=await request('/api/auth?resource=accounts',{method:'PATCH',body:JSON.stringify(payload)});if(result.account.id===state.user.id)state.user=result.account;},'accounts','','Conta atualizada.'),
 onDeleteAccount:id=>action(()=>request('/api/auth?resource=accounts',{method:'DELETE',body:JSON.stringify({id})}),'accounts','','Conta excluída.'),
 onSaveTemplate:payload=>(state.templateDraft=payload,action(()=>mutate('professor-portfolio',payload.id?'PATCH':'POST',payload),'portfolio','',payload.id?'Modelo atualizado.':'Modelo criado.')),
 onDeleteTemplate:id=>action(()=>mutate('professor-portfolio','DELETE',{id}),'portfolio','','Modelo excluído.'),
 onUseTemplate:async id=>{const template=state.templates.find(entry=>entry.id===id);if(!template||state.loading)return;const draft=structuredClone(template);delete draft.id;await navigate('createDiet','',()=>{state.dietDraft=draft;state.dietSourceSelected=true;});},
 onCreateDiet:payload=>(state.dietDraft=payload,action(()=>mutate('professor-dieta','POST',payload),'diets',payload.user_id,'Dieta criada com sucesso.')),
 onEditDiet:payload=>(state.dietDraft=payload,action(()=>mutate('professor-dieta','PATCH',payload),'diets',payload.user_id,'Dieta atualizada.')),
 onDeleteDiet:(id,userId)=>action(()=>mutate('professor-dieta','DELETE',{id,user_id:userId}),'diets',userId,'Dieta excluída.'),
 onWaterGoal:(id,goal,mode='save')=>action(()=>mutate('professor-agua-meta',mode==='delete'?'DELETE':'PATCH',{user_id:id,goal_ml:goal,nome:state.waterGoalName,action:mode}),'monitor',id,mode==='delete'?'Meta de água removida.':'Meta de água salva.'),
 onWaterAmount:amount=>action(()=>mutate('agua-checkin','POST',{amount_ml:amount}),'water','','Consumo registrado!')
 });}
try{state.user=(await request('/api/auth?resource=session')).user;if(!state.user.must_change_password)await load(initialModule());render();}catch{auth();}
