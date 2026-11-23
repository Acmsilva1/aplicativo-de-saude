/** Trial de 30 dias civis (America/Sao_Paulo). Admin fica isento. */

export const TRIAL_DAYS = 30;
export const TRIAL_TIMEZONE = 'America/Sao_Paulo';
export const TRIAL_EXPIRED_CODE = 'trial_expired';
export const TRIAL_EXPIRED_MESSAGE =
  'Seu período de teste de 30 dias terminou. Entre em contato com o administrador para conhecer os valores de uso.';

/** Flag leve no aparelho: login (sem sessão) sabe se o trial já começou / expirou. */
export const TRIAL_STARTED_STORAGE_KEY = 'ritmo_trial_started';
export const TRIAL_EXPIRED_STORAGE_KEY = 'ritmo_trial_expired';

export const LOGIN_TRIAL_NOTE_PENDING =
  'Avaliação gratuita de <strong>30 dias</strong>, contados a partir do primeiro acesso com a sua senha.';
export const LOGIN_TRIAL_NOTE_ACTIVE =
  'Avaliação gratuita em andamento. Acompanhe o prazo restante no rodapé do aplicativo.';
export const LOGIN_TRIAL_NOTE_EXPIRED =
  'Sua avaliação gratuita encerrou. Entre em contato com o administrador para continuar.';

/** Persiste flags locais a partir da sessão (não limpa no logout se o trial já começou). */
export function syncTrialLocalFlags(user) {
  if (!user || user.role === 'admin' || user.trial_exempt) return;
  try {
    if (user.trial_started_at) localStorage.setItem(TRIAL_STARTED_STORAGE_KEY, '1');
    if (user.trial_expired) localStorage.setItem(TRIAL_EXPIRED_STORAGE_KEY, '1');
  } catch {
    /* private mode / quota */
  }
}

function readLocalFlag(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/** pending | active | expired — prioriza user em memória, senão localStorage. */
export function getLoginTrialNoteKind(user) {
  if (user && user.role !== 'admin' && !user.trial_exempt) {
    if (user.trial_expired) return 'expired';
    if (user.trial_started_at) return 'active';
  }
  if (readLocalFlag(TRIAL_EXPIRED_STORAGE_KEY)) return 'expired';
  if (readLocalFlag(TRIAL_STARTED_STORAGE_KEY)) return 'active';
  return 'pending';
}

export function loginTrialNoteHtml(kind = getLoginTrialNoteKind()) {
  if (kind === 'expired') return LOGIN_TRIAL_NOTE_EXPIRED;
  if (kind === 'active') return LOGIN_TRIAL_NOTE_ACTIVE;
  return LOGIN_TRIAL_NOTE_PENDING;
}

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TRIAL_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** YYYY-MM-DD no fuso do trial. */
export function calendarDateInTrialTz(value = new Date()) {
  return dateFmt.format(value instanceof Date ? value : new Date(value));
}

function parseCalendarDay(yyyyMmDd) {
  const [y, m, d] = String(yyyyMmDd).split('-').map(Number);
  return Date.UTC(y, m - 1, d, 12, 0, 0);
}

/** Dias civis decorridos de start até end (floor). */
export function calendarDaysElapsed(start, end = new Date()) {
  if (!start) return 0;
  const a = parseCalendarDay(calendarDateInTrialTz(start));
  const b = parseCalendarDay(calendarDateInTrialTz(end));
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

export function trialEndsAtIso(trialStartedAt) {
  if (!trialStartedAt) return null;
  const startDay = calendarDateInTrialTz(trialStartedAt);
  const [y, m, d] = startDay.split('-').map(Number);
  // Último dia inclusivo do trial: start + (TRIAL_DAYS - 1); expira no dia seguinte (elapsed === 30).
  const endUtc = new Date(Date.UTC(y, m - 1, d + (TRIAL_DAYS - 1), 15, 0, 0));
  const endDay = calendarDateInTrialTz(endUtc);
  return `${endDay}T23:59:59.999-03:00`;
}

/**
 * Campos públicos de trial para a sessão/conta.
 * Admin: isento. Sem trial_started_at: ainda não iniciou (mostra 30 restantes, não expirado).
 */
export function buildTrialFields({ role, trial_started_at: trialStartedAt } = {}) {
  if (role === 'admin') {
    return {
      trial_exempt: true,
      trial_started_at: null,
      trial_ends_at: null,
      trial_days_remaining: null,
      trial_expired: false,
    };
  }

  if (!trialStartedAt) {
    return {
      trial_exempt: false,
      trial_started_at: null,
      trial_ends_at: null,
      trial_days_remaining: TRIAL_DAYS,
      trial_expired: false,
    };
  }

  const started = trialStartedAt instanceof Date
    ? trialStartedAt.toISOString()
    : new Date(trialStartedAt).toISOString();
  const elapsed = calendarDaysElapsed(started);
  const remaining = Math.max(0, TRIAL_DAYS - elapsed);

  return {
    trial_exempt: false,
    trial_started_at: started,
    trial_ends_at: trialEndsAtIso(started),
    trial_days_remaining: remaining,
    trial_expired: remaining === 0,
  };
}

/** true se a conta autenticada deve ser barrada nas rotas de uso. */
export function isTrialBlocked(user) {
  return Boolean(user && user.role !== 'admin' && user.trial_expired);
}
