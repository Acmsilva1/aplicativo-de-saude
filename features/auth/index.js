import { formFeedback, authErrorMessage } from './formFeedback.js';
import {
  hasLocalBiometricForEmail,
  hasSavedDeviceUser,
  normalizeLoginEmail,
  readBiometricPreference,
  supportsPlatformAuth,
} from './biometric.js';
import { LOGIN_TRIAL_NOTE } from '../../lib/trial.js';
import { labelWithRequired, requiredLegend } from '../../lib/formRequired.js';
import appInfo from '../../package.json';

export function renderLogin(container, {
  onLogin,
  onKnownDeviceUser,
  error = '',
  prefillEmail = '',
} = {}) {
  const pref = readBiometricPreference();
  const initialEmail = normalizeLoginEmail(prefillEmail);
  container.innerHTML = `
    <main class="login-layout">
      <section class="login-story" aria-label="Ritmo Saúde">
        <a class="brand brand--large" href="#inicio" aria-label="Ritmo Saúde, início">
          <span class="brand-mark"><img src="/icons/health-192.png" alt="" width="42" height="42" decoding="async" /></span>
          <span>Ritmo<span class="brand-light">Saúde</span></span>
        </a>
        <div class="story-copy">
          <span class="eyebrow"><span class="eyebrow-dot"></span> SUA ROTINA, COM MAIS LEVEZA</span>
          <h1>Pequenos hábitos.<br /><em>Mais equilíbrio.</em></h1>
          <p>Um espaço para acompanhar sua alimentação e cuidar da hidratação, um dia de cada vez.</p>
        </div>
        <div class="story-watermark" aria-hidden="true"><span></span><span></span><span></span></div>
        <p class="story-foot">Dieta e hidratação, no seu ritmo.</p>
      </section>
      <section class="login-panel">
        <div class="login-card">
          <header class="login-header">
            <div class="mobile-brand brand">
              <span class="brand-mark" aria-hidden="true"><img src="/icons/health-192.png" alt="" width="44" height="44" decoding="async" /></span>
              <span class="mobile-brand-copy">
                <span class="mobile-brand-name">Ritmo<span class="brand-light">Saúde</span></span>
                <span class="eyebrow login-eyebrow">Bem-vindo de volta</span>
              </span>
            </div>
            <span class="eyebrow login-eyebrow login-eyebrow--desktop">Bem-vindo de volta</span>
          </header>
          <h2>Acesse sua rotina</h2>
          <p class="login-subtitle">Acesse com o e-mail do convite. Sem senha? Use o link do e-mail.</p>
          <p class="login-trial-note">${LOGIN_TRIAL_NOTE}</p>
          <div class="login-access-card">
            <form id="login-form" class="login-form" autocomplete="off" data-lpignore="true" data-1p-ignore="true">
              ${requiredLegend()}
              <label for="email">${labelWithRequired('E-mail', true)}</label>
              <input id="email" name="email" type="email" autocomplete="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other" placeholder="voce@exemplo.com" required />
              <label for="password">${labelWithRequired('Senha', true)}</label>
              <div class="password-field"><input id="password" name="password" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other" required /><button type="button" class="password-toggle" aria-label="Mostrar senha" aria-pressed="false"><span class="password-toggle-icon password-toggle-icon--show" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M1.5 10s2.8-5.5 8.5-5.5S18.5 10 18.5 10s-2.8 5.5-8.5 5.5S1.5 10 1.5 10Z"/><circle cx="10" cy="10" r="2.4"/></svg></span><span class="password-toggle-icon password-toggle-icon--hide" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M3 4 17 16"/><path d="M5.2 6.4A11.6 11.6 0 0 0 1.5 10s2.8 5.5 8.5 5.5c1.4 0 2.7-.3 3.8-.8"/><path d="M8.1 5.6A4.5 4.5 0 0 1 10 5c3.2 0 5.8 2.6 5.8 5.8 0 .7-.1 1.3-.3 1.9"/><path d="M10 14.5A4.5 4.5 0 0 1 5.5 10c0-.5.1-1 .2-1.4"/></svg></span></button></div>
              <button class="button button--primary login-submit" type="submit"><span>Entrar</span><span aria-hidden="true">↗</span></button>
            </form>
          </div>
          <p class="login-privacy"><span aria-hidden="true">●</span> Acesso protegido à sua conta</p>
          <p class="login-version">Versão ${appInfo.version}${hasSavedDeviceUser() || pref?.credentialId ? ' · Biometria ativa neste aparelho' : ''}</p>
        </div>
      </section>
    </main>`;

  const loginForm = container.querySelector('#login-form');
  const emailInput = container.querySelector('#email');
  const passwordInput = container.querySelector('#password');
  const passwordToggle = container.querySelector('.password-toggle');
  if (initialEmail && emailInput) emailInput.value = initialEmail;
  if (passwordInput && passwordToggle) {
    const showLabel = 'Mostrar senha';
    const hideLabel = 'Ocultar senha';
    const onTogglePassword = (event) => {
      event.preventDefault();
      const showing = passwordInput.type === 'text';
      passwordInput.type = showing ? 'password' : 'text';
      passwordToggle.setAttribute('aria-label', showing ? showLabel : hideLabel);
      passwordToggle.setAttribute('aria-pressed', showing ? 'false' : 'true');
      passwordToggle.classList.toggle('is-visible', !showing);
    };
    passwordToggle.addEventListener('click', onTogglePassword);
    passwordToggle.addEventListener('mousedown', (event) => event.preventDefault());
  }
  // Só ao digitar: se o e-mail já tem digital neste aparelho, pula direto para a biometria.
  // Prefill (fallback senha) não dispara sozinho — o usuário consegue digitar a senha.
  if (emailInput && typeof onKnownDeviceUser === 'function') {
    const maybeJumpToBiometric = () => {
      const email = normalizeLoginEmail(emailInput.value);
      if (!email || !hasLocalBiometricForEmail(email)) return;
      onKnownDeviceUser(email);
    };
    emailInput.addEventListener('input', maybeJumpToBiometric);
    emailInput.addEventListener('change', maybeJumpToBiometric);
  }
  const feedback = formFeedback(loginForm);
  if (error) feedback.show(error);
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedback.clear();
    const email = loginForm.elements.namedItem('email');
    const password = loginForm.elements.namedItem('password');
    if (!email.value.trim() || email.validity.typeMismatch) { feedback.show('Informe um e-mail válido.', email); return; }
    if (!password.value) { feedback.show('Informe sua senha.', password); return; }
    const button = loginForm.querySelector('.login-submit');
    button.disabled = true;
    button.classList.add('is-busy');
    button.innerHTML = '<span class="button-busy-label"><span class="button-busy-spinner" aria-hidden="true"></span><span>Entrando…</span></span><span aria-hidden="true">↗</span>';
    loginForm.setAttribute('aria-busy', 'true');
    try {
      await onLogin?.({
        email: email.value.trim(),
        password: password.value,
      });
    } catch (cause) { feedback.show(authErrorMessage(cause)); }
    finally {
      button.disabled = false;
      button.classList.remove('is-busy');
      button.innerHTML = '<span>Entrar</span><span aria-hidden="true">↗</span>';
      loginForm.removeAttribute('aria-busy');
    }
  });
}

export { supportsPlatformAuth };
