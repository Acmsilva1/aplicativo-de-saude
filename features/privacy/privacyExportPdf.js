import { escapeHtml } from '../../lib/htmlEscape.js';

function roleLabel(role) {
  if (role === 'student') return 'Aluno';
  if (role === 'professor') return 'Professor';
  if (role === 'admin') return 'Administração';
  return role || '—';
}

function sexLabel(sexo) {
  if (sexo === 'male') return 'Masculino';
  if (sexo === 'female') return 'Feminino';
  return '—';
}

function fmtDate(value) {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return value ? String(value) : '—';
  const [y, m, d] = raw.split('-');
  return `${d}/${m}/${y}`;
}

function fmtNum(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: digits });
}

function section(title, body) {
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function dl(rows) {
  const items = rows
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<div class="row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`)
    .join('');
  return `<div class="grid">${items || '<p>Sem dados nesta seção.</p>'}</div>`;
}

function buildPrivacyExportHtml(bundle = {}) {
  const profile = bundle.profile || {};
  const health = bundle.health || {};
  const exported = new Date(bundle.exported_at || Date.now()).toLocaleString('pt-BR');

  const profileBlock = dl([
    ['Nome', profile.name || '—'],
    ['E-mail', profile.email || '—'],
    ['Telefone', profile.phone || '—'],
    ['Perfil', roleLabel(profile.role)],
    ['Sexo', sexLabel(profile.sexo)],
    ['Nascimento', fmtDate(profile.data_nascimento)],
    ['Altura (cm)', profile.altura_cm != null ? fmtNum(profile.altura_cm, 1) : '—'],
  ]);

  let healthHtml = '';
  if (bundle.note) {
    healthHtml = `<p>${escapeHtml(bundle.note)}</p>`;
  } else if (profile.role === 'student') {
    const diets = Array.isArray(health.diets) ? health.diets : [];
    const assessments = Array.isArray(health.assessments) ? health.assessments : [];
    const water = health.water || {};
    const dietList = diets.length
      ? `<ul>${diets.map((d) => `<li><strong>${escapeHtml(d.titulo || d.title || 'Dieta')}</strong>${d.objetivo ? ` — ${escapeHtml(d.objetivo)}` : ''}${d.visible_to_student === false ? ' (não publicada)' : ''}</li>`).join('')}</ul>`
      : '<p>Nenhuma dieta cadastrada.</p>';
    const waterBlock = dl([
      ['Meta diária (ml)', water.goal_ml != null ? fmtNum(water.goal_ml, 0) : '—'],
      ['Total do dia (ml)', water.total_ml != null ? fmtNum(water.total_ml, 0) : '—'],
      ['Nome da meta', water.nome || '—'],
    ]);
    const assessmentList = assessments.length
      ? `<ul>${assessments.map((a) => {
        const when = fmtDate(a.avaliado_em);
        const peso = a.peso_kg != null ? `${fmtNum(a.peso_kg, 1)} kg` : '—';
        const bf = a.body_fat_pct != null || a.gordura_pct != null
          ? `${fmtNum(a.body_fat_pct ?? a.gordura_pct, 1)}% gordura`
          : '';
        const bmi = a.bmi != null ? `IMC ${fmtNum(a.bmi, 1)}` : '';
        const extra = [peso, bf, bmi].filter(Boolean).join(' · ');
        return `<li><strong>${escapeHtml(when)}</strong>${extra ? ` — ${escapeHtml(extra)}` : ''}</li>`;
      }).join('')}</ul>`
      : '<p>Nenhuma avaliação corporal cadastrada.</p>';
    healthHtml = [
      section('Dietas', dietList),
      section('Hidratação', waterBlock),
      section('Avaliações corporais', assessmentList),
    ].join('');
  } else if (profile.role === 'professor') {
    const templates = Array.isArray(health.templates) ? health.templates : [];
    const students = Array.isArray(health.students) ? health.students : [];
    const templateList = templates.length
      ? `<ul>${templates.map((t) => `<li><strong>${escapeHtml(t.titulo || t.title || 'Modelo')}</strong>${t.objetivo ? ` — ${escapeHtml(t.objetivo)}` : ''}</li>`).join('')}</ul>`
      : '<p>Nenhum modelo no portfólio.</p>';
    const studentList = students.length
      ? `<ul>${students.map((s) => `<li><strong>${escapeHtml(s.name || s.nome || 'Aluno')}</strong>${s.email ? ` — ${escapeHtml(s.email)}` : ''}</li>`).join('')}</ul>`
      : '<p>Nenhum aluno vinculado.</p>';
    healthHtml = [
      section('Modelos de dieta', templateList),
      section('Alunos vinculados', studentList),
    ].join('');
  }

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Meus dados — Ritmo Saúde</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; color: #1b2430; margin: 24px; line-height: 1.45; font-size: 12.5px; }
    h1 { font-size: 1.35rem; margin: 0 0 .35rem; }
    h2 { font-size: 1rem; margin: 1.1rem 0 .4rem; border-bottom: 1px solid #d7dde6; padding-bottom: .2rem; }
    .meta { color: #5b6b80; margin: 0 0 1rem; font-size: .92rem; }
    .grid { display: grid; gap: .35rem; }
    .row { display: grid; grid-template-columns: 9.5rem 1fr; gap: .5rem; }
    .row span { color: #5b6b80; }
    ul { margin: .2rem 0 0; padding-left: 1.15rem; }
    li + li { margin-top: .2rem; }
    .note { background: #f4f6f9; border: 1px solid #e2e7ee; border-radius: 8px; padding: .65rem .75rem; margin: 0 0 1rem; }
    .foot { margin-top: 1.4rem; color: #6a7788; font-size: .85rem; }
    .no-print { margin: 0 0 1rem; }
    @media print { .no-print { display: none !important; } body { margin: 12mm; } }
  </style>
</head>
<body>
  <div class="no-print"><button type="button" onclick="window.print()">Salvar / imprimir PDF</button></div>
  <h1>Meus dados — Ritmo Saúde</h1>
  <p class="meta">Exportação solicitada em ${escapeHtml(exported)}</p>
  <p class="note">${escapeHtml(bundle.retention_note || 'Documento gerado a seu pedido. Contém dados pessoais e de saúde — guarde com cuidado.')}</p>
  ${section('Cadastro', profileBlock)}
  ${healthHtml}
  <p class="foot">Ritmo Saúde · este PDF é seus dados. Não compartilhe sem necessidade.</p>
</body>
</html>`;
}

/**
 * Abre o diálogo de impressão para o usuário salvar como PDF
 * (mesmo padrão das avaliações corporais).
 */
export function openPrivacyExportPdf(bundle) {
  if (!bundle || bundle.error || typeof document === 'undefined') return false;
  const html = buildPrivacyExportHtml(bundle);

  const existing = document.getElementById('privacy-pdf-frame');
  if (existing) existing.remove();

  const frame = document.createElement('iframe');
  frame.id = 'privacy-pdf-frame';
  frame.title = 'Exportação dos meus dados';
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

  if (frame.contentWindow?.document?.readyState === 'complete') {
    setTimeout(runPrint, 150);
  } else {
    frame.addEventListener('load', () => setTimeout(runPrint, 150), { once: true });
  }
  return true;
}
