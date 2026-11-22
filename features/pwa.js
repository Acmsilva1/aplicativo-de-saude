import appInfo from '../package.json';

function showConnectionStatus(){
 let banner=document.querySelector('#connection-status');
 if(!banner){banner=document.createElement('div');banner.id='connection-status';banner.className='connection-status';banner.setAttribute('role','status');document.body.append(banner);}
 banner.hidden=navigator.onLine;
 banner.textContent='Sem conexão. Reconecte para entrar, consultar ou salvar seus dados.';
}
window.addEventListener('online',showConnectionStatus);
window.addEventListener('offline',showConnectionStatus);
window.addEventListener('pageshow',showConnectionStatus);
window.addEventListener('focus',showConnectionStatus);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)showConnectionStatus();});
showConnectionStatus();

function isStandalone() {
 return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function isAppleManualInstallBrowser() {
 const ua=navigator.userAgent;
 const isiOS=/iPad|iPhone|iPod/.test(ua) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
 const isSafari=/Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
 return isiOS || (isSafari && /Macintosh/.test(ua));
}

function showInstallHelp() {
 const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
 const instructions=isIOS
  ? 'No menu Compartilhar do navegador, escolha “Adicionar à Tela de Início” e confirme em Adicionar.'
  : 'No Safari, abra o menu Arquivo e escolha “Adicionar ao Dock”.';
 const dialog=document.createElement('dialog');
 dialog.className='pwa-install-help';
 dialog.setAttribute('aria-labelledby','pwa-install-title');
 dialog.innerHTML=`<h2 id="pwa-install-title">Instale o Ritmo Saúde</h2><p></p><button type="button" class="button button--primary">Entendi</button>`;
 dialog.querySelector('p').textContent=instructions;
 document.body.append(dialog);
 dialog.querySelector('button').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 dialog.showModal();
 dialog.querySelector('button').focus();
}

function setupInstallPrompt() {
 if (isStandalone()) return;
 const button=document.createElement('button');
 button.type='button';
 button.id='pwa-install-button';
 button.className='pwa-install-button';
 button.innerHTML='<svg class="pwa-install-button__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M5 15.5v4A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-4"/></svg><span class="pwa-install-button__tag">APP</span>';
 const setInstallLabel=(label)=>button.setAttribute('aria-label',label+' Ritmo Saúde');
 const placeButton=()=>{
  const header=document.querySelector('.app-header');
  if(header){
   if(button.parentElement!==header)header.insertBefore(button,header.querySelector('.header-account'));
   button.classList.add('pwa-install-button--header');
  }else{
   if(button.parentElement!==document.body)document.body.append(button);
   button.classList.remove('pwa-install-button--header');
  }
 };
 setInstallLabel(isAppleManualInstallBrowser()?'Como instalar':'Instalar aplicativo');
 button.hidden=!isAppleManualInstallBrowser();
 placeButton();
 const appRoot=document.querySelector('#app');
 if(appRoot)new MutationObserver(placeButton).observe(appRoot,{childList:true,subtree:true});

 let installPrompt=null;
 window.addEventListener('beforeinstallprompt',(event)=>{
  event.preventDefault();
  installPrompt=event;
  button.hidden=false;
   setInstallLabel('Instalar aplicativo');
 });
 button.addEventListener('click',async()=>{
  if(!installPrompt){showInstallHelp();return;}
  await installPrompt.prompt();
  const choice=await installPrompt.userChoice;
  if(choice.outcome==='accepted')button.hidden=true;
  installPrompt=null;
 });
 window.addEventListener('appinstalled',()=>{button.hidden=true;installPrompt=null;});
}

if(import.meta.env.PROD && 'serviceWorker' in navigator){
 setupInstallPrompt();
 window.addEventListener('load',()=>{
  navigator.serviceWorker.register('/sw.js',{scope:'/'})
   .then(()=>navigator.serviceWorker.ready)
   .then(registration=>{
    document.documentElement.dataset.pwaState=registration.active?.state || 'registered';
    document.documentElement.dataset.pwaScope=registration.scope;
    document.documentElement.dataset.appVersion=appInfo.version;
    let updateNotice=null;
    let reloadAfterUpdate=false;
    const showUpdateNotice=()=>{
     if(!registration.waiting||!navigator.serviceWorker.controller||updateNotice)return;
     updateNotice=document.createElement('aside');
     updateNotice.className='pwa-update-notice';
     updateNotice.setAttribute('role','status');
     updateNotice.setAttribute('aria-live','polite');
     updateNotice.innerHTML='<div class="pwa-update-notice__copy"><strong>Atualização disponível</strong><span></span></div><div class="pwa-update-notice__actions"><button class="pwa-update-notice__update" type="button">Atualizar</button><button class="pwa-update-notice__later" type="button">Depois</button></div>';
     updateNotice.querySelector('.pwa-update-notice__copy span').textContent='Versão '+appInfo.version+' do Ritmo Saúde. Atualize para continuar.';
     const updateButton=updateNotice.querySelector('.pwa-update-notice__update');
     updateButton.addEventListener('click',()=>{
      reloadAfterUpdate=true;
      updateButton.disabled=true;
      updateButton.textContent='Atualizando…';
      registration.waiting?.postMessage({type:'SKIP_WAITING'});
     });
     updateNotice.querySelector('.pwa-update-notice__later').addEventListener('click',()=>{
      updateNotice.remove();
      updateNotice=null;
     });
     document.body.append(updateNotice);
    };
    registration.addEventListener('updatefound',()=>{
     const installing=registration.installing;
     installing?.addEventListener('statechange',()=>{
      if(installing.state==='installed')showUpdateNotice();
     });
    });
    if(registration.waiting)showUpdateNotice();
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
     if(!reloadAfterUpdate)return;
     reloadAfterUpdate=false;
     window.location.reload();
    });
    const checkForUpdate=()=>registration.update().catch(()=>{});
    window.addEventListener('focus',checkForUpdate);
    window.setInterval(checkForUpdate,60*60*1000);
   })
   .catch(()=>{document.documentElement.dataset.pwaState='unavailable';console.warn('Não foi possível ativar os recursos offline.');});
 });
}
