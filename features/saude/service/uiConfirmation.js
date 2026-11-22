let toastTimer = 0;
let toastExpiresAt = 0;

export function clearToasts() {
  window.clearTimeout(toastTimer);
  toastExpiresAt = 0;
  document.querySelectorAll('[data-app-toast]').forEach(node => node.remove());
}
function removeExpiredToast() {
  if (toastExpiresAt && Date.now() >= toastExpiresAt) clearToasts();
}
window.addEventListener('focus', removeExpiredToast);
document.addEventListener('visibilitychange', () => { if (!document.hidden) removeExpiredToast(); });

export function showToast(message, { type = 'success' } = {}) {
  const text = String(message || '').trim();
  if (!text) return;
  clearToasts();

  const toast = document.createElement('div');
  toast.className = `app-toast app-toast--${type === 'error' ? 'error' : 'success'}`;
  toast.dataset.appToast = 'true';
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.innerHTML = `<span class="app-toast__icon" aria-hidden="true">${type === 'error' ? '!' : '✓'}</span><span class="app-toast__text"></span><button type="button" class="app-toast__dismiss" aria-label="Fechar aviso">×</button>`;
  toast.querySelector('.app-toast__dismiss').addEventListener('click', clearToasts);
  toast.querySelector('.app-toast__text').textContent = text;
  document.body.append(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));

  toastExpiresAt = Date.now() + 2000;
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('is-visible');
    toast.classList.add('is-leaving');
    window.setTimeout(() => toast.remove(), 220);
  }, 2000);
}

export function confirmAction(message, { title = 'Confirmar', confirmLabel = 'Confirmar', tone = 'danger' } = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = `app-confirm app-confirm--${tone === 'primary' ? 'primary' : 'danger'}`;
    dialog.setAttribute('aria-labelledby', 'confirm-title');

    const icon = document.createElement('div');
    icon.className = 'app-confirm__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = tone === 'primary' ? '?' : '!';

    const heading = document.createElement('h2');
    heading.id = 'confirm-title';
    heading.textContent = title;

    const text = document.createElement('p');
    text.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'app-confirm__actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'saude-btn';
    cancel.textContent = 'Cancelar';

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = tone === 'primary' ? 'saude-btn saude-btn--primary' : 'saude-btn saude-btn--danger';
    confirm.textContent = confirmLabel;

    actions.append(cancel, confirm);
    dialog.append(icon, heading, text, actions);
    document.body.append(dialog);

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };

    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(false);
    });
    dialog.showModal();
    cancel.focus();
  });
}
