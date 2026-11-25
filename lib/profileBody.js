/** Campos de composição corporal no cadastro (sexo, nascimento, altura). */

export function normalizeProfileBodyFields(input = {}, { required = false } = {}) {
  const sexRaw = String(input.sexo || input.sex || '').trim().toLowerCase();
  const sexo = sexRaw === 'male' || sexRaw === 'female' ? sexRaw : null;

  const birthRaw = String(input.data_nascimento || input.birth_date || '').slice(0, 10);
  const data_nascimento = /^\d{4}-\d{2}-\d{2}$/.test(birthRaw) ? birthRaw : null;

  let altura_cm = null;
  if (input.altura_cm != null && input.altura_cm !== '') {
    const n = Number(String(input.altura_cm).replace(',', '.'));
    if (!Number.isFinite(n) || n < 100 || n > 250) {
      return { error: 'Altura deve ficar entre 100 e 250 cm.' };
    }
    altura_cm = Math.round(n * 10) / 10;
  }

  if (required) {
    if (!sexo) return { error: 'Informe o sexo (masculino ou feminino).' };
    if (!data_nascimento) return { error: 'Informe a data de nascimento.' };
    if (altura_cm == null) return { error: 'Informe a altura (cm).' };
  }

  return { sexo, data_nascimento, altura_cm };
}
