/** Fórmulas alinhadas ao MyFitnessClient / Hodgdon–Beckett (Navy) / Jackson–Pollock 3 + Siri. */

const round1 = (value) => Math.round(Number(value) * 10) / 10;
const round2 = (value) => Math.round(Number(value) * 100) / 100;

export function ageOnDate(birthDate, onDate = new Date()) {
  if (!birthDate) return null;
  const birth = new Date(`${String(birthDate).slice(0, 10)}T12:00:00`);
  const ref = onDate instanceof Date ? onDate : new Date(`${String(onDate).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(ref.getTime())) return null;
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

export function calcBmi(weightKg, heightCm) {
  const w = Number(weightKg);
  const h = Number(heightCm) / 100;
  if (!(w > 0) || !(h > 0)) return null;
  return round1(w / (h * h));
}

export function bmiCategory(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return { key: 'underweight', label: 'Abaixo do peso' };
  if (bmi < 25) return { key: 'normal', label: 'Peso normal' };
  if (bmi < 30) return { key: 'overweight', label: 'Sobrepeso' };
  return { key: 'obese', label: 'Obesidade' };
}

function siriFromDensity(density) {
  if (!(density > 0)) return null;
  const pct = (4.95 / density - 4.5) * 100;
  if (!Number.isFinite(pct) || pct < 1 || pct > 70) return null;
  return round1(pct);
}

/** US Navy (Hodgdon & Beckett, 1984) — medidas em cm. */
export function navyBodyFat({ sex, heightCm, neckCm, waistCm, hipCm }) {
  const height = Number(heightCm);
  const neck = Number(neckCm);
  const waist = Number(waistCm);
  const hip = Number(hipCm);
  if (!(height > 0) || !(neck > 0) || !(waist > 0)) return null;
  if (!(waist > neck)) return null;
  let density;
  if (sex === 'male') {
    density = 1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height);
  } else if (sex === 'female') {
    if (!(hip > 0)) return null;
    density = 1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.221 * Math.log10(height);
  } else {
    return null;
  }
  return siriFromDensity(density);
}

/** Jackson–Pollock 3 sítios + Siri. Dobras em mm. */
export function jp3BodyFat({ sex, age, chestMm, abdominalMm, thighMm, tricepsMm, suprailiacMm }) {
  if (!(age > 0)) return null;
  let sum;
  let density;
  if (sex === 'male') {
    sum = Number(chestMm) + Number(abdominalMm) + Number(thighMm);
    if (!(sum > 0)) return null;
    density = 1.10938 - 0.0008267 * sum + 0.0000016 * sum * sum - 0.0002574 * age;
  } else if (sex === 'female') {
    sum = Number(tricepsMm) + Number(suprailiacMm) + Number(thighMm);
    if (!(sum > 0)) return null;
    density = 1.0994921 - 0.0009929 * sum + 0.0000023 * sum * sum - 0.0001392 * age;
  } else {
    return null;
  }
  return siriFromDensity(density);
}

/** Jackson–Pollock 7 sítios + Siri. Exige as 7 dobras em mm. */
export function jp7BodyFat({
  sex,
  age,
  chestMm,
  midaxillaryMm,
  tricepsMm,
  subscapularMm,
  abdominalMm,
  suprailiacMm,
  thighMm,
}) {
  if (!(age > 0)) return null;
  const sites = [chestMm, midaxillaryMm, tricepsMm, subscapularMm, abdominalMm, suprailiacMm, thighMm]
    .map((value) => Number(value));
  if (sites.some((value) => !(value > 0))) return null;
  const sum = sites.reduce((acc, value) => acc + value, 0);
  let density;
  if (sex === 'male') {
    density = 1.112 - 0.00043499 * sum + 0.00000055 * sum * sum - 0.00028826 * age;
  } else if (sex === 'female') {
    density = 1.097 - 0.00046971 * sum + 0.00000056 * sum * sum - 0.00012828 * age;
  } else {
    return null;
  }
  return siriFromDensity(density);
}

export function bodyMasses(weightKg, bodyFatPct) {
  const w = Number(weightKg);
  const pct = Number(bodyFatPct);
  if (!(w > 0) || !Number.isFinite(pct) || pct < 0 || pct > 100) {
    return { fat_mass_kg: null, lean_mass_kg: null, lean_mass_pct: null };
  }
  const fat = round1(w * pct / 100);
  const lean = round1(w - fat);
  return {
    fat_mass_kg: fat,
    lean_mass_kg: lean,
    lean_mass_pct: round1(100 - pct),
  };
}

/** Risco cardiometabólico pela cintura (OMS / SBC aproximado). */
export function waistRisk(sex, waistCm) {
  const w = Number(waistCm);
  if (!(w > 0) || !sex) return null;
  if (sex === 'male') {
    if (w > 102) return { key: 'high', label: 'Risco muito aumentado', detail: '> 102 cm' };
    if (w > 94) return { key: 'raised', label: 'Risco aumentado', detail: '> 94 cm' };
    return { key: 'ok', label: 'Dentro do esperado', detail: '≤ 94 cm' };
  }
  if (sex === 'female') {
    if (w > 88) return { key: 'high', label: 'Risco muito aumentado', detail: '> 88 cm' };
    if (w > 80) return { key: 'raised', label: 'Risco aumentado', detail: '> 80 cm' };
    return { key: 'ok', label: 'Dentro do esperado', detail: '≤ 80 cm' };
  }
  return null;
}

/** RCQ — razão cintura/quadril (OMS). */
export function waistHipRisk(sex, ratio) {
  const r = Number(ratio);
  if (!Number.isFinite(r) || !sex) return null;
  if (sex === 'male') {
    if (r > 1) return { key: 'high', label: 'Risco alto', detail: '> 1,00' };
    if (r > 0.9) return { key: 'raised', label: 'Risco aumentado', detail: '> 0,90' };
    return { key: 'ok', label: 'Dentro do esperado', detail: '≤ 0,90' };
  }
  if (sex === 'female') {
    if (r > 0.9) return { key: 'high', label: 'Risco alto', detail: '> 0,90' };
    if (r > 0.85) return { key: 'raised', label: 'Risco aumentado', detail: '> 0,85' };
    return { key: 'ok', label: 'Dentro do esperado', detail: '≤ 0,85' };
  }
  return null;
}

/** TMB Mifflin-St Jeor (kcal/dia) — padrão clínico amplo. */
export function mifflinStJeor({ sex, weightKg, heightCm, age }) {
  const w = Number(weightKg);
  const h = Number(heightCm);
  const a = Number(age);
  if (!(w > 0) || !(h > 0) || !(a > 0) || !sex) return null;
  const base = 10 * w + 6.25 * h - 5 * a;
  const tmb = sex === 'male' ? base + 5 : base - 161;
  return Number.isFinite(tmb) ? Math.round(tmb) : null;
}

/** TMB Cunningham a partir da massa magra (kcal/dia). */
export function cunninghamTmb(leanMassKg) {
  const lean = Number(leanMassKg);
  if (!(lean > 0)) return null;
  return Math.round(500 + 22 * lean);
}

/** Faixa de peso associada ao IMC 18,5–24,9 para a altura informada. */
export function idealWeightRange(heightCm) {
  const h = Number(heightCm) / 100;
  if (!(h > 0)) return null;
  return {
    min_kg: round1(18.5 * h * h),
    max_kg: round1(24.9 * h * h),
    reference: 'IMC 18,5–24,9 (OMS)',
  };
}

/** Categorias ACE (magros) + Gallagher 2000 (normal/sobrepeso/obeso) por sexo/idade. */
export function bodyFatCategory(sex, bodyFatPct, age = 30) {
  const pct = Number(bodyFatPct);
  if (!Number.isFinite(pct)) return null;
  const years = Number.isFinite(Number(age)) ? Number(age) : 30;
  if (sex === 'male') {
    if (pct < 6) return { key: 'essential', label: 'Gordura essencial' };
    if (pct < 14) return { key: 'athlete', label: 'Atleta' };
    if (pct < 18) return { key: 'fit', label: 'Em forma' };
    const normalMax = years < 40 ? 20 : years < 60 ? 22 : 25;
    const overMax = years < 40 ? 25 : years < 60 ? 28 : 30;
    if (pct < normalMax) return { key: 'normal', label: 'Normal' };
    if (pct < overMax) return { key: 'overweight', label: 'Sobrepeso' };
    return { key: 'obese', label: 'Obesidade' };
  }
  if (sex === 'female') {
    if (pct < 14) return { key: 'essential', label: 'Gordura essencial' };
    if (pct < 21) return { key: 'athlete', label: 'Atleta' };
    if (pct < 25) return { key: 'fit', label: 'Em forma' };
    const normalMax = years < 40 ? 33 : years < 60 ? 34 : 36;
    const overMax = years < 40 ? 39 : years < 60 ? 40 : 42;
    if (pct < normalMax) return { key: 'normal', label: 'Normal' };
    if (pct < overMax) return { key: 'overweight', label: 'Sobrepeso' };
    return { key: 'obese', label: 'Obesidade' };
  }
  return null;
}

const METHOD_LABELS = {
  manual: 'Informado manualmente',
  jp7: 'Pinça · Jackson-Pollock 7',
  jp3: 'Pinça · Jackson-Pollock 3',
  navy: 'Fita · US Navy',
};

export function resolveBodyFat(assessment, profile = {}) {
  const sex = profile.sexo || profile.sex || assessment.sexo;
  const age = ageOnDate(profile.data_nascimento || profile.birth_date, assessment.avaliado_em);
  const preferred = assessment.metodo_preferido || 'auto';
  const candidates = [];

  const manual = Number(assessment.gordura_pct_informada);
  if (Number.isFinite(manual) && manual > 0 && manual <= 70) {
    candidates.push({ method: 'manual', body_fat_pct: round1(manual) });
  }

  const jp7 = jp7BodyFat({
    sex,
    age,
    chestMm: assessment.peito_mm,
    midaxillaryMm: assessment.axilar_media_mm,
    tricepsMm: assessment.triceps_mm,
    subscapularMm: assessment.subescapular_mm,
    abdominalMm: assessment.abdominal_mm,
    suprailiacMm: assessment.suprailiaca_mm,
    thighMm: assessment.coxa_mm,
  });
  if (jp7 != null) candidates.push({ method: 'jp7', body_fat_pct: jp7 });

  const jp3 = jp3BodyFat({
    sex,
    age,
    chestMm: assessment.peito_mm,
    abdominalMm: assessment.abdominal_mm,
    thighMm: assessment.coxa_mm,
    tricepsMm: assessment.triceps_mm,
    suprailiacMm: assessment.suprailiaca_mm,
  });
  if (jp3 != null) candidates.push({ method: 'jp3', body_fat_pct: jp3 });

  const navy = navyBodyFat({
    sex,
    heightCm: assessment.altura_cm,
    neckCm: assessment.pescoco_cm,
    waistCm: assessment.cintura_cm,
    hipCm: assessment.quadril_cm,
  });
  if (navy != null) candidates.push({ method: 'navy', body_fat_pct: navy });

  let chosen = null;
  if (preferred !== 'auto') {
    chosen = candidates.find((item) => item.method === preferred) || null;
  }
  if (!chosen) {
    // Medidas preenchidas: JP7 (7 dobras) → JP3 → fita (Navy) → manual.
    const order = ['jp7', 'jp3', 'navy', 'manual'];
    for (const key of order) {
      chosen = candidates.find((item) => item.method === key);
      if (chosen) break;
    }
  }

  return {
    sex,
    age,
    available_methods: candidates.map((item) => item.method),
    method: chosen?.method || null,
    method_label: chosen ? METHOD_LABELS[chosen.method] : null,
    body_fat_pct: chosen?.body_fat_pct ?? null,
  };
}

export function enrichAssessment(assessment, profile = {}) {
  const bmi = calcBmi(assessment.peso_kg, assessment.altura_cm);
  const resolved = resolveBodyFat(assessment, profile);
  const masses = bodyMasses(assessment.peso_kg, resolved.body_fat_pct);
  const whr = Number(assessment.cintura_cm) > 0 && Number(assessment.quadril_cm) > 0
    ? round2(Number(assessment.cintura_cm) / Number(assessment.quadril_cm))
    : null;
  const ideal = idealWeightRange(assessment.altura_cm);
  const tmbMifflin = mifflinStJeor({
    sex: resolved.sex,
    weightKg: assessment.peso_kg,
    heightCm: assessment.altura_cm,
    age: resolved.age,
  });
  const tmbCunningham = cunninghamTmb(masses.lean_mass_kg);

  return {
    ...assessment,
    bmi,
    bmi_category: bmiCategory(bmi),
    body_fat_pct: resolved.body_fat_pct,
    body_fat_method: resolved.method,
    body_fat_method_label: resolved.method_label,
    body_fat_available_methods: resolved.available_methods,
    body_fat_category: bodyFatCategory(resolved.sex, resolved.body_fat_pct, resolved.age),
    fat_mass_kg: masses.fat_mass_kg,
    lean_mass_kg: masses.lean_mass_kg,
    lean_mass_pct: masses.lean_mass_pct,
    waist_hip_ratio: whr,
    waist_risk: waistRisk(resolved.sex, assessment.cintura_cm),
    waist_hip_risk: waistHipRisk(resolved.sex, whr),
    ideal_weight: ideal,
    tmb_mifflin_kcal: tmbMifflin,
    tmb_cunningham_kcal: tmbCunningham,
    age_at_assessment: resolved.age,
  };
}

export function compareAssessments(older, newer) {
  if (!older || !newer) return null;
  const delta = (a, b) => (a == null || b == null ? null : round1(b - a));
  const dWeight = delta(older.peso_kg, newer.peso_kg);
  const dFatPct = delta(older.body_fat_pct, newer.body_fat_pct);
  const dFatMass = delta(older.fat_mass_kg, newer.fat_mass_kg);
  const dLean = delta(older.lean_mass_kg, newer.lean_mass_kg);
  const dBmi = delta(older.bmi, newer.bmi);
  const dWaist = delta(older.cintura_cm, newer.cintura_cm);
  const dWhr = delta(older.waist_hip_ratio, newer.waist_hip_ratio);
  const dTmb = (older.tmb_mifflin_kcal != null && newer.tmb_mifflin_kcal != null)
    ? newer.tmb_mifflin_kcal - older.tmb_mifflin_kcal
    : null;

  return {
    from_id: older.id,
    to_id: newer.id,
    from_date: older.avaliado_em,
    to_date: newer.avaliado_em,
    delta_peso_kg: dWeight,
    delta_bmi: dBmi,
    delta_body_fat_pct: dFatPct,
    delta_fat_mass_kg: dFatMass,
    delta_lean_mass_kg: dLean,
    delta_cintura_cm: dWaist,
    delta_waist_hip_ratio: dWhr,
    delta_tmb_mifflin_kcal: dTmb,
    fat_loss_kg: dFatMass != null && dFatMass < 0 ? round1(Math.abs(dFatMass)) : null,
    lean_gain_kg: dLean != null && dLean > 0 ? dLean : null,
  };
}
