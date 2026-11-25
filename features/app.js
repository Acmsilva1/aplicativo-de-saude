import '../styles/saude.css';
import './pwa.js';
import { createBackgroundSaves } from './backgroundSaves.js';
import { renderLogin } from './auth/index.js';
import { renderSaudeContent } from './saude/index.js';
import { renderPasswordChange, renderInvitePassword, renderBiometricUnlock, renderTrialExpired, showWelcome, showBusyStatus } from './auth/firstAccess.js';
import {
  assertBiometric,
  clearBiometricPreference,
  enrollBiometric,
  hasDeclinedBiometricOffer,
  hasSavedDeviceUser,
  markBiometricOfferDeclined,
  persistBiometricLogin,
  readBiometricPreference,
  revokeBiometric,
  supportsPlatformAuth,
} from './auth/biometric.js';
import { confirmAction } from './saude/service/uiConfirmation.js';
import {
  clearDietCacheForUser,
  dietsHaveStructure,
  hydrateDietsFromCache,
  writeDietsCache,
} from './saude/data/dietCache.js';
const app=document.querySelector('#app');
const state={user:null,module:'users',loading:false,loadingTitle:'',loadingDetail:'',moduleError:'',accounts:[],accountsLoaded:false,metrics:null,profiles:[],profilesLoaded:false,diets:[],diet:null,water:null,monitor:null,selectedUserId:'',templates:[],templatesLoaded:false,template:null,templateDraft:null,dietDraft:null,dietSourceSelected:false,foodItemContext:null,foods:[],foodsLoaded:false,assessments:[],assessment:null,assessmentDraft:null,compareFromId:'',compareToId:'',notice:'',pendingBiometricEnroll:false,pendingBiometricOffer:false,biometricSupported:false};
function beginLoading(title='Aguarde',detail='Carregando…'){
 state.loading=true;state.loadingTitle=title;state.loadingDetail=detail;
}
function endLoading(){
 state.loading=false;state.loadingTitle='';state.loadingDetail='';
}
const emptySessionState={user:null,module:'users',loading:false,loadingTitle:'',loadingDetail:'',accounts:[],accountsLoaded:false,metrics:null,profiles:[],profilesLoaded:false,diets:[],diet:null,water:null,monitor:null,selectedUserId:'',templates:[],templatesLoaded:false,template:null,templateDraft:null,dietDraft:null,dietSourceSelected:false,foodItemContext:null,foods:[],foodsLoaded:false,assessments:[],assessment:null,assessmentDraft:null,compareFromId:'',compareToId:'',notice:'',pendingBiometricEnroll:false,pendingBiometricOffer:false};
let forcePasswordLogin=false;
const INVITE_TOKENS_KEY='ritmo_invite_tokens';
function storeInviteTokens(tokens){
 try{sessionStorage.setItem(INVITE_TOKENS_KEY,JSON.stringify(tokens));}catch{/* private mode */}
}
function loadInviteTokens(){
 try{
  const raw=sessionStorage.getItem(INVITE_TOKENS_KEY);
  if(!raw)return null;
  const parsed=JSON.parse(raw);
  return parsed?.access_token?parsed:null;
 }catch{return null;}
}
function clearInviteTokens(){
 try{sessionStorage.removeItem(INVITE_TOKENS_KEY);}catch{/* ignore */}
}
function readAuthRedirect(){
 const hash=new URLSearchParams(String(location.hash||'').replace(/^#/,''));
 const query=new URLSearchParams(location.search);
 const get=key=>hash.get(key)||query.get(key);
 const access_token=get('access_token');
 const type=String(get('type')||'');
 if(access_token&&(['invite','recovery','signup','magiclink'].includes(type)||get('refresh_token'))){
  const tokens={access_token,refresh_token:get('refresh_token')||'',type:type||'invite'};
  storeInviteTokens(tokens);
  return tokens;
 }
 return loadInviteTokens();
}
function clearAuthRedirect(){
 if(location.hash||/(access_token|type=|refresh_token)/.test(location.search))history.replaceState({},'',location.pathname);
}
async function request(url,options={}){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),20000);
 try{
  const r=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options,signal:controller.signal});
  const data=await r.json();
  if(!r.ok){
   const err=Error(data.error||'Ação indisponível.');
   if(data.code)err.code=data.code;
   throw err;
  }
  return data;
 }catch(error){
  if(controller.signal.aborted)throw Error('O servidor demorou para responder. Confira sua conexão e consulte os dados antes de tentar novamente.');
  throw error;
 }finally{clearTimeout(timeout);}
}
const mutate=(resource,method,body)=>request(`/api/saude?resource=${resource}`,{method,body:JSON.stringify(body)});
function syncBackgroundSaveStatus(pending){
 const wrap=app.querySelector('.content-wrap');
 if(!wrap)return;
 let status=wrap.querySelector('.background-save-status');
 if(pending){
  if(!status){
   status=document.createElement('div');
   status.className='background-save-status';
   status.setAttribute('role','status');
   status.setAttribute('aria-live','polite');
   status.textContent='Salvando alterações…';
   wrap.prepend(status);
  }
 }else status?.remove();
}
const saves=createBackgroundSaves(({settled})=>{
 state.pendingSaves=saves.pending;
 const sameModule=app.dataset.module===state.module;
 const form=sameModule?app.querySelector('form'):null;
 const preserveUi=sameModule?app.querySelector('[data-preserve-ui]'):null;
 // A completion must not replace a form the user has started typing in.
 if(settled&&form){
  const forms=[...app.querySelectorAll('form')];
  const focused=document.activeElement;
  render();
  app.querySelectorAll('form').forEach((formEl,index)=>{if(forms[index])formEl.replaceWith(forms[index]);});
  if(focused&&forms.some(formEl=>formEl.contains(focused)))focused.focus({preventScroll:true});
 }else if(preserveUi){
  // Modal sem <form> (ex.: escolha de modelo da dieta): não remonta a UI.
  syncBackgroundSaveStatus(saves.pending);
 }else render();
});
window.addEventListener('beforeunload',event=>{
 if(waterBuffer?.parts?.length)flushWaterBuffer();
 if(saves.pending||waterBuffer?.parts?.length){event.preventDefault();event.returnValue='';}
});
function saved(text){state.notice={text,type:'success'};}
function failed(error){state.notice={text:`Não foi possível confirmar o salvamento: ${error.message} A tela voltou ao último estado confirmado.`,type:'error'};}
function savePlan(payload,{template=false,remove=false,visibility=false}={}){
 const field=template?'templates':'diets';
 const userId=payload.user_id||state.selectedUserId;
 if(String(payload.id||'').startsWith('pending-'))return;
 const id=payload.id||`pending-${crypto.randomUUID()}`;
 const prior=state[field].find(item=>item.id===id);
 const changes=structuredClone(payload);
 const local={...changes,id,visible_to_student:changes.visible_to_student??false};
 // Patch only fields changed by this operation: a later status toggle must not
 // reintroduce a failed edit captured from an optimistic snapshot.
 const project=(list)=>remove?list.filter(item=>item.id!==id):prior?list.map(item=>item.id===id?{...item,...changes}:item):[...list,local];
 const draft=structuredClone(payload);
 const target=template?'portfolio':'diets';
 state.module=target;state.dietDraft=null;state.templateDraft=null;state.foodItemContext=null;
 const write=list=>{if(template||state.selectedUserId===userId){state[field]=list;if(!template)state.diet=list.find(item=>item.id===state.diet?.id)||null;}};
 return saves.save({key:`${field}:${template?'all':userId}`,read:()=>state[field],write,project,
  persist:()=>mutate(template?'professor-portfolio':'professor-dieta',remove?'DELETE':payload.id?'PATCH':'POST',payload),
  confirm:(list,result)=>remove?project(list):project(list).map(item=>item.id===id?{...item,...(template?result.template:result)}:item),
  success:()=>{
   state.profilesLoaded=false;
   if(!template&&userId)clearDietCacheForUser(userId);
   saved(remove?'Remoção salva.':visibility?'Status da dieta salvo.':'Plano salvo.');
  },
  failure:error=>{failed(error);if(!remove&&!visibility&&state.module===target&&(template||state.selectedUserId===userId)){
   state.module=template?(payload.id?'editTemplate':'createTemplate'):(payload.id?'editDiet':'createDiet');
   state[template?'templateDraft':'dietDraft']=draft;
   state[template?'template':'diet']=prior||null;state.dietSourceSelected=true;
  }},
 });
}
const WATER_DEBOUNCE_MS=1200;
let waterBuffer=null;
function applyWaterParts(base,parts){
 let next=structuredClone(base);
 for(const part of parts){
  next={
   ...next,
   total_ml:Number(next.total_ml||0)+part.amount,
   checkins:[...(next.checkins||[]),{id:`pending-${part.requestId}`,amount_ml:part.amount,time:part.time}],
  };
 }
 return next;
}
function publishWaterBuffer(){
 if(!waterBuffer||!state.water)return;
 state.water=applyWaterParts(waterBuffer.base,waterBuffer.parts);
 if(app.querySelector('[data-preserve-ui]'))syncBackgroundSaveStatus(true);
 else render();
}
function flushWaterBuffer(){
 const buf=waterBuffer;
 waterBuffer=null;
 if(!buf?.parts?.length)return Promise.resolve();
 clearTimeout(buf.timer);
 // Devolve ao base para o lane projetar sem duplicar o otimista do debounce.
 state.water=structuredClone(buf.base);
 return saves.save({
  key:'water',
  read:()=>state.water,
  write:value=>{state.water=value;},
  project:value=>applyWaterParts(value,buf.parts),
  persist:async()=>{
   let last;
   for(const part of buf.parts){
    last=await mutate('agua-checkin','POST',{amount_ml:part.amount,request_id:part.requestId});
   }
   return last;
  },
  confirm:(_base,result)=>result,
  success:()=>saved(buf.parts.length>1?'Consumos salvos.':'Consumo salvo.'),
  failure:failed,
 });
}
function saveWater(amount){
 if(!state.water?.goal_ml){
  state.notice={text:'Defina uma meta de água antes de registrar o consumo.',type:'error'};
  render();
  return;
 }
 const part={
  amount,
  requestId:crypto.randomUUID(),
  time:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),
 };
 if(!waterBuffer){
  waterBuffer={base:structuredClone(state.water),parts:[],timer:null};
 }
 waterBuffer.parts.push(part);
 publishWaterBuffer();
 clearTimeout(waterBuffer.timer);
 waterBuffer.timer=setTimeout(()=>{flushWaterBuffer();},WATER_DEBOUNCE_MS);
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
function isCancelBiometricError(error){
 const message=String(error?.message||'');
 return /not allowed|abort|cancel|denied|notallowederror/i.test(message)||error?.name==='NotAllowedError';
}
function rememberBiometricUser(credentialId){
 persistBiometricLogin(state.user.id,credentialId,state.user);
}
async function reuseExistingBiometricCredential(){
 const pref=readBiometricPreference();
 if(pref?.credentialId&&String(pref.userId)===String(state.user.id)){
  rememberBiometricUser(pref.credentialId);
  return pref.credentialId;
 }
 if(pref?.credentialId&&!pref.userId){
  rememberBiometricUser(pref.credentialId);
  return pref.credentialId;
 }
 try{
  const listed=await request('/api/auth?resource=webauthn-credentials');
  const existing=listed?.credentials?.[0]?.credentialId;
  if(existing){
   rememberBiometricUser(existing);
   return existing;
  }
 }catch{
  /* sem credencial no servidor — segue para cadastro único */
 }
 return '';
}
async function activateBiometricForCurrentUser({busyTitle='Ativando biometria',busyDetail='Confirme a digital ou o Face ID…'}={}){
 if(!state.user||!state.biometricSupported||state.user.must_change_password)return false;
 // Já existe chave neste aparelho/conta: só marca como login principal (nunca cria de novo).
 const reused=await reuseExistingBiometricCredential();
 if(reused){
  state.notice={text:'Biometria pronta neste aparelho.',type:'success'};
  return true;
 }
 const dismiss=showBusyStatus({title:busyTitle,detail:busyDetail});
 try{
  const result=await enrollBiometric(request);
  rememberBiometricUser(result.credentialId);
  state.notice={text:'Biometria ativada neste aparelho.',type:'success'};
  return true;
 }catch(error){
  if(isCancelBiometricError(error)){
   state.notice={text:'Biometria não ativada. Você pode ligar no próximo login.',type:'error'};
   return false;
  }
  state.notice={text:error?.message||'Não foi possível ativar a biometria.',type:'error'};
  return false;
 }finally{
  dismiss();
 }
}
async function maybeOfferBiometric(){
 if(!state.pendingBiometricOffer||!state.user||state.user.must_change_password)return;
 state.pendingBiometricOffer=false;
 if(!state.biometricSupported)return;
 const pref=readBiometricPreference();
 // Já vinculada neste aparelho → nunca pergunta de novo.
 if(pref?.credentialId&&String(pref.userId)===String(state.user.id)&&pref.preferred!==false)return;
 const flagOn=state.user.biometria_habilitada===true;
 if(flagOn){
  // Flag ativa sem credencial local (celular novo / reinstalação): oferece recadastro.
  const accepted=await confirmAction(
   'Sua conta já usa biometria. Cadastre a digital ou o Face ID neste aparelho para entrar sem digitar senha.',
   {title:'Recadastrar digital neste aparelho?',confirmLabel:'Cadastrar agora',tone:'primary'},
  );
  if(accepted)await activateBiometricForCurrentUser();
  return;
 }
 // Primeiro cadastro: só pergunta se a flag ainda não está ativa.
 if(hasDeclinedBiometricOffer(state.user.id))return;
 const accepted=await confirmAction(
  'Nos próximos acessos (ao sair ou expirar a sessão) você entra só com a digital ou o Face ID — sem digitar e-mail e senha.',
  {title:'Usar digital ou Face ID?',confirmLabel:'Ativar biometria',tone:'primary'},
 );
 if(!accepted){
  markBiometricOfferDeclined(state.user.id);
  return;
 }
 await activateBiometricForCurrentUser();
}
async function enter(){
 const dismiss=showWelcome(state.user);
 try{
  if(state.user.trial_expired){
   render();
   return;
  }
  if(!state.user.must_change_password){
   beginLoading('Abrindo sua área','Carregando os dados…');
   render();
   await maybeOfferBiometric();
   await load(initialModule());
   endLoading();
  }
  render();
 }finally{endLoading();dismiss();}
}
async function logout(){
 if(state.loading)return;
 const inApp=Boolean(state.user&&!state.user.must_change_password&&!state.user.trial_expired);
 let dismiss=()=>{};
 if(inApp){
  beginLoading('Saindo','Encerrando sua sessão…');
  render();
 }else{
  dismiss=showBusyStatus({title:'Saindo',detail:'Encerrando sua sessão…'});
 }
 try{
  await flushWaterBuffer();
  await saves.idle();
  const previousUserId=state.user?.id;
  // Garante nome/e-mail do usuário prioritário antes de derrubar a sessão.
  const pref=readBiometricPreference();
  if(pref?.credentialId&&state.user&&String(pref.userId||previousUserId)===String(state.user.id)){
   rememberBiometricUser(pref.credentialId);
  }
  await request('/api/auth?resource=logout',{method:'POST',body:'{}'});
  if(previousUserId)clearDietCacheForUser(previousUserId);
  Object.assign(state,{...emptySessionState});
  forcePasswordLogin=false;
  endLoading();
  dismiss();
  // Credencial local + digital disponível no SO → tela da biometria.
  // Se a digital/Face ID estiver desligada no aparelho → fallback e-mail/senha (flag no banco permanece).
  if(hasSavedDeviceUser()){
   await openBiometricOrPasswordFallback();
   return;
  }
  await bootAuth();
}catch(error){
  endLoading();
  dismiss();
  state.notice={text:error.message||'Não foi possível sair. Tente novamente.',type:'error'};
  if(state.user?.must_change_password)passwordChange(error.message);
  else if(state.user?.trial_expired)renderTrialExpired(app,{user:state.user,onLogout:logout});
  else render();
 }
}
function passwordChange(error=''){renderPasswordChange(app,{user:state.user,error,onLogout:logout,onSubmit:async password=>{state.user=(await request('/api/auth?resource=change-password',{method:'POST',body:JSON.stringify({password})})).user;await enter();}});}
function trialExpired(){renderTrialExpired(app,{user:state.user,onLogout:logout});}
function decideBiometricOfferAfterPasswordLogin(){
 const pref=readBiometricPreference();
 const alreadyBound=pref?.credentialId&&String(pref.userId)===String(state.user.id)&&pref.preferred!==false;
 if(alreadyBound){
  rememberBiometricUser(pref.credentialId);
  state.pendingBiometricOffer=false;
  return;
 }
 // Sem autenticador no aparelho (digital/Face ID desligado) → só senha; flag no banco não muda.
 if(!state.biometricSupported||state.user.must_change_password){
  state.pendingBiometricOffer=false;
  return;
 }
 const flagOn=state.user.biometria_habilitada===true;
 // Flag off → oferta de 1º cadastro (respeita "não, obrigado").
 // Flag on sem local → oferta de recadastro neste aparelho.
 if(flagOn){
  state.pendingBiometricOffer=true;
  return;
 }
 state.pendingBiometricOffer=!hasDeclinedBiometricOffer(state.user.id);
}
function passwordFallbackAuth(error=''){
 const pref=readBiometricPreference();
 forcePasswordLogin=true;
 auth(error,{prefillEmail:pref?.userEmail||''});
}
async function openBiometricOrPasswordFallback(error=''){
 state.biometricSupported=await supportsPlatformAuth();
 if(state.biometricSupported&&hasSavedDeviceUser()){
  openDeviceUserGate(error);
  return;
 }
 // Digital/Face ID indisponível no SO → login e senha; vínculo no banco permanece.
 passwordFallbackAuth(error||'Digital ou Face ID indisponível neste aparelho. Entre com e-mail e senha.');
}
function auth(error='',{prefillEmail=''}={}){renderLogin(app,{
 error,
 prefillEmail,
 onKnownDeviceUser:async()=>{
  if(!hasSavedDeviceUser())return;
  state.biometricSupported=await supportsPlatformAuth();
  if(!state.biometricSupported)return; // fica no formulário de senha
  openDeviceUserGate();
 },
 onLogin:async({email,password})=>{
  state.user=(await request('/api/auth?resource=login',{method:'POST',body:JSON.stringify({email,password})})).user;
  state.pendingBiometricEnroll=false;
  decideBiometricOfferAfterPasswordLogin();
  forcePasswordLogin=false;
  await enter();
 },
});}
function openDeviceUserGate(error=''){
 biometricAuth(error);
}
function biometricAuth(error=''){
 const pref=readBiometricPreference();
 renderBiometricUnlock(app,{
  error,
  autoStart:true,
  userName:pref?.userName||'',
  userEmail:pref?.userEmail||'',
  onUsePassword:()=>{
   // Fallback senha sem apagar a digital local nem a flag no banco.
   passwordFallbackAuth();
  },
  onChangeUser:()=>{
   // Mantém a credencial local: ao digitar o mesmo e-mail de novo, volta à digital (se o SO permitir).
   forcePasswordLogin=true;
   auth();
  },
  onUnlock:async()=>{
   const credentialId=readBiometricPreference()?.credentialId||pref?.credentialId;
   if(!credentialId)throw Error('Ative a biometria pelo login com senha.');
   try{
    state.user=(await assertBiometric(request,credentialId)).user;
    rememberBiometricUser(credentialId);
   }catch(cause){
    if(/não encontrada|nao encontrada|indisponível|indisponivel/i.test(String(cause?.message||''))){
     clearBiometricPreference();
    }
    // Autenticador desligado/cancelado: deixa usar "Entrar com senha" sem perder o vínculo.
    if(isCancelBiometricError(cause)){
     throw Error('Biometria indisponível ou cancelada. Use Entrar com senha.');
    }
    throw cause;
   }
   forcePasswordLogin=false;
   await enter();
  },
 });
}
function invitePassword(tokens,error=''){
 renderInvitePassword(app,{error,onCancel:()=>{clearAuthRedirect();clearInviteTokens();auth();},onSubmit:async password=>{
  state.user=(await request('/api/auth?resource=complete-invite',{method:'POST',body:JSON.stringify({...tokens,password})})).user;
  clearAuthRedirect();
  clearInviteTokens();
  await enter();
 }});
}
async function bootAuth(){
 const dismiss=showBusyStatus({title:'Carregando',detail:'Verificando sua sessão…'});
 try{
  state.biometricSupported=await supportsPlatformAuth();
  try{
   // Sessão ainda ativa → entra direto, sem pedir biometria de novo.
   state.user=(await request('/api/auth?resource=session')).user;
   if(state.user.trial_expired){
    dismiss();
    render();
    return;
   }
   if(!state.user.must_change_password){
    beginLoading('Abrindo sua área','Carregando os dados…');
    dismiss();
    try{
     render();
     await load(initialModule());
    }finally{endLoading();}
   }else dismiss();
   render();
  }catch{
   endLoading();
   dismiss();
   // Sem sessão: tenta digital se houver credencial local e autenticador no SO; senão senha.
   if(!forcePasswordLogin&&hasSavedDeviceUser()){
    await openBiometricOrPasswordFallback();
    return;
   }
   auth();
  }
 }catch{
  endLoading();
  dismiss();
  if(!forcePasswordLogin&&hasSavedDeviceUser()){
   await openBiometricOrPasswordFallback();
   return;
  }
  auth();
 }
}
async function load(module,targetId=''){
 const userId=['diet-detail','editDiet'].includes(module)?state.selectedUserId:(targetId||state.selectedUserId);
 await flushWaterBuffer();
 if(['home','users'].includes(module))await saves.idle();
 else if(['diets','diet-detail','editDiet'].includes(module))await saves.idle([`diets:${userId}`]);
 else if(module==='monitor')await saves.idle([`goal:${userId}`]);
 else if(module==='water')await saves.idle(['water']);
 else if(['portfolio','template-detail','editTemplate','createDiet'].includes(module))await saves.idle(['templates:all']);
 else if(['assessments','assessment-detail','createAssessment','editAssessment','compareAssessments'].includes(module))await saves.idle([`assessments:${userId}`]);
 const previousModule=state.module;state.module=module;state.notice='';state.moduleError='';
 state.foodItemContext=null;
 if(module!==previousModule){state.dietDraft=null;state.templateDraft=null;state.dietSourceSelected=false;if(!['editAssessment','createAssessment'].includes(module))state.assessmentDraft=null;}
 if(targetId && !['diet-detail','editDiet','template-detail','editTemplate','assessment-detail'].includes(module))state.selectedUserId=targetId;
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
   const needTemplates=['home','portfolio','template-detail','editTemplate','createDiet'].includes(module);
   const needFoods=['diet-detail','editDiet','createDiet','template-detail','editTemplate','createTemplate'].includes(module);
   const [profileData,templateData,foodData]=await Promise.all([
    refreshProfiles?request('/api/saude?resource=professor-users'):Promise.resolve({users:state.profiles}),
    !needTemplates||state.templatesLoaded?Promise.resolve({templates:state.templates}):request('/api/saude?resource=professor-portfolio'),
    !needFoods||state.foodsLoaded?Promise.resolve({foods:state.foods}):request('/api/saude?resource=professor-alimentos'),
   ]);
   state.profiles=profileData.users;
   state.templates=templateData.templates;
   state.foods=foodData.foods;
   state.profilesLoaded=true;
   if(needTemplates)state.templatesLoaded=true;
   if(needFoods)state.foodsLoaded=true;
   if(!state.profiles.some(profile=>profile.id===state.selectedUserId))state.selectedUserId=state.profiles[0]?.id||'';
   if(['template-detail','editTemplate'].includes(module))state.template=state.templates.find(template=>template.id===(targetId||state.template?.id))||null;
   if(module==='createTemplate')state.template=null;
   const requests=[];
   if(module==='monitor')requests.push(request(`/api/saude?resource=professor-agua&user_id=${encodeURIComponent(state.selectedUserId)}`).then(data=>{state.monitor=data;}));
   if(['assessments','assessment-detail','createAssessment','editAssessment','compareAssessments'].includes(module)){
    requests.push(request(`/api/saude?resource=professor-avaliacoes&user_id=${encodeURIComponent(state.selectedUserId)}`).then(data=>{
     state.assessments=data.assessments||[];
     if(module==='assessment-detail')state.assessment=state.assessments.find(item=>item.id===state.assessment?.id)||state.assessments[0]||null;
     if(module==='editAssessment')state.assessmentDraft=state.assessmentDraft||state.assessments.find(item=>item.id===state.assessment?.id)||state.assessment||null;
     if(module==='createAssessment')state.assessmentDraft=state.assessmentDraft||null;
     if(module==='compareAssessments' && state.assessments.length>=2){
      const sorted=[...state.assessments].sort((a,b)=>String(a.avaliado_em).localeCompare(String(b.avaliado_em)));
      if(!state.compareFromId)state.compareFromId=sorted[0].id;
      if(!state.compareToId)state.compareToId=sorted[sorted.length-1].id;
     }
    }));
   }
   if(module==='diets'){
    requests.push(request(`/api/saude?resource=professor-dieta&user_id=${encodeURIComponent(state.selectedUserId)}&summary=true`).then(data=>{state.diets=data.diets;}));
   }else if(['diet-detail','editDiet'].includes(module)){
    requests.push((async()=>{
     const ownerId=state.selectedUserId;
     let summaries=state.diets;
     if(!summaries.length||summaries.some(diet=>!diet.updated_at)){
      summaries=(await request(`/api/saude?resource=professor-dieta&user_id=${encodeURIComponent(ownerId)}&summary=true`)).diets;
     }
     const cached=hydrateDietsFromCache(ownerId,summaries);
     if(cached){state.diets=cached;return;}
     const data=await request(`/api/saude?resource=professor-dieta&user_id=${encodeURIComponent(ownerId)}`);
     state.diets=data.diets;
     writeDietsCache(ownerId,state.diets);
    })());
   }
   await Promise.all(requests);
  }else{
   if(module==='home'){
    const [water,diets,assessments]=await Promise.all([
     request('/api/saude?resource=agua'),
     request('/api/saude?resource=dietas'),
     request('/api/saude?resource=avaliacoes').catch(()=>({assessments:[]})),
    ]);
    state.water=water;
    state.diets=diets.diets;
    state.assessments=assessments.assessments||[];
    writeDietsCache(state.user.id,state.diets);
   }else if(module==='water')state.water=await request('/api/saude?resource=agua');
   else if(module==='assessments'||module==='assessment-detail'){
    const data=await request('/api/saude?resource=avaliacoes');
    state.assessments=data.assessments||[];
    if(module==='assessment-detail')state.assessment=state.assessments.find(item=>item.id===state.assessment?.id)||state.assessments[0]||null;
   }else if(module==='diet-detail'){
    const ownerId=state.user.id;
    if(dietsHaveStructure(state.diets)){
     const cached=hydrateDietsFromCache(ownerId,state.diets.map(diet=>({id:diet.id,updated_at:diet.updated_at})));
     if(cached)state.diets=cached;
    }
    // Catálogo nutricional é obrigatório no detalhe; home/lista não trazem foods.
    if(!dietsHaveStructure(state.diets)||!state.foodsLoaded){
     const data=await request('/api/saude?resource=dietas&nutrition=true');
     if(!dietsHaveStructure(state.diets)){
      state.diets=data.diets;
      writeDietsCache(ownerId,state.diets);
     }
     state.foods=data.foods||[];
     state.foodsLoaded=true;
    }
   }else{
    state.diets=(await request('/api/saude?resource=dietas')).diets;
    writeDietsCache(state.user.id,state.diets);
   }
  }
  if(['diet-detail','editDiet'].includes(module))state.diet=state.diets.find(x=>x.id===(targetId||state.diet?.id))||null;
  else if(module==='createDiet'||module==='createTemplate')state.diet=null;
  else state.diet=state.diets[0]||null;
 }catch(e){
  if(e.code==='trial_expired'){
   state.user={...state.user,trial_expired:true,trial_days_remaining:0};
   return;
  }
  state.notice={text:e.message,type:'error'};state.moduleError=e.message;state.diets=[];state.diet=null;state.water=null;state.monitor=null;state.assessments=[];state.assessment=null;
 }
}
async function navigate(module,targetId='',afterLoad){
 if(state.loading)return;
 beginLoading('Abrindo sua área','Carregando os dados…');
 render();
 try{await load(module,targetId);afterLoad?.();}finally{endLoading();render();}
}
async function action(work,module='users',targetId='',successNotice='Tudo certo! Alteração salva.'){
 if(state.loading)return;
 beginLoading('Salvando','Aguarde um instante…');
 render();
 try{
  const result=await work();
  if(module==='accounts')state.accountsLoaded=false;
  if(module==='portfolio')state.templatesLoaded=false;
  if(['diets','monitor','assessments'].includes(module))state.profilesLoaded=false;
  await load(module,targetId);
  state.notice={text:typeof successNotice==='function'?successNotice(result):successNotice,type:'success'};
 }catch(e){state.notice={text:e.message,type:'error'};}
 finally{endLoading();render();}
}
async function copyInviteLink(link){
 if(!link)return false;
 try{await navigator.clipboard.writeText(link);return true;}catch{return false;}
}
async function resendPasswordLink(id){
 if(state.loading)return;
 beginLoading('Enviando link','Preparando o e-mail de senha…');
 render();
 try{
  const result=await request('/api/auth?resource=account-password-link',{method:'POST',body:JSON.stringify({id})});
  state.accounts=state.accounts.map(account=>account.id===id?result.account:account);
  if(result.inviteSent){
   state.notice={text:'Link de senha enviado para o e-mail da conta.',type:'success'};
  }else if(result.inviteLink){
   const copied=await copyInviteLink(result.inviteLink);
   state.notice={text:copied?'E-mail automático falhou. Link de senha copiado — envie manualmente à pessoa.':'E-mail automático falhou. Copie o link de senha retornado e envie manualmente.',type:'success'};
  }else{
   state.notice={text:result.warning||'Não foi possível enviar o link de senha.',type:'error'};
  }
 }catch(error){state.notice={text:error.message,type:'error'};}
 finally{endLoading();render();}
}
async function createAccount(payload){
 if(state.loading)return;
 beginLoading('Criando conta','Enviando o convite por e-mail…');
 render();
 try{
  const result=await request('/api/auth?resource=accounts',{method:'POST',body:JSON.stringify(payload)});
  state.accountsLoaded=false;
  await load('accounts');
  if(result.inviteSent){
   state.notice={text:'Convite enviado para o e-mail. A pessoa define a senha pelo link recebido.',type:'success'};
  }else if(result.inviteLink){
   const copied=await copyInviteLink(result.inviteLink);
   state.notice={text:copied?'Conta criada, mas o e-mail automático falhou. Link de convite copiado — envie manualmente à pessoa.':'Conta criada, mas o e-mail automático falhou. Use o link de convite retornado para enviar manualmente.',type:'success'};
  }else{
   state.notice={text:result.warning||'Conta criada, mas o convite não foi enviado.',type:'error'};
  }
 }catch(error){
  state.notice={text:error.message,type:'error'};
 }finally{endLoading();render();}
}
function render(){if(!state.user)return auth();if(state.user.must_change_password)return passwordChange();if(state.user.trial_expired)return trialExpired();app.dataset.module=state.module;renderSaudeContent(app,{state,
 onNavigate:navigate,
 onLogout:logout,
 onCreateAccount:payload=>createAccount(payload),
 onRegeneratePassword:resendPasswordLink,
 onAccountAccess:(id,access)=>action(()=>request('/api/auth?resource=account-access',{method:'PATCH',body:JSON.stringify({id,access})}),'accounts','',access?'Acesso liberado.':'Acesso bloqueado.'),
 onEditAccount:payload=>action(async()=>{const result=await request('/api/auth?resource=accounts',{method:'PATCH',body:JSON.stringify(payload)});if(result.account.id===state.user.id)state.user=result.account;},'accounts','','Conta atualizada.'),
 onDeleteAccount:id=>action(()=>request('/api/auth?resource=accounts',{method:'DELETE',body:JSON.stringify({id})}),'accounts','',(result)=>result?.unlinkedStudents?`Conta excluída. Alunos ficaram sem professor; reatribua nas contas.`:'Conta excluída.'),
 onSaveAssessment:(payload,userId,assessmentId)=>action(()=>request('/api/saude?resource=professor-avaliacao',{method:assessmentId?'PATCH':'POST',body:JSON.stringify({...payload,user_id:userId,id:assessmentId||undefined})}),'assessments',userId,assessmentId?'Avaliação atualizada.':'Avaliação registrada.'),
 onDeleteAssessment:(assessmentId,userId)=>action(()=>request('/api/saude?resource=professor-avaliacao',{method:'DELETE',body:JSON.stringify({user_id:userId,id:assessmentId})}),'assessments',userId,'Avaliação excluída.'),
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
const inviteTokens=readAuthRedirect();
if(inviteTokens){
 clearAuthRedirect();
 invitePassword(inviteTokens);
}else{
 await bootAuth();
}
