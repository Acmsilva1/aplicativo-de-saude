import { escapeHtml } from '../../lib/htmlEscape.js';
import {
  PRIVACY_CONTACT,
  PRIVACY_RETENTION,
  PRIVACY_RIGHTS,
  PRIVACY_SUMMARY,
  PRIVACY_TITLE,
} from './content.js';

export function renderPrivacyPanel({
  canExport = false,
  canErase = false,
  busy = false,
} = {}) {
  const rights = PRIVACY_RIGHTS.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const actions = [];
  if (canExport) {
    actions.push(`<button type="button" class="button button--primary" data-privacy-export${busy ? ' disabled' : ''}>Exportar meus dados</button>`);
  }
  if (canErase) {
    actions.push(`<button type="button" class="button" data-privacy-erase${busy ? ' disabled' : ''}>Excluir minha conta</button>`);
  }
  return `
    <section class="module-page privacy-page">
      <header class="module-heading"><div>
        <span class="eyebrow">LGPD</span>
        <h1>${escapeHtml(PRIVACY_TITLE)}</h1>
        <p>${escapeHtml(PRIVACY_SUMMARY)}</p>
      </div></header>
      <article class="privacy-block">
        <h2>Seus direitos</h2>
        <ul>${rights}</ul>
      </article>
      <article class="privacy-block">
        <h2>Retenção</h2>
        <p>${escapeHtml(PRIVACY_RETENTION)}</p>
      </article>
      <article class="privacy-block">
        <h2>Contato</h2>
        <p>${escapeHtml(PRIVACY_CONTACT)}</p>
      </article>
      ${actions.length ? `<div class="privacy-actions">${actions.join('')}</div>` : ''}
    </section>`;
}

export function renderPrivacyStandalone(container, {
  onBack,
  onExport,
  onErase,
  canExport = false,
  canErase = false,
} = {}) {
  const shell = document.createElement('main');
  shell.className = 'password-change-shell';
  const card = document.createElement('section');
  card.className = 'password-change-card privacy-card';
  card.innerHTML = `
    <button type="button" class="biometric-change-user" data-privacy-back>Voltar</button>
    ${renderPrivacyPanel({ canExport, canErase })}
  `;
  shell.append(card);
  container.replaceChildren(shell);
  card.querySelector('[data-privacy-back]')?.addEventListener('click', () => onBack?.());
  card.querySelector('[data-privacy-export]')?.addEventListener('click', () => onExport?.());
  card.querySelector('[data-privacy-erase]')?.addEventListener('click', () => onErase?.());
}
