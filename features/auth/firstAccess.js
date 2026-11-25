import { formFeedback, authErrorMessage } from './formFeedback.js';
import { isStrongPassword, STRONG_PASSWORD_HINT, STRONG_PASSWORD_ERROR } from '../../lib/passwordPolicy.js';
import { labelWithRequired, requiredLegend } from '../../lib/formRequired.js';

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function bindPasswordForm(form, feedback, { submitLabel, onSubmit }) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedback.clear();
    const password = form.elements.namedItem('password');
    const confirmation = form.elements.namedItem('confirmation');
    if (!isStrongPassword(password.value)) {
      feedback.show(STRONG_PASSWORD_ERROR, password);
      return;
    }
    if (password.value !== confirmation.value) {
      feedback.show('As senhas precisam ser iguais.', confirmation);
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.classList.add('is-busy');
    button.innerHTML = '<span class="button-busy-spinner" aria-hidden="true"></span><span>Salvando senha…</span>';
    form.setAttribute('aria-busy', 'true');
    try {
      await onSubmit(password.value);
    } catch (cause) {
      feedback.show(authErrorMessage(cause));
    } finally {
      button.disabled = false;
      button.classList.remove('is-busy');
      button.textContent = submitLabel;
      form.removeAttribute('aria-busy');
    }
  });
}

function passwordFieldsHtml() {
  return `${requiredLegend()}<label for="new-password">${labelWithRequired('Nova senha', true)}</label><input id="new-password" name="password" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other" minlength="8" maxlength="80" required><small>${STRONG_PASSWORD_HINT}</small><label for="confirm-password">${labelWithRequired('Confirme a nova senha', true)}</label><input id="confirm-password" name="confirmation" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other" minlength="8" maxlength="80" required><button type="submit" class="button button--primary">Salvar senha e continuar</button>`;
}

export function renderPasswordChange(container, { user, error = '', onSubmit, onLogout }) {
  const shell = document.createElement('main');
  shell.className = 'password-change-shell';
  const card = document.createElement('section');
  card.className = 'password-change-card';
  const heading = document.createElement('h1');
  heading.textContent = `Olá, ${user.name}!`;
  const description = document.createElement('p');
  description.textContent = 'Para proteger seu acesso, escolha sua senha pessoal antes de continuar.';
  card.append(heading, description);
  const form = document.createElement('form');
  form.setAttribute('autocomplete', 'off');
  form.setAttribute('data-lpignore', 'true');
  form.setAttribute('data-1p-ignore', 'true');
  form.innerHTML = passwordFieldsHtml();
  const feedback = formFeedback(form);
  if (error) feedback.show(error);
  bindPasswordForm(form, feedback, { submitLabel: 'Salvar senha e continuar', onSubmit });
  const logout = document.createElement('button');
  logout.type = 'button';
  logout.className = 'button';
  logout.dataset.action = 'logout';
  logout.textContent = 'Sair';
  logout.addEventListener('click', async () => {
    if (logout.disabled) return;
    logout.disabled = true;
    logout.classList.add('is-busy');
    logout.innerHTML = '<span class="button-busy-spinner" aria-hidden="true"></span><span>Saindo…</span>';
    try {
      await onLogout?.();
    } catch {
      logout.disabled = false;
      logout.classList.remove('is-busy');
      logout.textContent = 'Sair';
    }
  });
  card.append(form, logout);
  shell.append(card);
  container.replaceChildren(shell);
}

/** Bloqueio quando o trial de 30 dias termina. */
export function renderTrialExpired(container, { user, onLogout }) {
  const shell = document.createElement('main');
  shell.className = 'password-change-shell';
  const card = document.createElement('section');
  card.className = 'password-change-card';
  const heading = document.createElement('h1');
  heading.textContent = 'Período de teste encerrado';
  const description = document.createElement('p');
  description.textContent = `Olá, ${user?.name || 'usuário'}. Seu uso de teste de 30 dias terminou. Entre em contato com o administrador para conhecer os valores de uso e reativar o acesso.`;
  const logout = document.createElement('button');
  logout.type = 'button';
  logout.className = 'button button--primary';
  logout.dataset.action = 'logout';
  logout.textContent = 'Sair';
  logout.addEventListener('click', async () => {
    if (logout.disabled) return;
    logout.disabled = true;
    logout.classList.add('is-busy');
    logout.innerHTML = '<span class="button-busy-spinner" aria-hidden="true"></span><span>Saindo…</span>';
    try {
      await onLogout?.();
    } catch {
      logout.disabled = false;
      logout.classList.remove('is-busy');
      logout.textContent = 'Sair';
    }
  });
  card.append(heading, description, logout);
  shell.append(card);
  container.replaceChildren(shell);
}

/** Define senha a partir do link de convite/recuperação do e-mail. */
export function renderInvitePassword(container, { error = '', onSubmit, onCancel }) {
  const shell = document.createElement('main');
  shell.className = 'password-change-shell';
  const card = document.createElement('section');
  card.className = 'password-change-card';
  const heading = document.createElement('h1');
  heading.textContent = 'Crie sua senha';
  const description = document.createElement('p');
  description.textContent = 'Use o link do e-mail para ativar sua conta com uma senha forte.';
  card.append(heading, description);
  const form = document.createElement('form');
  form.setAttribute('autocomplete', 'off');
  form.setAttribute('data-lpignore', 'true');
  form.setAttribute('data-1p-ignore', 'true');
  form.innerHTML = passwordFieldsHtml();
  const feedback = formFeedback(form);
  if (error) feedback.show(error);
  bindPasswordForm(form, feedback, { submitLabel: 'Salvar senha e continuar', onSubmit });
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'button';
  cancel.textContent = 'Voltar ao login';
  cancel.addEventListener('click', onCancel);
  card.append(form, cancel);
  shell.append(card);
  container.replaceChildren(shell);
}

/** Tela de acesso rápido (estilo app bancário): usuário lembrado + biometria. */
export function renderBiometricUnlock(container, {
  error = '',
  userName = '',
  userEmail = '',
  onUnlock,
  onChangeUser,
  autoStart = false,
} = {}) {
  const shell = document.createElement('main');
  shell.className = 'password-change-shell';
  const card = document.createElement('section');
  card.className = 'password-change-card biometric-unlock-card';
  const displayName = String(userName || '').trim();
  const firstName = displayName.split(/\s+/).filter(Boolean)[0] || 'de volta';
  const initial = (displayName || userEmail || '?').trim().slice(0, 1).toUpperCase();
  const emailLine = String(userEmail || '').trim();
  card.innerHTML = `
    <div class="biometric-user" aria-label="Usuário deste aparelho">
      <span class="biometric-user__avatar" aria-hidden="true">${esc(initial)}</span>
      <strong class="biometric-user__hello">Olá, ${esc(firstName)}</strong>
      ${emailLine ? `<small class="biometric-user__email">${esc(emailLine)}</small>` : ''}
    </div>
    <p class="biometric-unlock-copy">Confirme com a digital ou o Face ID para entrar. Não vamos pedir para criar chave de novo.</p>
    <div class="auth-feedback" role="alert" hidden><span></span></div>
    <button type="button" class="button button--primary" data-biometric-unlock>Entrar com digital ou Face ID</button>
    <button type="button" class="biometric-change-user" data-biometric-change-user>Mudar usuário</button>
  `;
  const alertBox = card.querySelector('.auth-feedback');
  const showError = (message) => {
    alertBox.querySelector('span').textContent = message || '';
    alertBox.hidden = !message;
  };
  if (error) showError(error);
  const unlockBtn = card.querySelector('[data-biometric-unlock]');
  let unlocking = false;
  const runUnlock = async () => {
    if (unlocking) return;
    unlocking = true;
    showError('');
    unlockBtn.disabled = true;
    unlockBtn.classList.add('is-busy');
    unlockBtn.innerHTML = '<span class="button-busy-spinner" aria-hidden="true"></span><span>Aguardando biometria…</span>';
    unlockBtn.setAttribute('aria-busy', 'true');
    try {
      await onUnlock?.();
    } catch (cause) {
      showError(authErrorMessage(cause));
    } finally {
      unlocking = false;
      unlockBtn.disabled = false;
      unlockBtn.classList.remove('is-busy');
      unlockBtn.removeAttribute('aria-busy');
      unlockBtn.textContent = 'Entrar com digital ou Face ID';
    }
  };
  unlockBtn.addEventListener('click', runUnlock);
  card.querySelector('[data-biometric-change-user]').addEventListener('click', () => onChangeUser?.());
  shell.append(card);
  container.replaceChildren(shell);
  queueMicrotask(() => {
    unlockBtn.focus({ preventScroll: true });
    if (autoStart) runUnlock();
  });
}

/** Overlay leve de ocupado (logout, boot, ações longas fora do app-shell). */
export function showBusyStatus({ title = 'Aguarde', detail = 'Carregando…' } = {}) {
  document.querySelector('.app-busy-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'app-busy-overlay';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('aria-busy', 'true');
  const card = document.createElement('span');
  card.className = 'navigation-loading__card';
  const spinner = document.createElement('span');
  spinner.className = 'navigation-loading__spinner';
  spinner.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('span');
  const heading = document.createElement('strong');
  heading.textContent = title;
  const text = document.createElement('small');
  text.textContent = detail;
  copy.append(heading, text);
  card.append(spinner, copy);
  overlay.append(card);
  document.body.append(overlay);
  const app = document.querySelector('#app');
  app?.setAttribute('aria-busy', 'true');
  return () => {
    overlay.remove();
    if (!document.querySelector('.login-welcome, .app-busy-overlay')) {
      app?.removeAttribute('aria-busy');
    }
  };
}

export function showWelcome(user) {
  const overlay = document.createElement('div');
  overlay.className = 'login-welcome';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  const card = document.createElement('div');
  const mark = document.createElement('span');
  mark.className = 'welcome-heart';
  mark.textContent = '♥';
  mark.setAttribute('aria-hidden', 'true');
  const heading = document.createElement('h1');
  heading.textContent = `Boas-vindas, ${user.name}!`;
  const text = document.createElement('p');
  text.textContent = 'Que bom ter você por aqui. Estamos preparando seu espaço.';
  card.append(mark, heading, text);
  overlay.append(card);
  document.body.append(overlay);
  const app = document.querySelector('#app');
  app?.setAttribute('inert', '');
  app?.setAttribute('aria-busy', 'true');
  return () => {
    overlay.remove();
    app?.removeAttribute('inert');
    if (!document.querySelector('.app-busy-overlay')) {
      app?.removeAttribute('aria-busy');
    }
  };
}
