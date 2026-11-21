import { showToast } from '../saude/service/uiConfirmation.js';

export function renderPasswordChange(container,{user,error='',onSubmit,onLogout}){
 const shell=document.createElement('main');shell.className='password-change-shell';
 const card=document.createElement('section');card.className='password-change-card';
 const heading=document.createElement('h1');heading.textContent=`Olá, ${user.name}!`;
 const description=document.createElement('p');description.textContent='Para proteger seu acesso, escolha sua senha pessoal antes de continuar.';
 card.append(heading,description);
 if(error) showToast(error,{type:'error'});
 const form=document.createElement('form');
 form.innerHTML='<label for="new-password">Nova senha</label><input id="new-password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="80" required><small>Use de 8 a 80 caracteres.</small><label for="confirm-password">Confirme a nova senha</label><input id="confirm-password" name="confirmation" type="password" autocomplete="new-password" minlength="8" maxlength="80" required><button type="submit" class="button button--primary">Salvar senha e continuar</button>';
 form.addEventListener('submit',async e=>{e.preventDefault();const values=new FormData(form);const confirm=form.elements.namedItem('confirmation');confirm.setCustomValidity(values.get('password')===values.get('confirmation')?'':'As senhas precisam ser iguais.');if(!form.reportValidity())return;const button=form.querySelector('button');button.disabled=true;try{await onSubmit(String(values.get('password')));}finally{button.disabled=false;}});
 form.elements.namedItem('confirmation').addEventListener('input',()=>form.elements.namedItem('confirmation').setCustomValidity(''));
 const logout=document.createElement('button');logout.type='button';logout.className='button';logout.textContent='Sair';logout.addEventListener('click',onLogout);
 card.append(form,logout);shell.append(card);container.replaceChildren(shell);
}
export function showWelcome(user){
 const overlay=document.createElement('div');overlay.className='login-welcome';overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');
 const card=document.createElement('div');const mark=document.createElement('span');mark.className='welcome-heart';mark.textContent='♥';mark.setAttribute('aria-hidden','true');
 const heading=document.createElement('h1');heading.textContent=`Boas-vindas, ${user.name}!`;
 const text=document.createElement('p');text.textContent='Que bom ter você por aqui. Estamos preparando seu espaço.';
 card.append(mark,heading,text);overlay.append(card);document.body.append(overlay);
 const app=document.querySelector('#app');app?.setAttribute('inert','');app?.setAttribute('aria-busy','true');
 return ()=>{overlay.remove();app?.removeAttribute('inert');app?.removeAttribute('aria-busy');};
}
