import { compareAssessments } from './bodyCompositionService.js';

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const fmt = (value, digits = 1) => {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

const fmtDelta = (value, unit = '', invertGood = false) => {
  if (value == null || Number.isNaN(Number(value))) return { text: '—', tone: 'neutral' };
  const n = Number(value);
  if (Math.abs(n) < 0.05) return { text: `0${unit}`, tone: 'neutral' };
  const sign = n > 0 ? '+' : '';
  const good = invertGood ? n > 0 : n < 0;
  return { text: `${sign}${fmt(n)}${unit}`, tone: good ? 'good' : 'warn' };
};

/** Avaliação imediatamente anterior (por data) à atual. */
export function findPreviousAssessment(assessments = [], current) {
  if (!current?.id && !current?.avaliado_em) return null;
  const sorted = [...assessments].sort((a, b) => String(a.avaliado_em).localeCompare(String(b.avaliado_em)));
  const idx = sorted.findIndex((item) => String(item.id) === String(current.id));
  if (idx > 0) return sorted[idx - 1];
  if (idx === -1) {
    const older = sorted.filter((item) => String(item.avaliado_em) < String(current.avaliado_em));
    return older[older.length - 1] || null;
  }
  return null;
}

export function buildAssessmentEvolution(assessments, current) {
  const previous = findPreviousAssessment(assessments, current);
  if (!previous || !current) return { previous: null, delta: null };
  return { previous, delta: compareAssessments(previous, current) };
}

function row(label, value, hint = '') {
  return `<tr><th>${esc(label)}</th><td>${esc(value)}</td>${hint ? `<td class="hint">${esc(hint)}</td>` : '<td class="hint"></td>'}</tr>`;
}

function deltaRow(label, value, unit = '', invertGood = false) {
  const d = fmtDelta(value, unit, invertGood);
  return `<tr><th>${esc(label)}</th><td class="delta delta--${d.tone}">${esc(d.text)}</td></tr>`;
}

function buildReportHtml({ assessment, profile, previous, delta }) {
  const name = profile?.name || profile?.nome || 'Aluno';
  const sexLabel = profile?.sexo === 'female' ? 'Feminino' : profile?.sexo === 'male' ? 'Masculino' : '—';
  const title = `Avaliação corporal — ${name} — ${fmtDate(assessment.avaliado_em)}`;
  const ideal = assessment.ideal_weight;

  const evolutionBlock = delta && previous ? `
    <section>
      <h2>Evolução desde o registro anterior</h2>
      <p class="sub">Comparando <strong>${esc(fmtDate(previous.avaliado_em))}</strong> → <strong>${esc(fmtDate(assessment.avaliado_em))}</strong></p>
      <table class="delta-table">
        ${deltaRow('% Gordura corporal', delta.delta_body_fat_pct, ' pp')}
        ${deltaRow('Massa gorda', delta.delta_fat_mass_kg, ' kg')}
        ${deltaRow('Massa magra', delta.delta_lean_mass_kg, ' kg', true)}
        ${deltaRow('Peso', delta.delta_peso_kg, ' kg')}
        ${deltaRow('IMC', delta.delta_bmi)}
        ${deltaRow('Cintura', delta.delta_cintura_cm, ' cm')}
        ${deltaRow('RCQ', delta.delta_waist_hip_ratio)}
      </table>
      ${delta.fat_loss_kg != null ? `<p class="highlight">Perda de gordura: <strong>${esc(fmt(delta.fat_loss_kg))} kg</strong></p>` : ''}
      ${delta.lean_gain_kg != null ? `<p class="highlight">Ganho de massa magra: <strong>${esc(fmt(delta.lean_gain_kg))} kg</strong></p>` : ''}
    </section>` : `
    <section>
      <h2>Evolução</h2>
      <p class="sub">Primeiro registro deste aluno — ainda não há comparação com avaliação anterior.</p>
    </section>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; font: 12px/1.45 "Segoe UI", system-ui, sans-serif; color: #142033; background: #fff; }
  h1 { margin: 0 0 4px; font-size: 20px; letter-spacing: -.02em; }
  h2 { margin: 22px 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #3d5a50; border-bottom: 1px solid #d7e0db; padding-bottom: 4px; }
  .brand { font-size: 11px; font-weight: 700; color: #2f6f5e; letter-spacing: .08em; text-transform: uppercase; }
  .meta { margin: 0 0 16px; color: #5b6b7c; }
  .sub { margin: 0 0 10px; color: #5b6b7c; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #e8eef2; text-align: left; vertical-align: top; }
  th { width: 42%; font-weight: 600; color: #334155; }
  td { font-variant-numeric: tabular-nums; }
  .hint { color: #64748b; font-size: 11px; }
  .macros { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 12px 0 4px; }
  .macro { border: 1px solid #d7e0db; border-radius: 10px; padding: 10px 12px; background: #f7faf8; }
  .macro small { display: block; color: #5b6b7c; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  .macro strong { display: block; margin-top: 2px; font-size: 18px; letter-spacing: -.02em; }
  .macro span { display: block; margin-top: 2px; color: #64748b; font-size: 11px; }
  .delta--good { color: #157a4b; font-weight: 700; }
  .delta--warn { color: #b45309; font-weight: 700; }
  .delta--neutral { color: #475569; }
  .highlight { margin: 8px 0 0; padding: 8px 10px; background: #eef8f2; border-radius: 8px; }
  .foot { margin-top: 28px; font-size: 10px; color: #64748b; }
  .no-print { margin: 0 0 16px; }
  .no-print button { appearance: none; border: 0; border-radius: 8px; padding: 10px 14px; background: #2f6f5e; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
  @media print {
    body { padding: 12mm; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="no-print"><button type="button" onclick="window.print()">Salvar / imprimir PDF</button></div>
  <p class="brand">Ritmo Saúde</p>
  <h1>Relatório de avaliação corporal</h1>
  <p class="meta">${esc(name)} · ${esc(sexLabel)}${assessment.age_at_assessment != null ? ` · ${assessment.age_at_assessment} anos` : ''} · ${esc(fmtDate(assessment.avaliado_em))}</p>

  <section>
    <h2>Composição corporal (macros)</h2>
    <div class="macros">
      <article class="macro"><small>% Gordura</small><strong>${assessment.body_fat_pct != null ? `${esc(fmt(assessment.body_fat_pct))}%` : '—'}</strong><span>${esc(assessment.body_fat_category?.label || assessment.body_fat_method_label || '')}</span></article>
      <article class="macro"><small>Massa gorda</small><strong>${assessment.fat_mass_kg != null ? `${esc(fmt(assessment.fat_mass_kg))} kg` : '—'}</strong><span>Peso × % gordura</span></article>
      <article class="macro"><small>Massa magra</small><strong>${assessment.lean_mass_kg != null ? `${esc(fmt(assessment.lean_mass_kg))} kg` : '—'}</strong><span>${assessment.lean_mass_pct != null ? `${esc(fmt(assessment.lean_mass_pct))}% do peso` : ''}</span></article>
    </div>
    <table>
      ${row('Peso', `${fmt(assessment.peso_kg)} kg`)}
      ${row('Altura', `${fmt(assessment.altura_cm)} cm`)}
      ${row('IMC', fmt(assessment.bmi), assessment.bmi_category?.label || '')}
      ${row('% Magra', assessment.lean_mass_pct != null ? `${fmt(assessment.lean_mass_pct)}%` : '—')}
      ${row('Método % gordura', assessment.body_fat_method_label || '—')}
    </table>
  </section>

  ${evolutionBlock}

  <section>
    <h2>Risco metabólico</h2>
    <table>
      ${row('Cintura', `${fmt(assessment.cintura_cm)} cm`, assessment.waist_risk?.label || '')}
      ${row('Quadril', `${fmt(assessment.quadril_cm)} cm`)}
      ${row('RCQ', fmt(assessment.waist_hip_ratio, 2), assessment.waist_hip_risk?.label || '')}
      ${row('Pescoço', `${fmt(assessment.pescoco_cm)} cm`)}
    </table>
  </section>

  <section>
    <h2>Metabolismo e referência</h2>
    <table>
      ${row('TMB Mifflin', assessment.tmb_mifflin_kcal != null ? `${fmt(assessment.tmb_mifflin_kcal, 0)} kcal` : '—', 'Gasto basal estimado')}
      ${row('TMB Cunningham', assessment.tmb_cunningham_kcal != null ? `${fmt(assessment.tmb_cunningham_kcal, 0)} kcal` : '—', 'A partir da massa magra')}
      ${ideal ? row('Faixa de peso (IMC 18,5–24,9)', `${fmt(ideal.min_kg)}–${fmt(ideal.max_kg)} kg`) : ''}
    </table>
  </section>

  <section>
    <h2>Dobras cutâneas (mm)</h2>
    <table>
      ${[
        ['Peito', assessment.peito_mm],
        ['Axilar média', assessment.axilar_media_mm],
        ['Tríceps', assessment.triceps_mm],
        ['Subescapular', assessment.subescapular_mm],
        ['Abdominal', assessment.abdominal_mm],
        ['Suprailíaca', assessment.suprailiaca_mm],
        ['Coxa', assessment.coxa_mm],
      ].map(([label, value]) => row(label, value != null ? `${fmt(value)} mm` : '—')).join('')}
    </table>
  </section>

  ${assessment.observacoes ? `<section><h2>Observações</h2><p class="sub">${esc(assessment.observacoes)}</p></section>` : ''}

  <p class="foot">Estimativas indicativas (OMS / Jackson-Pollock / Navy / Mifflin). Não substituem avaliação clínica. Gerado em ${esc(new Date().toLocaleString('pt-BR'))}.</p>
</body>
</html>`;
}

/**
 * Gera o relatório sem pop-up (iframe oculto) e abre o diálogo de impressão
 * para o usuário escolher "Salvar como PDF".
 */
export function openAssessmentPdfReport({ assessment, profile = null, assessments = [] } = {}) {
  if (!assessment || typeof document === 'undefined') return false;
  const { previous, delta } = buildAssessmentEvolution(assessments, assessment);
  const html = buildReportHtml({ assessment, profile, previous, delta });

  const existing = document.getElementById('av-pdf-frame');
  if (existing) existing.remove();

  const frame = document.createElement('iframe');
  frame.id = 'av-pdf-frame';
  frame.title = 'Relatório de avaliação';
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
  });
  document.body.appendChild(frame);

  const doc = frame.contentDocument || frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    return false;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const runPrint = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      /* ignore */
    }
    setTimeout(() => frame.remove(), 60_000);
  };

  // Aguarda layout/fontes no iframe antes de imprimir.
  if (frame.contentWindow?.document?.readyState === 'complete') {
    setTimeout(runPrint, 150);
  } else {
    frame.addEventListener('load', () => setTimeout(runPrint, 150), { once: true });
  }
  return true;
}
