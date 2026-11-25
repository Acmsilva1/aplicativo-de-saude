import { REQUIRED_MARK, requiredLegend } from '../../lib/formRequired.js';
import { CHEVRON_FOLD } from '../../lib/icons.js';
import { buildComparison } from './service/avaliacoesService.js';
import { buildAssessmentEvolution } from './service/assessmentReport.js';

const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const fmt = (value, digits = 1) => {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

const deltaLabel = (value, unit = '', invertGood = false) => {
  if (value == null) return '—';
  const n = Number(value);
  const sign = n > 0 ? '+' : '';
  const text = `${sign}${fmt(n)}${unit}`;
  if (Math.abs(n) < 0.05) return { text: `0${unit}`, tone: 'neutral' };
  const good = invertGood ? n > 0 : n < 0;
  return { text, tone: good ? 'good' : 'warn' };
};

function field(name, label, value, { type = 'number', step = '0.1', min, max, inputmode = 'decimal', required = false, hint = '' } = {}) {
  const attrs = [
    `name="${esc(name)}"`,
    `id="av-${esc(name)}"`,
    `type="${esc(type)}"`,
    value != null && value !== '' ? `value="${esc(value)}"` : '',
    step ? `step="${esc(step)}"` : '',
    min != null ? `min="${esc(min)}"` : '',
    max != null ? `max="${esc(max)}"` : '',
    inputmode ? `inputmode="${esc(inputmode)}"` : '',
    required ? 'required' : '',
    'autocomplete="off"',
  ].filter(Boolean).join(' ');
  const star = required ? ` ${REQUIRED_MARK}` : '';
  return `<label class="av-field" for="av-${esc(name)}"><span>${esc(label)}${star}</span><input ${attrs}>${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
}

function metricCard(label, value, hint = '') {
  return `<article class="av-metric"><small>${esc(label)}</small><strong>${esc(value)}</strong>${hint ? `<span>${esc(hint)}</span>` : ''}</article>`;
}

export function renderAssessmentList({ profile, assessments = [], editable = false } = {}) {
  const name = profile?.name || profile?.nome || 'Aluno';
  const sexLabel = profile?.sexo === 'female' ? 'Feminino' : profile?.sexo === 'male' ? 'Masculino' : 'Sexo não informado';
  const rows = assessments.map((item) => {
    const bf = item.body_fat_pct != null ? `${fmt(item.body_fat_pct)}%` : '—';
    const pill = editable
      ? (item.body_fat_method_label || 'Sem % gordura')
      : (item.body_fat_category?.label || item.bmi_category?.label || '');
    return `<li>
      <button type="button" class="av-list-card" data-action="open-assessment" data-id="${esc(item.id)}">
        <div class="av-list-card__top">
          <strong>${esc(fmtDate(item.avaliado_em))}</strong>
          ${pill ? `<span class="av-pill">${esc(pill)}</span>` : ''}
        </div>
        <div class="av-list-card__metrics">
          <span><small>Peso</small><b>${esc(fmt(item.peso_kg))} kg</b></span>
          <span><small>IMC</small><b>${esc(fmt(item.bmi))}</b></span>
          <span><small>Gordura</small><b>${esc(bf)}</b></span>
        </div>
      </button>
    </li>`;
  }).join('');

  return `<section class="module-page av-page">
    ${editable ? '<button class="back-link" type="button" data-action="back-to-profiles">‹ Voltar para alunos</button>' : ''}
    <header class="module-heading">
      <div>
        <span class="eyebrow">AVALIAÇÃO CORPORAL</span>
        <h1>${editable ? esc(name) : 'Minhas avaliações'}</h1>
        <p>${editable ? `${esc(sexLabel)} · IMC, % gordura e evolução.` : 'Resumo das suas avaliações com o professor.'}</p>
      </div>
      ${editable ? '<button type="button" class="button button--primary av-fab-inline" data-action="new-assessment">Nova avaliação</button>' : ''}
    </header>
    ${editable && !profile?.sexo ? '<p class="av-banner av-banner--warn" role="status">Cadastre o sexo do aluno para liberar o cálculo de % gordura.</p>' : ''}
    ${editable ? '<p class="av-hint">Estimativas com fita e pinça (Navy / Jackson-Pollock). Não substituem avaliação clínica.</p>' : ''}
    ${assessments.length >= 2 && editable ? `<button type="button" class="av-compare-cta" data-action="compare-assessments">Comparar evolução</button>` : ''}
    <ul class="av-list">${rows || '<li class="saude-empty-row">Nenhuma avaliação ainda.</li>'}</ul>
  </section>`;
}

export function renderAssessmentDetail(assessment, { editable = false, profile = null, assessments = [] } = {}) {
  if (!assessment) {
    return `<section class="module-page av-page"><button class="back-link" type="button" data-action="back-to-assessments">‹ Voltar</button><p class="saude-empty-row">Avaliação não encontrada.</p></section>`;
  }
  const bfHint = assessment.body_fat_category?.label
    || (editable ? (assessment.body_fat_method_label || '') : '');
  const ideal = assessment.ideal_weight;
  const waistTone = assessment.waist_risk?.key === 'ok' ? '' : assessment.waist_risk ? ' av-metric--warn' : '';
  const whrTone = assessment.waist_hip_risk?.key === 'ok' ? '' : assessment.waist_hip_risk ? ' av-metric--warn' : '';
  const { previous, delta } = buildAssessmentEvolution(assessments, assessment);
  const evoCards = delta ? [
    { label: '% Gordura', ...deltaLabel(delta.delta_body_fat_pct, ' pp') },
    { label: 'Massa gorda', ...deltaLabel(delta.delta_fat_mass_kg, ' kg') },
    { label: 'Massa magra', ...deltaLabel(delta.delta_lean_mass_kg, ' kg', true) },
    { label: 'Peso', ...deltaLabel(delta.delta_peso_kg, ' kg') },
  ] : [];

  if (!editable) {
    return `<section class="module-page av-page">
      <button class="back-link" type="button" data-action="back-to-assessments">‹ Voltar para avaliações</button>
      <header class="module-heading">
        <div>
          <span class="eyebrow">MEU RESULTADO</span>
          <h1>${esc(fmtDate(assessment.avaliado_em))}</h1>
          <p>Resumo da sua avaliação corporal.</p>
        </div>
      </header>

      <h2 class="av-result-title">Resumo</h2>
      <div class="av-hero-grid">
        ${metricCard('Peso', `${fmt(assessment.peso_kg)} kg`)}
        ${metricCard('IMC', fmt(assessment.bmi), assessment.bmi_category?.label || '')}
        ${metricCard('% Gordura', assessment.body_fat_pct != null ? `${fmt(assessment.body_fat_pct)}%` : '—', bfHint)}
      </div>
      <div class="av-hero-grid av-hero-grid--2">
        ${metricCard('Massa gorda', assessment.fat_mass_kg != null ? `${fmt(assessment.fat_mass_kg)} kg` : '—')}
        ${metricCard('Massa magra', assessment.lean_mass_kg != null ? `${fmt(assessment.lean_mass_kg)} kg` : '—')}
      </div>
      ${assessment.cintura_cm != null ? `<div class="av-hero-grid av-hero-grid--2">
        ${metricCard('Cintura', `${fmt(assessment.cintura_cm)} cm`, assessment.waist_risk?.label || '')}
        ${ideal ? metricCard('Faixa de peso', `${fmt(ideal.min_kg)}–${fmt(ideal.max_kg)} kg`, 'Referência saudável') : ''}
      </div>` : ''}

      ${delta ? `<h2 class="av-result-title">Desde ${esc(fmtDate(previous.avaliado_em))}</h2>
      <div class="av-hero-grid av-hero-grid--2">
        ${evoCards.map((item) => `<article class="av-metric"><small>${esc(item.label)}</small><strong class="av-delta av-delta--${esc(item.tone)}">${esc(item.text)}</strong></article>`).join('')}
      </div>
      ${delta.fat_loss_kg != null ? `<p class="av-meta-line">Perda de gordura: <strong>${esc(fmt(delta.fat_loss_kg))} kg</strong></p>` : ''}
      ${delta.lean_gain_kg != null ? `<p class="av-meta-line">Ganho de massa magra: <strong>${esc(fmt(delta.lean_gain_kg))} kg</strong></p>` : ''}` : ''}

      <p class="av-hint">Valores estimados pelo seu professor. Em caso de dúvida, pergunte a ele.</p>
    </section>`;
  }

  return `<section class="module-page av-page">
    <button class="back-link" type="button" data-action="back-to-assessments">‹ Voltar para avaliações</button>
    <header class="module-heading">
      <div>
        <span class="eyebrow">RESULTADO</span>
        <h1>${esc(fmtDate(assessment.avaliado_em))}</h1>
        <p>${esc(profile?.name || profile?.nome || '')}${assessment.age_at_assessment != null ? ` · ${assessment.age_at_assessment} anos` : ''}${assessment.observacoes ? ` · ${esc(assessment.observacoes)}` : ''}</p>
      </div>
      <button type="button" class="button button--primary av-fab-inline" data-action="download-assessment-pdf" data-id="${esc(assessment.id)}">Baixar PDF</button>
    </header>

    <h2 class="av-result-title">Composição</h2>
    <div class="av-hero-grid">
      ${metricCard('Peso', `${fmt(assessment.peso_kg)} kg`)}
      ${metricCard('IMC', fmt(assessment.bmi), assessment.bmi_category?.label || '')}
      ${metricCard('% Gordura', assessment.body_fat_pct != null ? `${fmt(assessment.body_fat_pct)}%` : '—', bfHint)}
    </div>
    <div class="av-hero-grid">
      ${metricCard('Massa gorda', assessment.fat_mass_kg != null ? `${fmt(assessment.fat_mass_kg)} kg` : '—', 'Peso × % gordura')}
      ${metricCard('Massa magra', assessment.lean_mass_kg != null ? `${fmt(assessment.lean_mass_kg)} kg` : '—', assessment.lean_mass_pct != null ? `${fmt(assessment.lean_mass_pct)}% do peso` : '')}
      ${metricCard('% Magra', assessment.lean_mass_pct != null ? `${fmt(assessment.lean_mass_pct)}%` : '—', '100 − % gordura')}
    </div>

    ${delta ? `<h2 class="av-result-title">Evolução vs ${esc(fmtDate(previous.avaliado_em))}</h2>
    <div class="av-hero-grid av-hero-grid--2">
      ${evoCards.map((item) => `<article class="av-metric"><small>${esc(item.label)}</small><strong class="av-delta av-delta--${esc(item.tone)}">${esc(item.text)}</strong></article>`).join('')}
    </div>
    ${delta.fat_loss_kg != null ? `<p class="av-meta-line">Perda de gordura: <strong>${esc(fmt(delta.fat_loss_kg))} kg</strong></p>` : ''}
    ${delta.lean_gain_kg != null ? `<p class="av-meta-line">Ganho de massa magra: <strong>${esc(fmt(delta.lean_gain_kg))} kg</strong></p>` : ''}` : ''}

    <h2 class="av-result-title">Risco metabólico</h2>
    <div class="av-hero-grid av-hero-grid--2">
      <article class="av-metric${waistTone}"><small>Cintura</small><strong>${esc(fmt(assessment.cintura_cm))} cm</strong><span>${esc(assessment.waist_risk?.label || '—')}${assessment.waist_risk?.detail ? ` · ${esc(assessment.waist_risk.detail)}` : ''}</span></article>
      <article class="av-metric${whrTone}"><small>RCQ</small><strong>${esc(fmt(assessment.waist_hip_ratio, 2))}</strong><span>${esc(assessment.waist_hip_risk?.label || '—')}${assessment.waist_hip_risk?.detail ? ` · ${esc(assessment.waist_hip_risk.detail)}` : ''}</span></article>
    </div>

    <h2 class="av-result-title">Metabolismo e referência</h2>
    <div class="av-hero-grid av-hero-grid--2">
      ${metricCard('TMB Mifflin', assessment.tmb_mifflin_kcal != null ? `${fmt(assessment.tmb_mifflin_kcal, 0)} kcal` : '—', 'Gasto basal estimado')}
      ${metricCard('TMB Cunningham', assessment.tmb_cunningham_kcal != null ? `${fmt(assessment.tmb_cunningham_kcal, 0)} kcal` : '—', 'A partir da massa magra')}
    </div>
    ${ideal ? `<p class="av-meta-line">Faixa de peso (IMC 18,5–24,9): <strong>${esc(fmt(ideal.min_kg))}–${esc(fmt(ideal.max_kg))} kg</strong></p>` : ''}
    ${assessment.body_fat_method_label ? `<p class="av-meta-line">Método do % gordura: <strong>${esc(assessment.body_fat_method_label)}</strong></p>` : '<p class="av-banner av-banner--warn">Sem % gordura — confira medidas.</p>'}
    <p class="av-hint">Estimativas indicativas (OMS / Jackson-Pollock / Navy / Mifflin). Não substituem avaliação clínica.</p>

    <div class="av-sticky-actions">
      <button type="button" class="saude-btn saude-btn--danger" data-action="delete-assessment" data-id="${esc(assessment.id)}">Excluir</button>
      <button type="button" class="saude-btn" data-action="edit-assessment" data-id="${esc(assessment.id)}">Editar</button>
      <button type="button" class="saude-btn saude-btn--primary" data-action="download-assessment-pdf" data-id="${esc(assessment.id)}">Baixar PDF</button>
    </div>
  </section>`;
}

export function renderAssessmentEditor({ assessment = null, profile = null, editing = false } = {}) {
  const a = assessment || {};
  const today = new Date().toISOString().slice(0, 10);
  const sex = profile?.sexo;
  const female = sex === 'female';
  const male = sex === 'male';
  const profileHeight = profile?.altura_cm ?? profile?.height_cm;
  const heightValue = a.altura_cm ?? profileHeight ?? '';
  const heightFromCadastro = !editing && profileHeight != null && profileHeight !== '';

  return `<section class="module-page av-page">
    <button class="back-link" type="button" data-action="back-to-assessments">‹ Voltar</button>
    <header class="module-heading">
      <div>
        <span class="eyebrow">${editing ? 'EDITAR' : 'NOVA'} AVALIAÇÃO</span>
        <h1>${esc(profile?.name || 'Aluno')}</h1>
        <p>Preencha balança, fita e pinça — o relatório usa essas medidas automaticamente.</p>
      </div>
    </header>
    <form class="av-form" data-assessment-form data-editing="${editing ? 'true' : 'false'}" data-id="${esc(a.id || '')}">
      ${requiredLegend()}
      <details class="av-section av-section--fold" open>
        <summary><span class="av-section__title">1. Balança e altura</span>${CHEVRON_FOLD}</summary>
        <div class="av-section__body av-fold-body">
          ${!profileHeight ? '<p class="av-banner av-banner--warn" role="status">Cadastre a altura do aluno para preencher automaticamente.</p>' : ''}
          ${field('avaliado_em', 'Data', a.avaliado_em || today, { type: 'date', step: '', inputmode: '', required: true, hint: 'Marca o dia da medição e a idade usada na pinça' })}
          <div class="av-row-2">
            ${field('peso_kg', 'Peso (kg)', a.peso_kg ?? '', { min: 20, max: 400, step: '0.1', required: true, hint: 'Entra no IMC, massas gorda/magra e TMB' })}
            ${field('altura_cm', 'Altura (cm)', heightValue, { min: 100, max: 250, step: '0.1', required: true, hint: heightFromCadastro ? 'Do cadastro — ajuste só se mudou' : 'Entra no IMC, Navy, TMB e faixa de peso' })}
          </div>
        </div>
      </details>

      <details class="av-section av-section--fold">
        <summary><span class="av-section__title">2. Fita métrica</span><small>Navy, RCQ e risco de cintura</small>${CHEVRON_FOLD}</summary>
        <div class="av-section__body av-fold-body">
          <div class="av-row-2">
            ${field('pescoco_cm', 'Pescoço (cm)', a.pescoco_cm ?? '', { min: 20, max: 80, required: true, hint: 'Usado na fórmula US Navy do % gordura' })}
            ${field('cintura_cm', 'Cintura (cm)', a.cintura_cm ?? '', { min: 40, max: 200, required: true, hint: male ? 'Navy + risco metabólico (umbigo)' : 'Navy + risco metabólico (ponto mais estreito)' })}
          </div>
          ${field('quadril_cm', 'Quadril (cm)', a.quadril_cm ?? '', { min: 40, max: 200, required: true, hint: 'RCQ (cintura÷quadril) e Navy feminino' })}
        </div>
      </details>

      <details class="av-section av-section--fold">
        <summary><span class="av-section__title">3. Pinça (7 dobras)</span><small>* JP3 obrigatório · 7 = JP7</small>${CHEVRON_FOLD}</summary>
        <div class="av-section__body av-fold-body">
          ${(male || female) ? `<div class="av-row-stack">
            ${field('peito_mm', 'Peito (mm)', a.peito_mm ?? '', { min: 1, max: 80, step: '0.5', required: male, hint: male ? 'Obrigatório · JP3 masculino' : 'Opcional · completa JP7' })}
            ${field('axilar_media_mm', 'Axilar média (mm)', a.axilar_media_mm ?? '', { min: 1, max: 80, step: '0.5', required: false, hint: 'Opcional · completa JP7' })}
            ${field('triceps_mm', 'Tríceps (mm)', a.triceps_mm ?? '', { min: 1, max: 80, step: '0.5', required: female, hint: female ? 'Obrigatório · JP3 feminino' : 'Opcional · completa JP7' })}
            ${field('subescapular_mm', 'Subescapular (mm)', a.subescapular_mm ?? '', { min: 1, max: 80, step: '0.5', required: false, hint: 'Opcional · completa JP7' })}
            ${field('abdominal_mm', 'Abdominal (mm)', a.abdominal_mm ?? '', { min: 1, max: 80, step: '0.5', required: male, hint: male ? 'Obrigatório · JP3 masculino' : 'Opcional · completa JP7' })}
            ${field('suprailiaca_mm', 'Suprailíaca (mm)', a.suprailiaca_mm ?? '', { min: 1, max: 80, step: '0.5', required: female, hint: female ? 'Obrigatório · JP3 feminino' : 'Opcional · completa JP7' })}
            ${field('coxa_mm', 'Coxa (mm)', a.coxa_mm ?? '', { min: 1, max: 80, step: '0.5', required: true, hint: 'Obrigatório · JP3 (ambos os sexos)' })}
          </div>` : '<p class="av-banner av-banner--warn">Informe o sexo do aluno para liberar as dobras corretas.</p>'}
        </div>
      </details>

      <details class="av-section av-section--fold">
        <summary><span class="av-section__title">4. Observações</span><small>Opcional · só histórico</small>${CHEVRON_FOLD}</summary>
        <div class="av-section__body av-fold-body">
          <input type="hidden" name="metodo_preferido" value="auto">
          <input type="hidden" name="gordura_pct_informada" value="">
          <label class="av-field" for="av-obs"><span>Observações</span><textarea name="observacoes" id="av-obs" rows="2" maxlength="2000" placeholder="Ex.: horário, jejum, observações da medição">${esc(a.observacoes || '')}</textarea><small>Não entra no cálculo — só histórico. Relatório: JP7 se as 7 dobras existirem; senão JP3; senão fita.</small></label>
        </div>
      </details>

      <div class="av-sticky-actions">
        <button type="button" class="saude-btn" data-action="back-to-assessments">Cancelar</button>
        <button type="submit" class="saude-btn saude-btn--primary">${editing ? 'Salvar' : 'Registrar'}</button>
      </div>
    </form>
  </section>`;
}

export function renderAssessmentCompare({ assessments = [], fromId = '', toId = '', profile = null } = {}) {
  const sorted = [...assessments].sort((a, b) => String(a.avaliado_em).localeCompare(String(b.avaliado_em)));
  const defaultFrom = fromId || sorted[0]?.id || '';
  const defaultTo = toId || sorted[sorted.length - 1]?.id || '';
  const comparison = buildComparison(assessments, defaultFrom, defaultTo, profile || {});
  const options = (selectedId) => assessments.map((item) => {
    const selected = String(item.id) === String(selectedId) ? ' selected' : '';
    return `<option value="${esc(item.id)}"${selected}>${esc(fmtDate(item.avaliado_em))} · ${esc(fmt(item.peso_kg))} kg</option>`;
  }).join('');

  const d = comparison?.delta;
  const cards = d ? [
    { label: 'Peso', ...deltaLabel(d.delta_peso_kg, ' kg') },
    { label: 'IMC', ...deltaLabel(d.delta_bmi) },
    { label: '% Gordura', ...deltaLabel(d.delta_body_fat_pct, ' pp') },
    { label: 'Massa gorda', ...deltaLabel(d.delta_fat_mass_kg, ' kg') },
    { label: 'Massa magra', ...deltaLabel(d.delta_lean_mass_kg, ' kg', true) },
    { label: 'Cintura', ...deltaLabel(d.delta_cintura_cm, ' cm') },
    { label: 'RCQ', ...deltaLabel(d.delta_waist_hip_ratio, '') },
  ] : [];

  return `<section class="module-page av-page">
    <button class="back-link" type="button" data-action="back-to-assessments">‹ Voltar</button>
    <header class="module-heading">
      <div>
        <span class="eyebrow">EVOLUÇÃO</span>
        <h1>Comparar avaliações</h1>
        <p>${esc(profile?.name || 'Aluno')} · perda de gordura e ganho de massa magra.</p>
      </div>
    </header>
    <form class="av-compare-pick" data-compare-form>
      <label class="av-field"><span>De</span><select name="from_id">${options(defaultFrom)}</select></label>
      <label class="av-field"><span>Até</span><select name="to_id">${options(defaultTo)}</select></label>
      <button type="submit" class="saude-btn saude-btn--primary">Atualizar</button>
    </form>
    ${comparison ? `
      <div class="av-compare-summary">
        <p><strong>${esc(fmtDate(comparison.older.avaliado_em))}</strong> → <strong>${esc(fmtDate(comparison.newer.avaliado_em))}</strong></p>
        ${d.fat_loss_kg ? `<p class="av-tone-good">Perda de gordura: <strong>${esc(fmt(d.fat_loss_kg))} kg</strong></p>` : ''}
        ${d.lean_gain_kg ? `<p class="av-tone-good">Ganho de massa magra: <strong>${esc(fmt(d.lean_gain_kg))} kg</strong></p>` : ''}
      </div>
      <div class="av-hero-grid">${cards.map((c) => `<article class="av-metric av-metric--${c.tone}"><small>${esc(c.label)}</small><strong>${esc(c.text)}</strong></article>`).join('')}</div>
    ` : '<p class="saude-empty-row">Selecione duas avaliações.</p>'}
  </section>`;
}
