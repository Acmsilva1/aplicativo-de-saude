import { escapeHtml } from '../../lib/htmlEscape.js';
import {
  PRIVACY_CONTACT,
  PRIVACY_RETENTION,
  PRIVACY_RIGHTS,
  PRIVACY_SUMMARY,
  PRIVACY_TITLE,
} from './content.js';

function closePrivacyModal(dialog) {
  if (!dialog?.isConnected) return;
  try { dialog.close(); } catch { /* already closed */ }
  dialog.remove();
}

/** Modal discreto de privacidade (overlay), com X para fechar. */
export function openPrivacyModal({
  canExport = false,
  canErase = false,
  onExport,
  onErase,
} = {}) {
  document.querySelector('dialog.privacy-modal')?.remove();

  const dialog = document.createElement('dialog');
  dialog.className = 'privacy-modal';
  dialog.setAttribute('aria-labelledby', 'privacy-modal-title');

  const rights = PRIVACY_RIGHTS.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const actions = [];
  if (canExport) {
    actions.push('<button type="button" class="saude-btn saude-btn--primary" data-privacy-export>Baixar PDF dos meus dados</button>');
  }
  if (canErase) {
    actions.push('<button type="button" class="saude-btn" data-privacy-erase>Excluir minha conta</button>');
  }

  dialog.innerHTML = `
    <header class="privacy-modal__head">
      <div>
        <span class="privacy-modal__eyebrow">LGPD</span>
        <h2 id="privacy-modal-title">${escapeHtml(PRIVACY_TITLE)}</h2>
      </div>
      <button type="button" class="privacy-modal__close" data-privacy-close aria-label="Fechar">×</button>
    </header>
    <div class="privacy-modal__body">
      <p class="privacy-modal__lead">Seus dados de saúde são usados para o acompanhamento nutricional do piloto. Consulte os detalhes ou escolha uma opção abaixo.</p>
      <details class="privacy-modal__details">
        <summary>Tratamento, direitos e retenção</summary>
        <div class="privacy-modal__details-content">
          <p>${escapeHtml(PRIVACY_SUMMARY)}</p>
      <p class="privacy-modal__label">O que você pode fazer</p>
      <ul class="privacy-modal__list">${rights}</ul>
      <p class="privacy-modal__label">Por quanto tempo guardamos</p>
      <p>${escapeHtml(PRIVACY_RETENTION)}</p>
      <p class="privacy-modal__label">Ajuda</p>
          <p>${escapeHtml(PRIVACY_CONTACT)}</p>
        </div>
      </details>
    </div>
    ${actions.length ? `<div class="privacy-modal__actions">${actions.join('')}</div>` : ''}
  `;

  document.body.append(dialog);

  const finish = () => closePrivacyModal(dialog);
  dialog.querySelector('[data-privacy-close]')?.addEventListener('click', finish);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    finish();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) finish();
  });
  dialog.querySelector('[data-privacy-export]')?.addEventListener('click', async () => {
    try { await onExport?.(); } finally { finish(); }
  });
  dialog.querySelector('[data-privacy-erase]')?.addEventListener('click', async () => {
    // Mantém o modal aberto até o fluxo de exclusão decidir (prompt/confirmação).
    await onErase?.();
  });

  dialog.showModal();
  dialog.querySelector('[data-privacy-close]')?.focus();
  return dialog;
}
