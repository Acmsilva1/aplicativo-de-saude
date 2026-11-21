function showConnectionStatus(){
 let banner=document.querySelector('#connection-status');
 if(!banner){banner=document.createElement('div');banner.id='connection-status';banner.className='connection-status';banner.setAttribute('role','status');document.body.append(banner);}
 banner.hidden=navigator.onLine;
 banner.textContent='Sem conexão. Reconecte para entrar, consultar ou salvar seus dados.';
}
window.addEventListener('online',showConnectionStatus);
window.addEventListener('offline',showConnectionStatus);
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
 setInstallLabel(isAppleManualInstallBrowser()?'Como instalar':'Instalar aplicativo');
 button.hidden=!isAppleManualInstallBrowser();
 document.body.append(button);

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
   })
   .catch(()=>{document.documentElement.dataset.pwaState='unavailable';console.warn('Não foi possível ativar os recursos offline.');});
 });
}
