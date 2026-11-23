import { formFeedback, authErrorMessage } from './formFeedback.js';
import {
  isBiometricPreferred,
  readBiometricPreference,
  supportsPlatformAuth,
} from './biometric.js';
import appInfo from '../../package.json';

export function renderLogin(container, {
  onLogin,
  error = '',
  biometricSupported = false,
  preferBiometric = false,
} = {}) {
  const pref = readBiometricPreference();
  const toggleChecked = preferBiometric || isBiometricPreferred();
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
          <p class="login-subtitle">Entre com o e-mail e a senha definidos no convite. Se ainda não criou a senha, use o link do e-mail ou peça um novo ao administrador.</p>
          <p class="login-trial-note">Uso de teste: <strong>30 dias</strong> a partir do primeiro acesso com a sua senha.</p>
          <div class="login-access-card">
            <form id="login-form" class="login-form" autocomplete="off" data-lpignore="true" data-1p-ignore="true">
              <label for="email">E-mail</label>
              <input id="email" name="email" type="email" autocomplete="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other" placeholder="voce@exemplo.com" required />
              <label for="password">Senha</label>
              <div class="password-field"><input id="password" name="password" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other" required /><span class="password-lock" aria-hidden="true"><svg viewBox="0 0 20 20"><rect x="4" y="8" width="12" height="9" rx="2"/><path d="M6.5 8V5.8a3.5 3.5 0 0 1 7 0V8"/></svg></span></div>
              ${biometricSupported ? `
              <label class="login-biometric-toggle">
                <input type="checkbox" name="enable_biometric" ${toggleChecked ? 'checked' : ''} />
                <span>
                  <strong>Usar digital ou Face ID neste aparelho</strong>
                  <small>Após entrar, o sistema pede a biometria cadastrada no dispositivo.</small>
                </span>
              </label>` : ''}
              <button class="button button--primary login-submit" type="submit"><span>Entrar</span><span aria-hidden="true">↗</span></button>
            </form>
          </div>
          <p class="login-privacy"><span aria-hidden="true">●</span> Acesso protegido à sua conta</p>
          <p class="login-version">Versão ${appInfo.version}${pref?.preferred ? ' · Biometria ativa neste aparelho' : ''}</p>
        </div>
      </section>
    </main>`;

  const loginForm = container.querySelector('#login-form');
  const feedback = formFeedback(loginForm);
  if (error) feedback.show(error);
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedback.clear();
    const email = loginForm.elements.namedItem('email');
    const password = loginForm.elements.namedItem('password');
    const enableBiometric = Boolean(loginForm.elements.namedItem('enable_biometric')?.checked);
    if (!email.value.trim() || email.validity.typeMismatch) { feedback.show('Informe um e-mail válido.', email); return; }
    if (!password.value) { feedback.show('Informe sua senha.', password); return; }
    const button = loginForm.querySelector('.login-submit');
    button.disabled = true;
    button.classList.add('is-busy');
    button.innerHTML = '<span class="button-busy-label"><span class="button-busy-spinner" aria-hidden="true"></span><span>Entrando…</span></span><span aria-hidden="true">↗</span>';
    loginForm.setAttribute('aria-busy', 'true');
    try {
      await onLogin?.({
        email: email.value,
        password: password.value,
        enableBiometric,
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
