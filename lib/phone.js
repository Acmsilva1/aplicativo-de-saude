/** Normalize BR phone input (e.g. 27988516301) to E.164 (+5527988516301). */
export function normalizeBrazilPhone(input) {
  let digits = String(input || '').replace(/\D/g, '');
  if (!digits) return { error: 'Informe o telefone com DDD, ex.: 27988516301.' };
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return { phone: `+${digits}` };
  }
  if (digits.length === 10 || digits.length === 11) {
    return { phone: `+55${digits}` };
  }
  return { error: 'Telefone inválido. Use DDD + número, ex.: 27988516301.' };
}

/** Display E.164 as (27) 98851-6301 when possible. */
export function formatBrazilPhone(stored) {
  const digits = String(stored || '').replace(/\D/g, '');
  if (!digits) return '';
  const local = digits.startsWith('55') ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return stored;
}
