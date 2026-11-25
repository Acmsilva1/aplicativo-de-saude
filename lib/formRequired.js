/** Marcação visual de campos obrigatórios (asterisco vermelho + legenda). */

export const REQUIRED_MARK = '<abbr class="field-req" title="Obrigatório">*</abbr>';

/** Legenda padrão: "* Campo obrigatório" */
export function requiredLegend(className = '') {
  const extra = className ? ` ${className}` : '';
  return `<p class="field-req-legend${extra}" role="note">${REQUIRED_MARK} Campo obrigatório</p>`;
}

/** Acrescenta o asterisco ao texto/HTML do rótulo quando `required` for true. */
export function labelWithRequired(labelHtml, required = false) {
  if (!required) return labelHtml;
  return `${labelHtml} ${REQUIRED_MARK}`;
}
