import { showToast } from '../saude/service/uiConfirmation.js';

const LOGIN_PROFILES = {
  admin: { label: 'Administração', short: 'AD', description: 'Gerencie usuários e acessos da plataforma.' },
  professor: { label: 'Professor', short: 'PR', description: 'Acompanhe dietas e hidratação dos seus alunos.' },
  student: { label: 'Aluno', short: 'AL', description: 'Consulte sua rotina de alimentação e hidratação.' },
};

export function renderLogin(container, { onLogin, error = '' } = {}) {
  container.innerHTML = `
    <main class="login-layout">
      <section class="login-story" aria-label="Ritmo Saúde">
        <a class="brand brand--large" href="#inicio" aria-label="Ritmo Saúde, início">
          <span class="brand-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3.5C13 9 7 14.2 7 20a9 9 0 0 0 18 0c0-5.8-6-11-9-16.5Z"/><path d="M12 21a4 4 0 0 0 4 4"/></svg></span>
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
          <div class="mobile-brand brand"><span class="brand-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3.5C13 9 7 14.2 7 20a9 9 0 0 0 18 0c0-5.8-6-11-9-16.5Z"/><path d="M12 21a4 4 0 0 0 4 4"/></svg></span><span>Ritmo<span class="brand-light">Saúde</span></span></div>
          <span class="eyebrow login-eyebrow">BEM-VINDO DE VOLTA</span>
          <h2>Acesse sua rotina</h2>
          <p class="login-subtitle">Entre para abrir seus módulos de saúde.</p>
          <div class="login-profile-switch">
            <span class="login-profile-switch__label">Acessar área</span>
            <details class="login-profile-picker">
              <summary aria-label="Trocar perfil de acesso">
                <span class="login-profile-picker__mark" data-profile-mark aria-hidden="true">PR</span>
                <span data-profile-label>Professor</span>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
              </summary>
              <div class="login-profile-menu" role="group" aria-label="Perfis disponíveis">
                <button type="button" data-login-profile="admin" aria-pressed="false"><span class="login-profile-menu__mark" aria-hidden="true">AD</span><span><strong>Administração</strong><small>Contas e acessos</small></span><span class="login-profile-menu__check" aria-hidden="true">✓</span></button>
                <button type="button" data-login-profile="professor" aria-pressed="true"><span class="login-profile-menu__mark" aria-hidden="true">PR</span><span><strong>Professor</strong><small>Dietas e acompanhamento</small></span><span class="login-profile-menu__check" aria-hidden="true">✓</span></button>
                <button type="button" data-login-profile="student" aria-pressed="false"><span class="login-profile-menu__mark" aria-hidden="true">AL</span><span><strong>Aluno</strong><small>Minha rotina de saúde</small></span><span class="login-profile-menu__check" aria-hidden="true">✓</span></button>
              </div>
            </details>
            <p class="login-profile-switch__hint" data-profile-description>${LOGIN_PROFILES.professor.description} Após entrar, a área é definida pelas permissões da sua conta.</p>
          </div>
          <form id="login-form" class="login-form">
            <label for="email">E-mail</label>
            <input id="email" name="email" type="email" autocomplete="username" placeholder="voce@exemplo.com" required />
            <label for="password">Senha</label>
            <div class="password-field"><input id="password" name="password" type="password" autocomplete="current-password" required /><span class="password-lock" aria-hidden="true"><svg viewBox="0 0 20 20"><rect x="4" y="8" width="12" height="9" rx="2"/><path d="M6.5 8V5.8a3.5 3.5 0 0 1 7 0V8"/></svg></span></div>
            <button class="button button--primary login-submit" type="submit"><span>Entrar</span><span aria-hidden="true">↗</span></button>
          </form>
          <p class="login-privacy"><span aria-hidden="true">●</span> Acesso protegido à sua conta</p>
        </div>
      </section>
    </main>`;

  if (error) showToast(error, { type: 'error' });

  const profilePicker = container.querySelector('.login-profile-picker');
  container.querySelectorAll('[data-login-profile]').forEach((option) => {
    option.addEventListener('click', () => {
      const profile = LOGIN_PROFILES[option.dataset.loginProfile];
      if (!profile) return;
      container.querySelector('[data-profile-label]').textContent = profile.label;
      container.querySelector('[data-profile-mark]').textContent = profile.short;
      container.querySelector('[data-profile-description]').textContent = `${profile.description} Após entrar, a área é definida pelas permissões da sua conta.`;
      container.querySelectorAll('[data-login-profile]').forEach((item) => {
        item.setAttribute('aria-pressed', String(item === option));
      });
      profilePicker.open = false;
      profilePicker.querySelector('summary').focus();
    });
  });

  container.querySelector('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    button.querySelector('span').textContent = 'Entrando…';
    const form = new FormData(event.currentTarget);
    await onLogin?.({ email: form.get('email'), password: form.get('password') });
  });
}
