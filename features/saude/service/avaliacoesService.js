import { enrichAssessment, compareAssessments } from './bodyCompositionService.js';

function num(value, { min = 0, max = 1e6, allowEmpty = true } = {}) {
  if (value == null || value === '') return allowEmpty ? null : NaN;
  const n = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) return NaN;
  return n;
}

export function normalizeAssessmentInput(input = {}) {
  const avaliadoEm = String(input.avaliado_em || '').slice(0, 10);
  // Sempre auto: relatório usa as medidas preenchidas (pinça → fita → manual).
  return {
    avaliado_em: /^\d{4}-\d{2}-\d{2}$/.test(avaliadoEm) ? avaliadoEm : null,
    peso_kg: num(input.peso_kg, { min: 20, max: 400, allowEmpty: false }),
    altura_cm: num(input.altura_cm, { min: 100, max: 250, allowEmpty: false }),
    pescoco_cm: num(input.pescoco_cm, { min: 20, max: 80 }),
    cintura_cm: num(input.cintura_cm, { min: 40, max: 200 }),
    quadril_cm: num(input.quadril_cm, { min: 40, max: 200 }),
    peito_mm: num(input.peito_mm, { min: 1, max: 80 }),
    axilar_media_mm: num(input.axilar_media_mm, { min: 1, max: 80 }),
    triceps_mm: num(input.triceps_mm, { min: 1, max: 80 }),
    subescapular_mm: num(input.subescapular_mm, { min: 1, max: 80 }),
    abdominal_mm: num(input.abdominal_mm, { min: 1, max: 80 }),
    suprailiaca_mm: num(input.suprailiaca_mm, { min: 1, max: 80 }),
    coxa_mm: num(input.coxa_mm, { min: 1, max: 80 }),
    gordura_pct_informada: num(input.gordura_pct_informada, { min: 1, max: 70 }),
    metodo_preferido: 'auto',
    observacoes: String(input.observacoes || '').trim().slice(0, 2000),
  };
}

export function validateAssessmentInput(input, profile = {}) {
  const profileHeight = profile.altura_cm ?? profile.height_cm;
  const data = normalizeAssessmentInput({
    ...input,
    altura_cm: input.altura_cm != null && input.altura_cm !== '' ? input.altura_cm : profileHeight,
  });
  if (!data.avaliado_em) return { error: 'Informe a data da avaliação.', data };
  if (!Number.isFinite(data.peso_kg)) return { error: 'Peso deve ficar entre 20 e 400 kg.', data };
  if (!Number.isFinite(data.altura_cm)) {
    return { error: 'Cadastre a altura do aluno (100–250 cm) ou informe neste formulário.', data };
  }

  const optionalNumeric = [
    'gordura_pct_informada',
    'peito_mm',
    'axilar_media_mm',
    'triceps_mm',
    'subescapular_mm',
    'abdominal_mm',
    'suprailiaca_mm',
    'coxa_mm',
  ];
  for (const key of optionalNumeric) {
    if (Number.isNaN(data[key])) return { error: `Valor inválido em ${key}.`, data };
  }

  const sex = profile.sexo || profile.sex;
  if (!sex || !['male', 'female'].includes(sex)) {
    return { error: 'Cadastre o sexo do aluno (masculino/feminino) para calcular a composição corporal.', data };
  }

  const requiredTape = [
    ['pescoco_cm', 'Pescoço (cm)'],
    ['cintura_cm', 'Cintura (cm)'],
    ['quadril_cm', 'Quadril (cm)'],
  ];
  for (const [key, label] of requiredTape) {
    if (Number.isNaN(data[key])) return { error: `${label} inválido.`, data };
    if (data[key] == null) return { error: `Informe ${label}.`, data };
  }
  if (!(data.cintura_cm > data.pescoco_cm)) {
    return { error: 'A cintura precisa ser maior que o pescoço.', data };
  }

  // Obrigatórias = sítios JP3; as demais dobras são opcionais (completam JP7).
  const requiredFolds = sex === 'female'
    ? [
      ['triceps_mm', 'Tríceps (mm)'],
      ['suprailiaca_mm', 'Suprailíaca (mm)'],
      ['coxa_mm', 'Coxa (mm)'],
    ]
    : [
      ['peito_mm', 'Peito (mm)'],
      ['abdominal_mm', 'Abdominal (mm)'],
      ['coxa_mm', 'Coxa (mm)'],
    ];
  for (const [key, label] of requiredFolds) {
    if (Number.isNaN(data[key])) return { error: `${label} inválido.`, data };
    if (data[key] == null) return { error: `Informe ${label}.`, data };
  }

  return { error: null, data };
}

export function enrichList(assessments, profile) {
  return (assessments || [])
    .map((item) => enrichAssessment(item, profile))
    .sort((a, b) => String(b.avaliado_em).localeCompare(String(a.avaliado_em)));
}

export function buildComparison(assessments, fromId, toId, profile) {
  const enriched = enrichList(assessments, profile);
  const a = enriched.find((item) => item.id === fromId);
  const b = enriched.find((item) => item.id === toId);
  if (!a || !b) return null;
  const [older, newer] = a.avaliado_em <= b.avaliado_em ? [a, b] : [b, a];
  return {
    older,
    newer,
    delta: compareAssessments(older, newer),
  };
}
