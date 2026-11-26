/** Duração máxima da sessão do app após login com e-mail/senha. */
export const SESSION_TTL_MS = 3 * 60 * 60 * 1000;

export function sessionDeadlineUnix(fromMs = Date.now()) {
  return Math.floor((fromMs + SESSION_TTL_MS) / 1000);
}

export function remainingSessionMs(appExpiresAtUnix, nowMs = Date.now()) {
  if (!appExpiresAtUnix) return SESSION_TTL_MS;
  return Math.max(0, (Number(appExpiresAtUnix) * 1000) - nowMs);
}
