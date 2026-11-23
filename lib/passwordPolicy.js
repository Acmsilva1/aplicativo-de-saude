/** Strong password: 8–80 chars, letter, number, and special character. */
export function isStrongPassword(password) {
  const value = String(password || '');
  if (value.length < 8 || value.length > 80) return false;
  return /[A-Za-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

export const STRONG_PASSWORD_HINT = 'Use 8 a 80 caracteres, com letra, número e caractere especial.';

export const STRONG_PASSWORD_ERROR = 'Escolha uma senha de 8 a 80 caracteres, com letra, número e caractere especial.';
