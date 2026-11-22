export function formFeedback(form) {
  form.noValidate = true;
  const box = document.createElement('div');
  box.className = 'auth-feedback';
  box.hidden = true;
  box.setAttribute('role', 'alert');
  box.innerHTML = '<span></span><button type="button" aria-label="Dispensar aviso">×</button>';
  form.prepend(box);
  const clear = () => {
    box.hidden = true;
    box.querySelector('span').textContent = '';
    form.querySelectorAll('[aria-invalid="true"]').forEach(input => input.removeAttribute('aria-invalid'));
  };
  box.querySelector('button').addEventListener('click', clear);
  form.addEventListener('input', clear);
  return {
    clear,
    show(message, input) {
      clear();
      box.querySelector('span').textContent = message;
      box.hidden = false;
      if (input) { input.setAttribute('aria-invalid', 'true'); input.focus({ preventScroll: true }); }
    },
  };
}

export function authErrorMessage(error) {
  const text = String(error?.message || 'Não foi possível concluir. Tente novamente.');
  return /failed to fetch|networkerror|load failed|network request failed/i.test(text)
    ? 'Não foi possível conectar. Confira sua conexão e tente novamente.'
    : text;
}
