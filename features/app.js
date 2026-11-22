import '../styles/saude.css';
import './pwa.js';
import { createBackgroundSaves } from './backgroundSaves.js';
import { showToast } from './saude/service/uiConfirmation.js';
import { renderLogin } from './auth/index.js';
import { renderSaudeContent } from './saude/index.js';
import { renderPasswordChange, showWelcome } from './auth/firstAccess.js';
const app=document.querySelector('#app');
const state={user:null,module:'users',loading:false,moduleError:'',accounts:[],accountsLoaded:false,metrics:null,profiles:[],profilesLoaded:false,diets:[],diet:null,water:null,monitor:null,selectedUserId:'',templates:[],templatesLoaded:false,template:null,templateDraft:null,dietDraft:null,dietSourceSelected:false,foodItemContext:null,foods:[],foodsLoaded:false,notice:''};
async function request(url,options={}){const r=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options});const data=await r.json();if(!r.ok)throw Error(data.error||'Ação indisponível.');return data;}
const mutate=(resource,method,body)=>request(`/api/saude?resource=${resource}`,{method,body:JSON.stringify(body)});
const saves=createBackgroundSaves(({settled})=>{
 state.pendingSaves=saves.pending;
 // A completion must not replace a form the user has started typing in.
 if(settled&&app.dataset.module===state.module&&app.querySelector('form')){
  const status=app.querySelector('.background-save-status');
  if(status)status.hidden=!saves.pending;
  if(state.notice){showToast(state.notice.text,{type:state.notice.type});state.notice='';}
 }else render();
});
window.addEventListener('beforeunload',event=>{if(saves.pending){event.preventDefault();event.returnValue='';}});
function saved(text){state.notice={text,type:'success'};}
function failed(error){state.notice={text:`Não foi possível confirmar o salvamento: ${error.message} A tela voltou ao último estado confirmado.`,type:'error'};}
function savePlan(payload,{template=false,remove=false,visibility=false}={}){
 const field=template?'templates':'diets';
 const userId=payload.user_id||state.selectedUserId;
 if(String(payload.id||'').startsWith('pending-'))return;
 const id=payload.id||`pending-${crypto.randomUUID()}`;
 const prior=state[field].find(item=>item.id===id);
 const local={...prior,...structuredClone(payload),id,visible_to_student:payload.visible_to_student??prior?.visible_to_student??false};
 const project=(list)=>remove?list.filter(item=>item.id!==id):prior?list.map(item=>item.id===id?{...item,...local}:item):[...list,local];
 const draft=structuredClone(payload);
 const target=template?'portfolio':'diets';
 state.module=target;state.dietDraft=null;state.templateDraft=null;state.foodItemContext=null;
 const write=list=>{if(template||state.selectedUserId===userId){state[field]=list;if(!template)state.diet=list.find(item=>item.id===state.diet?.id)||null;}};
 return saves.save({key:`${field}:${template?'all':userId}`,read:()=>state[field],write,project,
  persist:()=>mutate(template?'professor-portfolio':'professor-dieta',remove?'DELETE':payload.id?'PATCH':'POST',payload),
  confirm:(list,result)=>remove?project(list):project(list).map(item=>item.id===id?{...item,...(template?result.template:result)}:item),
  success:()=>{state.profilesLoaded=false;saved(remove?'Remoção salva.':visibility?'Status da dieta salvo.':'Plano salvo.');},
  failure:error=>{failed(error);if(!remove&&!visibility&&state.module===target&&(template||state.selectedUserId===userId)){
   state.module=template?(payload.id?'editTemplate':'createTemplate'):(payload.id?'editDiet':'createDiet');
   state[template?'templateDraft':'dietDraft']=draft;
   state[template?'template':'diet']=prior||null;state.dietSourceSelected=true;
  }},
 });
}
function saveWater(amount){
 if(!state.water?.goal_ml)return;
 const entry={id:`pending-${crypto.randomUUID()}`,amount_ml:amount,time:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})};
 return saves.save({key:'water',read:()=>state.water,write:value=>{state.water=value;},
  project:value=>({...value,total_ml:Number(value.total_ml||0)+amount,checkins:[...(value.checkins||[]),entry]}),
  persist:()=>mutate('agua-checkin','POST',{amount_ml:amount}),success:()=>saved('Consumo salvo.'),failure:failed});
}
function saveGoal(id,goal,mode){
 const nome=state.waterGoalName;
 return saves.save({key:`goal:${id}`,read:()=>state.monitor.water,
  write:value=>{if(state.monitor?.user?.id===id||state.selectedUserId===id)state.monitor={...state.monitor,water:value};},
  project:value=>({...value,goal_ml:mode==='delete'?0:goal,nome}),
  persist:()=>mutate('professor-agua-meta',mode==='delete'?'DELETE':'PATCH',{user_id:id,goal_ml:goal,nome,action:mode}),
  success:()=>{state.profilesLoaded=false;saved('Meta salva.');},failure:failed});
}
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
async function logout(){await saves.idle();await request('/api/auth?resource=logout',{method:'POST',body:'{}'});Object.assign(state,{user:null,module:'users',loading:false,accounts:[],accountsLoaded:false,metrics:null,profiles:[],profilesLoaded:false,diets:[],diet:null,water:null,monitor:null,selectedUserId:'',templates:[],templatesLoaded:false,template:null,templateDraft:null,dietDraft:null,dietSourceSelected:false,foodItemContext:null,foods:[],foodsLoaded:false,notice:''});auth();}
function passwordChange(error=''){renderPasswordChange(app,{user:state.user,error,onLogout:logout,onSubmit:async password=>{try{state.user=(await request('/api/auth?resource=change-password',{method:'POST',body:JSON.stringify({password})})).user;await enter();}catch(e){passwordChange(e.message);}}});}
function auth(error=''){renderLogin(app,{error,onLogin:async credentials=>{try{state.user=(await request('/api/auth?resource=login',{method:'POST',body:JSON.stringify(credentials)})).user;await enter();}catch(e){auth(e.message);}}});}
async function load(module,targetId=''){
 await saves.idle();
 const previousModule=state.module;state.module=module;state.notice='';state.moduleError='';
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
   const refreshProfiles=!state.profilesLoaded||['home','users'].includes(module);
   const [profileData,templateData,foodData]=await Promise.all([
    refreshProfiles?request('/api/saude?resource=professor-users'):Promise.resolve({users:state.profiles}),
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
   else if(module==='diet-detail'){
    const data=await request('/api/saude?resource=dietas&nutrition=true');
    state.diets=data.diets;
    state.foods=data.foods||[];
   }else state.diets=(await request('/api/saude?resource=dietas')).diets;
  }
  if(['diet-detail','editDiet'].includes(module))state.diet=state.diets.find(x=>x.id===(targetId||state.diet?.id))||null;
  else if(module==='createDiet'||module==='createTemplate')state.diet=null;
  else state.diet=state.diets[0]||null;
 }catch(e){state.notice={text:e.message,type:'error'};state.moduleError=e.message;state.diets=[];state.diet=null;state.water=null;state.monitor=null;}
}
async function navigate(module,targetId='',afterLoad){
 if(state.loading)return;
 state.loading=true;
 render();
 try{await load(module,targetId);afterLoad?.();}finally{state.loading=false;render();}
}
async function action(work,module='users',targetId='',successNotice='Tudo certo! Alteração salva.'){if(state.loading)return;state.loading=true;render();try{await work();if(module==='accounts')state.accountsLoaded=false;if(module==='portfolio')state.templatesLoaded=false;if(['diets','monitor'].includes(module))state.profilesLoaded=false;await load(module,targetId);state.notice={text:successNotice,type:'success'};}catch(e){state.notice={text:e.message,type:'error'};}finally{state.loading=false;render();}}
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
function render(){if(!state.user)return auth();if(state.user.must_change_password)return passwordChange();app.dataset.module=state.module;renderSaudeContent(app,{state,
 onNavigate:navigate,
 onLogout:logout,
 onCreateAccount:payload=>createAccount(payload),
 onAccountAccess:(id,access)=>action(()=>request('/api/auth?resource=account-access',{method:'PATCH',body:JSON.stringify({id,access})}),'accounts','',access?'Acesso liberado.':'Acesso bloqueado.'),
 onEditAccount:payload=>action(async()=>{const result=await request('/api/auth?resource=accounts',{method:'PATCH',body:JSON.stringify(payload)});if(result.account.id===state.user.id)state.user=result.account;},'accounts','','Conta atualizada.'),
 onDeleteAccount:id=>action(()=>request('/api/auth?resource=accounts',{method:'DELETE',body:JSON.stringify({id})}),'accounts','','Conta excluída.'),
 onSaveTemplate:payload=>savePlan(payload,{template:true}),
 onDeleteTemplate:id=>savePlan({id},{template:true,remove:true}),
 onUseTemplate:async id=>{const template=state.templates.find(entry=>entry.id===id);if(!template||state.loading||String(id).startsWith('pending-'))return;const draft=structuredClone(template);delete draft.id;await navigate('createDiet','',()=>{state.dietDraft=draft;state.dietSourceSelected=true;});},
 onCreateDiet:payload=>savePlan(payload),
 onEditDiet:payload=>savePlan(payload),
 onSetDietVisibility:(id,userId,visible)=>savePlan({id,user_id:userId,action:'visibility',visible_to_student:visible},{visibility:true}),
 onDeleteDiet:(id,userId)=>savePlan({id,user_id:userId},{remove:true}),
 onWaterGoal:(id,goal,mode='save')=>saveGoal(id,goal,mode),
 onWaterAmount:saveWater
 });}
try{state.user=(await request('/api/auth?resource=session')).user;if(!state.user.must_change_password)await load(initialModule());render();}catch{auth();}
