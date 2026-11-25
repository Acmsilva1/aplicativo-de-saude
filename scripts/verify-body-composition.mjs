/**
 * Simulações do módulo de avaliações corporais.
 * Executar: node scripts/verify-body-composition.mjs
 */
import {
  ageOnDate,
  calcBmi,
  bmiCategory,
  navyBodyFat,
  jp3BodyFat,
  jp7BodyFat,
  bodyMasses,
  waistRisk,
  waistHipRisk,
  mifflinStJeor,
  cunninghamTmb,
  idealWeightRange,
  bodyFatCategory,
  resolveBodyFat,
  enrichAssessment,
  compareAssessments,
} from '../features/saude/service/bodyCompositionService.js';
import {
  normalizeAssessmentInput,
  validateAssessmentInput,
} from '../features/saude/service/avaliacoesService.js';

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    failures.push(msg);
    console.error(`FAIL  ${msg}`);
    return;
  }
  passed += 1;
}

function approx(actual, expected, tol = 0.15) {
  return Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
}

console.log('— IMC / idade —');
assert(calcBmi(87.5, 178) === 27.6, `IMC 87.5/178 → 27.6, veio ${calcBmi(87.5, 178)}`);
assert(calcBmi(50, 165) === 18.4, `IMC magro ${calcBmi(50, 165)}`);
assert(calcBmi(0, 178) == null, 'IMC peso 0 → null');
assert(calcBmi(80, 0) == null, 'IMC altura 0 → null');
assert(bmiCategory(17)?.key === 'underweight', 'categoria abaixo');
assert(bmiCategory(22)?.key === 'normal', 'categoria normal');
assert(bmiCategory(27)?.key === 'overweight', 'categoria sobrepeso');
assert(bmiCategory(32)?.key === 'obese', 'categoria obesidade');
assert(ageOnDate('1992-06-15', '2026-11-01') === 34, `idade André ${ageOnDate('1992-06-15', '2026-11-01')}`);
assert(ageOnDate('1995-08-22', '2026-11-01') === 31, `idade Ana ${ageOnDate('1995-08-22', '2026-11-01')}`);
assert(ageOnDate(null, '2026-11-01') == null, 'idade sem nascimento');

console.log('— Navy (fita) —');
const navyMale = navyBodyFat({ sex: 'male', heightCm: 178, neckCm: 39, waistCm: 90 });
assert(approx(navyMale, 19.4), `Navy homem ~19.4 → ${navyMale}`);
const navyFemale = navyBodyFat({
  sex: 'female', heightCm: 165, neckCm: 32, waistCm: 74, hipCm: 98,
});
assert(approx(navyFemale, 28.4), `Navy mulher ~28.4 → ${navyFemale}`);
assert(navyBodyFat({ sex: 'female', heightCm: 165, neckCm: 32, waistCm: 74 }) == null, 'Navy mulher sem quadril → null');
assert(navyBodyFat({ sex: 'male', heightCm: 178, neckCm: 40, waistCm: 40 }) == null, 'Navy cintura≤pescoço → null');
assert(navyBodyFat({ sex: 'other', heightCm: 178, neckCm: 39, waistCm: 90 }) == null, 'Navy sexo inválido → null');

console.log('— Jackson-Pollock 3 —');
const jp3m = jp3BodyFat({
  sex: 'male', age: 34, chestMm: 14, abdominalMm: 22, thighMm: 18,
});
assert(approx(jp3m, 16.7), `JP3 homem ~16.7 → ${jp3m}`);
const jp3f = jp3BodyFat({
  sex: 'female', age: 31, tricepsMm: 16, suprailiacMm: 14, thighMm: 20,
});
assert(jp3f != null && jp3f > 12 && jp3f < 35, `JP3 mulher faixa válida → ${jp3f}`);
assert(jp3BodyFat({ sex: 'male', age: 34, chestMm: 14, abdominalMm: 22 }) == null, 'JP3 homem sem coxa → null');
assert(jp3BodyFat({ sex: 'female', age: 31, chestMm: 14, abdominalMm: 22, thighMm: 18 }) == null, 'JP3 mulher com sítios masculinos → null/NaN sites');

console.log('— Jackson-Pollock 7 —');
const jp7SitesMale = {
  chestMm: 14, midaxillaryMm: 12, tricepsMm: 10, subscapularMm: 13,
  abdominalMm: 22, suprailiacMm: 11, thighMm: 18,
};
const jp7m = jp7BodyFat({ sex: 'male', age: 34, ...jp7SitesMale });
assert(approx(jp7m, 15.1), `JP7 homem ~15.1 → ${jp7m}`);
const jp7f = jp7BodyFat({
  sex: 'female',
  age: 31,
  chestMm: 12,
  midaxillaryMm: 11,
  tricepsMm: 16,
  subscapularMm: 14,
  abdominalMm: 18,
  suprailiacMm: 14,
  thighMm: 20,
});
assert(jp7f != null && jp7f > 10 && jp7f < 40, `JP7 mulher faixa válida → ${jp7f}`);
assert(
  jp7BodyFat({ sex: 'male', age: 34, ...jp7SitesMale, midaxillaryMm: null }) == null,
  'JP7 incompleto (falta axilar) → null',
);

console.log('— Massas / TMB / faixa ideal —');
const masses = bodyMasses(87.5, 18.5);
assert(masses.fat_mass_kg === 16.2, `massa gorda ${masses.fat_mass_kg}`);
assert(masses.lean_mass_kg === 71.3, `massa magra ${masses.lean_mass_kg}`);
assert(masses.lean_mass_pct === 81.5, `magra % ${masses.lean_mass_pct}`);
const tmbM = mifflinStJeor({ sex: 'male', weightKg: 87.5, heightCm: 178, age: 34 });
assert(tmbM === 1823, `TMB Mifflin homem 1823 → ${tmbM}`);
const tmbF = mifflinStJeor({ sex: 'female', weightKg: 62, heightCm: 165, age: 31 });
assert(tmbF === 1335, `TMB Mifflin mulher 1335 → ${tmbF}`);
assert(cunninghamTmb(71.3) === 2069, `Cunningham ${cunninghamTmb(71.3)}`);
const ideal = idealWeightRange(178);
assert(ideal && ideal.min_kg === 58.6 && ideal.max_kg === 78.9, `peso ideal 178 → ${JSON.stringify(ideal)}`);

console.log('— Riscos cintura / RCQ —');
assert(waistRisk('male', 90)?.key === 'ok', 'cintura homem 90 ok');
assert(waistRisk('male', 96)?.key === 'raised', 'cintura homem 96 raised');
assert(waistRisk('male', 110)?.key === 'high', 'cintura homem 110 high');
assert(waistRisk('female', 78)?.key === 'ok', 'cintura mulher 78 ok');
assert(waistRisk('female', 84)?.key === 'raised', 'cintura mulher 84 raised');
assert(waistRisk('female', 90)?.key === 'high', 'cintura mulher 90 high');
assert(waistHipRisk('male', 0.88)?.key === 'ok', 'RCQ homem 0.88 ok');
assert(waistHipRisk('male', 0.95)?.key === 'raised', 'RCQ homem 0.95 raised');
assert(waistHipRisk('female', 0.82)?.key === 'ok', 'RCQ mulher 0.82 ok');
assert(waistHipRisk('female', 0.88)?.key === 'raised', 'RCQ mulher 0.88 raised');

console.log('— Categorias % gordura —');
assert(bodyFatCategory('male', 12, 34)?.key === 'athlete', 'homem 12% atleta');
assert(bodyFatCategory('male', 19, 34)?.key === 'normal', 'homem 19% normal <40');
assert(bodyFatCategory('female', 22, 31)?.key === 'fit', 'mulher 22% em forma');
assert(bodyFatCategory('female', 30, 31)?.key === 'normal', 'mulher 30% normal');

console.log('— Prioridade resolveBodyFat (JP7 → JP3 → Navy → manual) —');
const profileM = { sexo: 'male', data_nascimento: '1992-06-15' };
const profileF = { sexo: 'female', data_nascimento: '1995-08-22' };

const onlyJp3 = resolveBodyFat({
  avaliado_em: '2026-11-01',
  altura_cm: 178, pescoco_cm: 39, cintura_cm: 90, quadril_cm: 98,
  peito_mm: 14, abdominal_mm: 22, coxa_mm: 18,
}, profileM);
assert(onlyJp3.method === 'jp3', `só JP3 → ${onlyJp3.method}`);
assert(onlyJp3.body_fat_pct != null, 'só JP3 tem %');

const fullJp7 = resolveBodyFat({
  avaliado_em: '2026-11-01',
  altura_cm: 178, pescoco_cm: 39, cintura_cm: 90, quadril_cm: 98,
  peito_mm: 14, axilar_media_mm: 12, triceps_mm: 10, subescapular_mm: 13,
  abdominal_mm: 22, suprailiaca_mm: 11, coxa_mm: 18,
  gordura_pct_informada: 25,
}, profileM);
assert(fullJp7.method === 'jp7', `7 dobras prevalece sobre manual → ${fullJp7.method}`);
assert(fullJp7.available_methods.includes('jp7') && fullJp7.available_methods.includes('jp3')
  && fullJp7.available_methods.includes('navy') && fullJp7.available_methods.includes('manual'),
  `métodos disponíveis ${fullJp7.available_methods}`);

const onlyNavy = resolveBodyFat({
  avaliado_em: '2026-11-01',
  altura_cm: 178, pescoco_cm: 39, cintura_cm: 90, quadril_cm: 98,
}, profileM);
assert(onlyNavy.method === 'navy', `só fita → ${onlyNavy.method}`);

const onlyManual = resolveBodyFat({
  avaliado_em: '2026-11-01',
  altura_cm: 178, gordura_pct_informada: 18.5,
}, profileM);
assert(onlyManual.method === 'manual' && onlyManual.body_fat_pct === 18.5, `só manual → ${onlyManual.method}`);

const femaleJp3 = resolveBodyFat({
  avaliado_em: '2026-11-01',
  altura_cm: 165, pescoco_cm: 32, cintura_cm: 74, quadril_cm: 98,
  triceps_mm: 16, suprailiaca_mm: 14, coxa_mm: 20,
}, profileF);
assert(femaleJp3.method === 'jp3', `mulher JP3 → ${femaleJp3.method}`);
assert(femaleJp3.body_fat_pct != null, 'mulher JP3 %');

const incompleteJp7FallsToJp3 = resolveBodyFat({
  avaliado_em: '2026-11-01',
  altura_cm: 178, pescoco_cm: 39, cintura_cm: 90,
  peito_mm: 14, abdominal_mm: 22, coxa_mm: 18,
  triceps_mm: 10, // parcial JP7 sem axilar/subescapular/supra
}, profileM);
assert(incompleteJp7FallsToJp3.method === 'jp3', `JP7 incompleto cai em JP3 → ${incompleteJp7FallsToJp3.method}`);

console.log('— enrichAssessment cenário André (progresso) —');
const a1 = enrichAssessment({
  id: '1', avaliado_em: '2026-09-01', peso_kg: 92, altura_cm: 178,
  pescoco_cm: 40, cintura_cm: 98, quadril_cm: 102,
  peito_mm: 18, abdominal_mm: 28, coxa_mm: 22,
}, profileM);
const a2 = enrichAssessment({
  id: '2', avaliado_em: '2026-11-01', peso_kg: 87.5, altura_cm: 178,
  pescoco_cm: 39, cintura_cm: 90, quadril_cm: 98,
  peito_mm: 14, axilar_media_mm: 12, triceps_mm: 10, subescapular_mm: 13,
  abdominal_mm: 22, suprailiaca_mm: 11, coxa_mm: 18,
}, profileM);
assert(a1.body_fat_method === 'jp3', `a1 método ${a1.body_fat_method}`);
assert(a2.body_fat_method === 'jp7', `a2 método ${a2.body_fat_method}`);
assert(a1.bmi === 29 && a2.bmi === 27.6, `IMC a1/a2 ${a1.bmi}/${a2.bmi}`);
assert(a1.waist_hip_ratio === 0.96, `RCQ a1 ${a1.waist_hip_ratio}`);
assert(a1.waist_risk?.key === 'raised', `risco cintura a1 ${a1.waist_risk?.key}`);
assert(a1.tmb_mifflin_kcal != null && a2.tmb_mifflin_kcal < a1.tmb_mifflin_kcal, 'TMB cai com peso');
assert(a1.age_at_assessment === 34, `idade a1 ${a1.age_at_assessment}`);

const delta = compareAssessments(a1, a2);
assert(delta.delta_peso_kg === -4.5, `Δ peso ${delta.delta_peso_kg}`);
assert(delta.delta_body_fat_pct < 0, `Δ % gordura ${delta.delta_body_fat_pct}`);
assert(delta.fat_loss_kg === 5.8, `perda gordura ${delta.fat_loss_kg}`);
assert(delta.lean_gain_kg === 1.3, `ganho magra ${delta.lean_gain_kg}`);
assert(delta.delta_cintura_cm === -8, `Δ cintura ${delta.delta_cintura_cm}`);

console.log('— enrichAssessment Ana (feminino) —');
const ana = enrichAssessment({
  id: 'ana1', avaliado_em: '2026-11-01', peso_kg: 62, altura_cm: 165,
  pescoco_cm: 32, cintura_cm: 74, quadril_cm: 98,
  triceps_mm: 16, suprailiaca_mm: 14, coxa_mm: 20,
}, profileF);
assert(ana.body_fat_method === 'jp3', `Ana método ${ana.body_fat_method}`);
assert(ana.body_fat_pct != null, `Ana % ${ana.body_fat_pct}`);
assert(ana.waist_hip_ratio === 0.76, `Ana RCQ ${ana.waist_hip_ratio}`);
assert(ana.waist_risk?.key === 'ok', `Ana cintura ${ana.waist_risk?.key}`);
assert(ana.waist_hip_risk?.key === 'ok', `Ana RCQ risco ${ana.waist_hip_risk?.key}`);
assert(ana.tmb_mifflin_kcal === 1335, `Ana TMB ${ana.tmb_mifflin_kcal}`);

console.log('— Validação de formulário —');
const okMale = validateAssessmentInput({
  avaliado_em: '2026-11-01',
  peso_kg: '87,5',
  pescoco_cm: 39, cintura_cm: 90, quadril_cm: 98,
  peito_mm: 14, abdominal_mm: 22, coxa_mm: 18,
}, { ...profileM, altura_cm: 178 });
assert(okMale.error == null, `validação homem ok: ${okMale.error}`);
assert(okMale.data.peso_kg === 87.5, 'vírgula decimal peso');
assert(okMale.data.altura_cm === 178, 'altura do cadastro');
assert(okMale.data.metodo_preferido === 'auto', 'método sempre auto');

const okFemale = validateAssessmentInput({
  avaliado_em: '2026-11-01',
  peso_kg: 62, altura_cm: 165,
  pescoco_cm: 32, cintura_cm: 74, quadril_cm: 98,
  triceps_mm: 16, suprailiaca_mm: 14, coxa_mm: 20,
}, profileF);
assert(okFemale.error == null, `validação mulher ok: ${okFemale.error}`);

const missSex = validateAssessmentInput({
  avaliado_em: '2026-11-01', peso_kg: 80, altura_cm: 175,
  pescoco_cm: 38, cintura_cm: 88, quadril_cm: 95,
  peito_mm: 12, abdominal_mm: 20, coxa_mm: 16,
}, {});
assert(/sexo/i.test(missSex.error || ''), `sem sexo → ${missSex.error}`);

const missMaleFold = validateAssessmentInput({
  avaliado_em: '2026-11-01', peso_kg: 80, altura_cm: 175,
  pescoco_cm: 38, cintura_cm: 88, quadril_cm: 95,
  peito_mm: 12, coxa_mm: 16,
}, profileM);
assert(/Abdominal/i.test(missMaleFold.error || ''), `falta abdominal homem → ${missMaleFold.error}`);

const missFemaleFold = validateAssessmentInput({
  avaliado_em: '2026-11-01', peso_kg: 62, altura_cm: 165,
  pescoco_cm: 32, cintura_cm: 74, quadril_cm: 98,
  triceps_mm: 16, coxa_mm: 20,
}, profileF);
assert(/Suprailíaca/i.test(missFemaleFold.error || ''), `falta supra mulher → ${missFemaleFold.error}`);

const badWaist = validateAssessmentInput({
  avaliado_em: '2026-11-01', peso_kg: 80, altura_cm: 175,
  pescoco_cm: 40, cintura_cm: 40, quadril_cm: 95,
  peito_mm: 12, abdominal_mm: 20, coxa_mm: 16,
}, profileM);
assert(/cintura/i.test(badWaist.error || ''), `cintura≤pescoço → ${badWaist.error}`);

const badDate = validateAssessmentInput({
  avaliado_em: '01/11/2026', peso_kg: 80, altura_cm: 175,
  pescoco_cm: 38, cintura_cm: 88, quadril_cm: 95,
  peito_mm: 12, abdominal_mm: 20, coxa_mm: 16,
}, profileM);
assert(/data/i.test(badDate.error || ''), `data inválida → ${badDate.error}`);

const norm = normalizeAssessmentInput({
  avaliado_em: '2026-11-01',
  peso_kg: '90',
  altura_cm: '180',
  axilar_media_mm: '11,5',
  observacoes: '  teste  ',
});
assert(norm.axilar_media_mm === 11.5, 'axilar com vírgula');
assert(norm.observacoes === 'teste', 'trim observações');
assert(norm.metodo_preferido === 'auto', 'normalize força auto');

console.log('— Casos extremos / regressão —');
assert(compareAssessments(null, a2) == null, 'compare sem older');
assert(enrichAssessment({ peso_kg: 80, altura_cm: 175 }, {}).body_fat_pct == null, 'sem medidas → sem %');
const hugeFolds = jp7BodyFat({
  sex: 'male', age: 40,
  chestMm: 70, midaxillaryMm: 70, tricepsMm: 70, subscapularMm: 70,
  abdominalMm: 70, suprailiacMm: 70, thighMm: 70,
});
assert(hugeFolds == null || (hugeFolds >= 1 && hugeFolds <= 70), `JP7 dobras altas tratado → ${hugeFolds}`);

console.log('');
console.log(`Resultado: ${passed} ok, ${failed} falha(s)`);
if (failures.length) {
  console.error(failures.map((f) => ` • ${f}`).join('\n'));
  process.exit(1);
}
console.log('ok — todos os cenários passaram', {
  navyMale, navyFemale, jp3m, jp3f, jp7m, jp7f,
  a1: { bf: a1.body_fat_pct, method: a1.body_fat_method, bmi: a1.bmi },
  a2: { bf: a2.body_fat_pct, method: a2.body_fat_method, bmi: a2.bmi },
  ana: { bf: ana.body_fat_pct, method: ana.body_fat_method, rcq: ana.waist_hip_ratio },
  delta: {
    peso: delta.delta_peso_kg,
    bf: delta.delta_body_fat_pct,
    fatLoss: delta.fat_loss_kg,
    leanGain: delta.lean_gain_kg,
  },
});
