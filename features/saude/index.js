import { confirmAction, showToast } from './service/uiConfirmation.js';
import { WATER_AMOUNTS_ML, waterAmountLabel } from './service/waterIntakeService.js';
import { DIET_MEALS, DIET_WEEK, dietDayIndex, dietForDate, todayDietDate } from './service/dietasService.js';
import { DIET_NUTRITION_STYLES, renderDietFoodDetails, renderDietNutritionTotal } from './dietNutritionView.js';
import { renderWaterDropHtml, WATER_DROP_STYLES } from './waterDropVisual.js';

const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const profileId = (profile) => String(profile?.id ?? profile?.user_id ?? '');
const profileName = (profile) => String(profile?.name ?? profile?.nome ?? 'Aluno');
const noticeText = (notice) => typeof notice === 'string' ? notice : notice?.text || '';
const MEAL_EMOJIS = { cafe_da_manha: '☕', lanche_da_manha: '🍎', almoco: '🍛', lanche_da_tarde: '🥪', jantar: '🍲', ceia: '🌙' };
const mealEmoji = (tipo) => MEAL_EMOJIS[tipo] || '🍽️';
const waterEmoji = () => '💧';
const FOOD_UNIT_OPTIONS = [
  { value: 'g', label: 'Gramas (g)', emoji: '⚖️' },
  { value: 'un', label: 'Unidades', emoji: '🔢' },
  { value: 'ml', label: 'Mililitros', emoji: '🧪' },
  { value: 'porcao', label: 'Porções', emoji: '🍽️' },
];
const DIET_FORMAT_OPTIONS = [
  { value: 'single', label: 'Dieta fixa', emoji: '📌', detail: 'O mesmo cardápio e horários todos os dias.' },
  { value: 'weekly', label: 'Dieta semanal', emoji: '🗓️', detail: 'Cardápio separado de segunda a domingo.' },
];

function renderNotice() {
  return '';
}

function publishNotice(notice) {
  const message = noticeText(notice);
  if (!message) return;
  const explicit = typeof notice === 'object' ? notice?.type : '';
  const type = explicit === 'error' || explicit === 'success'
    ? explicit
    : /indispon|erro|falha|inválid|invalid|obrigat|senha|credencial/i.test(message) ? 'error' : 'success';
  showToast(message, { type });
}

function syncChoiceField(root, name, value) {
  if (!root) return;
  const field = root.querySelector(`[name="${name}"]`) || root.elements?.namedItem?.(name);
  if (field) field.value = value ?? '';
  root.querySelectorAll(`[data-choice-set="${name}"]`).forEach((button) => {
    const selected = String(button.dataset.choiceValue) === String(value);
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function renderChoiceOptions({ name, label, value, options = [], required = false, disabled = false, variant = 'tags', help = '', fieldAttrs = '' }) {
  const selected = String(value ?? '');
  const hidden = `<input type="hidden" name="${esc(name)}" value="${esc(selected)}"${required ? ' required' : ''}${disabled ? ' disabled' : ''}${fieldAttrs ? ` ${fieldAttrs}` : ''}>`;
  const buttons = options.map((option) => {
    const isSelected = String(option.value) === selected;
    const emoji = option.emoji ? `<span class="saude-choice-emoji" aria-hidden="true">${option.emoji}</span>` : '';
    if (variant === 'cards') {
      return `<button type="button" class="saude-choice-card${isSelected ? ' is-selected' : ''}" data-choice-set="${esc(name)}" data-choice-value="${esc(option.value)}" aria-pressed="${isSelected}"${disabled ? ' disabled' : ''}><strong>${emoji}${esc(option.label)}</strong>${option.detail ? `<span>${esc(option.detail)}</span>` : ''}</button>`;
    }
    return `<button type="button" class="saude-choice-tag${isSelected ? ' is-selected' : ''}" data-choice-set="${esc(name)}" data-choice-value="${esc(option.value)}" aria-pressed="${isSelected}"${disabled ? ' disabled' : ''}>${emoji}<span>${esc(option.label)}</span>${option.detail ? `<small>${esc(option.detail)}</small>` : ''}</button>`;
  }).join('');
  const groupClass = variant === 'cards' ? 'saude-diet-type-options' : 'saude-choice-tags';
  return `<div class="saude-choice-field${disabled ? ' is-disabled' : ''}" data-choice-field="${esc(name)}"><span class="saude-choice-label">${label}</span>${hidden}<div class="${groupClass}" role="group" aria-label="${esc(String(label).replace(/<[^>]+>/g, ''))}">${buttons}</div>${help}</div>`;
}

function navRow({ action, id, icon, label, meta = '', detail = '', disabled = false }) {
  return `<li><button type="button" class="fin-nav-row" data-action="${esc(action)}" data-id="${esc(id)}"${disabled ? ' disabled' : ''}>
    <span class="fin-nav-row__icon" aria-hidden="true">${icon}</span>
    <span class="fin-nav-row__main"><span class="fin-nav-row__label">${esc(label)}</span>${detail ? `<small class="fin-nav-row__detail">${esc(detail)}</small>` : ''}</span>
    ${meta ? `<span class="saude-nav-meta">${esc(meta)}</span>` : ''}<span class="fin-nav-row__chevron" aria-hidden="true">›</span>
  </button></li>`;
}

function renderProfessorDrill(professors = [], selectedProfessorId = '', { name = 'professor_id', required = false, disabled = false } = {}) {
  const selected = professors.find((item) => profileId(item) === String(selectedProfessorId)) || professors[0] || null;
  const id = selected ? profileId(selected) : '';
  const rows = professors.map((professor) => {
    const pid = profileId(professor);
    const active = pid === id;
    return `<li><button type="button" class="saude-drill-option${active ? ' is-selected' : ''}" role="option" data-choice-set="${esc(name)}" data-choice-value="${esc(pid)}" data-drill-pick aria-selected="${active}"${disabled ? ' disabled' : ''}>
      <span class="saude-drill-option__main"><span class="saude-drill-option__label">${esc(profileName(professor))}</span><small class="saude-drill-option__detail">${esc(professor.email || 'Professor')}</small></span>
      ${active ? '<span class="saude-nav-meta">Atual</span>' : ''}
    </button></li>`;
  }).join('');
  return `<div class="saude-student-picker saude-selection-drill${disabled ? ' is-disabled' : ''}" data-student-drill>
    <input type="hidden" name="${esc(name)}" value="${esc(id)}"${required ? ' required' : ''}${disabled ? ' disabled' : ''}>
    <button type="button" class="saude-drill-trigger" data-student-drill-toggle aria-haspopup="listbox" aria-expanded="false"${disabled ? ' disabled' : ''}>
      <span class="saude-drill-trigger__label">Professor</span>
      <span class="saude-drill-trigger__value">${esc(selected ? profileName(selected) : 'Selecione')}</span>
      <span class="saude-drill-trigger__chevron" aria-hidden="true">›</span>
    </button>
    <ul class="saude-drill-list" role="listbox" data-student-drill-list hidden>${rows || '<li class="saude-empty-row">Nenhum professor ativo.</li>'}</ul>
  </div>`;
}

function renderStudentDrill(profiles = [], selectedUserId = '', { name = '', required = false, disabled = false } = {}) {
  const selected = profiles.find((item) => profileId(item) === String(selectedUserId)) || profiles[0] || null;
  const id = selected ? profileId(selected) : '';
  const rows = profiles.map((profile) => {
    const pid = profileId(profile);
    const active = pid === id;
    const pickAttrs = name
      ? `data-choice-set="${esc(name)}" data-choice-value="${esc(pid)}" data-drill-pick`
      : `data-student-choice="${esc(pid)}"`;
    return `<li><button type="button" class="saude-drill-option${active ? ' is-selected' : ''}" role="option" ${pickAttrs} aria-selected="${active}"${disabled ? ' disabled' : ''}>
      <span class="saude-drill-option__main"><span class="saude-drill-option__label">${esc(profileName(profile))}</span><small class="saude-drill-option__detail">${esc(profile.email || 'Aluno')}</small></span>
      ${active ? '<span class="saude-nav-meta">Atual</span>' : ''}
    </button></li>`;
  }).join('');
  const hidden = name ? `<input type="hidden" name="${esc(name)}" value="${esc(id)}"${required ? ' required' : ''}${disabled ? ' disabled' : ''}>` : '';
  return `<div class="saude-student-picker saude-selection-drill${disabled ? ' is-disabled' : ''}" data-student-drill>
    ${hidden}
    <button type="button" class="saude-drill-trigger" data-student-drill-toggle aria-haspopup="listbox" aria-expanded="false"${disabled ? ' disabled' : ''}>
      <span class="saude-drill-trigger__label">Aluno</span>
      <span class="saude-drill-trigger__value">${esc(profileName(selected))}</span>
      <span class="saude-drill-trigger__chevron" aria-hidden="true">›</span>
    </button>
    <ul class="saude-drill-list" role="listbox" data-student-drill-list hidden>${rows}</ul>
  </div>`;
}

function renderDietStartModal(templates = []) {
  const cards = [
    `<button type="button" class="saude-choice-card" data-diet-start-choice=""><span class="saude-choice-emoji" aria-hidden="true">✨</span><strong>Começar do zero</strong><span>Monte o plano manualmente, sem modelo.</span></button>`,
    ...templates.map((template) => {
      const tid = String(template.id);
      return `<button type="button" class="saude-choice-card" data-diet-start-choice="${esc(tid)}"><span class="saude-choice-emoji" aria-hidden="true">${template.semanal ? '📅' : '🍽️'}</span><strong>${esc(template.titulo || template.title || 'Modelo')}</strong><span>${esc(template.semanal ? 'Modelo semanal' : 'Modelo fixo')}${template.objetivo ? ` · ${esc(template.objetivo)}` : ''}</span></button>`;
    }),
  ].join('');
  return `<div class="saude-modal-backdrop"><section class="saude-diet-modal saude-diet-start-modal" role="dialog" aria-modal="true" aria-labelledby="diet-start-title">
    <header class="saude-diet-modal__header"><div><h2 id="diet-start-title">➕ Nova dieta</h2><p>Escolha como começar o plano do aluno.</p></div><button class="saude-icon-btn" type="button" data-action="cancel-editor" aria-label="Fechar">×</button></header>
    <div class="saude-choice-field"><span class="saude-choice-label">📚 Começar com modelo</span><div class="saude-diet-type-options" role="group" aria-label="Começar com modelo">${cards}</div><small>Escolher um modelo copia o conteúdo para esta nova dieta.</small></div>
    <div class="saude-editor__actions"><button type="button" class="saude-btn" data-action="cancel-editor">Cancelar</button></div>
  </section></div>`;
}

function renderProfessorHome({ profiles = [], templates = [] } = {}) {
  const studentCount = profiles.length;
  const dietCount = templates.length;
  return `<section class="module-page saude-home-page">
    <header class="module-heading"><div><span class="eyebrow">ÁREA DO PROFESSOR</span><h1>🏠 Início</h1><p>Escolha por onde começar: alunos ou dietas.</p></div></header>
    <div class="saude-home-grid">
      <button type="button" class="saude-home-card" data-module="users">
        <span class="saude-home-card__icon" aria-hidden="true">👩‍🎓</span>
        <strong>Alunos</strong>
        <span>Gerencie perfis, dietas e acompanhamento de água.</span>
        <small>${studentCount} aluno${studentCount === 1 ? '' : 's'}</small>
      </button>
      <button type="button" class="saude-home-card" data-module="portfolio">
        <span class="saude-home-card__icon" aria-hidden="true">📚</span>
        <strong>Dietas</strong>
        <span>Modelos e portfólio de planos alimentares.</span>
        <small>${dietCount} modelo${dietCount === 1 ? '' : 's'}</small>
      </button>
    </div>
  </section>`;
}

function renderProfessorProfiles(profiles = [], selectedUserId = '') {
  const selected = profiles.find((item) => profileId(item) === String(selectedUserId)) || profiles[0] || null;
  const id = selected ? profileId(selected) : '';
  const water = selected?.water || {};
  const portfolioShortcut = '<button type="button" class="button button--primary" data-module="portfolio">📚 Portfólio de dietas</button>';
  return `<section class="module-page">
    <header class="module-heading"><div><span class="eyebrow">ÁREA DO PROFESSOR</span><h1>🎓 Meus alunos</h1><p>Escolha um aluno para gerenciar dieta e acompanhamento de água.</p></div>${portfolioShortcut}</header>
    ${profiles.length ? `${renderStudentDrill(profiles, id)}
    <article class="saude-student-card">
      <header class="saude-student-card__head">
        <span class="saude-avatar" aria-hidden="true">${esc(profileName(selected).slice(0, 1).toUpperCase())}</span>
        <div class="saude-student-card__who">
          <strong>${esc(profileName(selected))}</strong>
          <small>${esc(selected.email || 'Aluno')}</small>
        </div>
      </header>
      <div class="saude-student-card__metrics">
        <div class="saude-student-card__metric">
          <span class="saude-student-card__metric-label" aria-hidden="true">🍽️</span>
          <div>
            <small>Dieta</small>
            <strong>${esc(selected.diet_title || 'Sem dieta')}</strong>
          </div>
        </div>
        <div class="saude-student-card__metric">
          <span class="saude-student-card__metric-label" aria-hidden="true">💧</span>
          <div>
            <small>Água hoje</small>
            <strong>${(Number(water.total_ml || 0) / 1000).toLocaleString('pt-BR')} L</strong>
            <span>${water.goal_ml ? `Meta ${(water.goal_ml / 1000).toLocaleString('pt-BR')} L` : 'Sem meta definida'}</span>
          </div>
        </div>
      </div>
      <div class="saude-student-card__actions">
        <button class="saude-row-action is-primary" type="button" data-action="open-diets" data-id="${esc(id)}">🍽️ Dietas</button>
        <button class="saude-row-action" type="button" data-action="open-water" data-id="${esc(id)}">💧 Água</button>
      </div>
    </article>` : '<p class="saude-empty-row">Nenhum aluno ativo disponível.</p>'}
  </section>`;
}

function renderPortfolio(templates = []) {
  const rows = templates.map((template) => navRow({ action: 'open-template', id: template.id, icon: template.semanal ? '📅' : '🍽️', label: template.titulo || template.title || 'Modelo sem título', meta: template.semanal ? '📅 Semanal' : '📌 Fixa', detail: template.objetivo || template.observacoes || 'Modelo reutilizável' })).join('');
  return `<section class="module-page"><header class="module-heading"><div><span class="eyebrow">BIBLIOTECA DO PROFESSOR</span><h1>📚 Portfólio de dietas</h1><p>Crie modelos independentes para reutilizar em diferentes alunos.</p></div><button type="button" class="button button--primary" data-module="createTemplate">➕ Novo modelo</button></header><p class="fin-section-label">🗂️ Modelos · ${templates.length}</p><ul class="fin-list">${rows || '<li class="saude-empty-row">🗂️ Nenhum modelo cadastrado ainda.</li>'}</ul></section>`;
}

function renderTemplateDetail(template) {
  if (!template) return '<section class="module-page"><h1>Modelo</h1><p class="saude-empty-row">Selecione um modelo para abrir os detalhes.</p></section>';
  const detail = renderDietDetail(template, { showWeek: true });
  return detail.replace('<button class="back-link" type="button" data-action="back-to-diets">‹ Voltar para dietas</button>', '<button class="back-link" type="button" data-module="portfolio">‹ Voltar para portfólio</button>')
    .replace('</section>', `<div class="saude-detail-actions"><button type="button" class="saude-btn" data-action="use-template" data-id="${esc(template.id)}">Usar em aluno</button><button type="button" class="saude-btn saude-btn--danger" data-action="delete-template" data-id="${esc(template.id)}">Excluir modelo</button><button type="button" class="saude-btn saude-btn--primary" data-action="edit-template" data-id="${esc(template.id)}">Editar modelo</button></div></section>`);
}

function renderDietsList(profiles, diets = [], selectedUserId = '', isStudent = false) {
  const profile = profiles.find((item) => profileId(item) === String(selectedUserId));
  const rows = diets.map((diet) => {
    const details = diet.objetivo || diet.observacoes || 'Plano alimentar';
    const meta = diet.semanal ? '📅 Semanal' : '📌 Fixa';
    if (isStudent) return navRow({ action: 'open-diet', id: diet.id, icon: diet.semanal ? '📅' : '🍽️', label: diet.titulo || diet.title || 'Dieta', meta, detail: details });
    const visible = diet.visible_to_student === true;
    return `<li class="saude-diet-list-row"><button type="button" class="fin-nav-row" data-action="open-diet" data-id="${esc(diet.id)}">
      <span class="fin-nav-row__icon" aria-hidden="true">${diet.semanal ? '📅' : '🍽️'}</span><span class="fin-nav-row__main"><span class="fin-nav-row__label">${esc(diet.titulo || diet.title || 'Dieta')}</span>${details ? `<small class="fin-nav-row__detail">${esc(details)}</small>` : ''}</span><span class="saude-nav-meta">${esc(meta)}</span><span class="fin-nav-row__chevron" aria-hidden="true">›</span>
    </button><div class="saude-diet-list-status"><span>Status</span><button type="button" class="saude-diet-status-toggle${visible ? ' is-on' : ''}" data-action="toggle-diet-visibility" data-id="${esc(diet.id)}" data-visible="${visible}" aria-pressed="${visible}" aria-label="${visible ? 'Desativar' : 'Ativar'} dieta para o aluno">${visible ? 'On' : 'Off'}</button></div></li>`;
  }).join('');
  return `<section class="module-page">
    ${!isStudent ? '<button class="back-link" type="button" data-action="back-to-profiles">‹ Voltar para alunos</button>' : ''}
    <header class="module-heading"><div><span class="eyebrow">${isStudent ? 'ROTINA ALIMENTAR' : 'GESTÃO DO ALUNO'}</span><h1>${isStudent ? '🥗 Minhas dietas' : `🍽️ Dietas de ${esc(profileName(profile))}`}</h1><p>${isStudent ? 'Consulte os planos preparados pelo seu professor.' : 'Abra, edite ou remova os planos deste perfil.'}</p></div>${!isStudent ? `<button type="button" class="button button--primary" data-action="new-diet" data-id="${esc(selectedUserId)}">➕ Nova dieta</button>` : ''}</header>
    <p class="fin-section-label">📋 Planos cadastrados · ${diets.length}</p><ul class="fin-list">${rows || '<li class="saude-empty-row">🍽️ Nenhuma dieta cadastrada para este perfil.</li>'}</ul>
  </section>`;
}

function renderDietMeals(meals = [], foods = []) {
  return meals.map((meal) => `<li class="saude-diet-meal"><div class="saude-diet-meal__head"><span class="saude-meal-emoji" aria-hidden="true">${mealEmoji(meal.tipo)}</span><span class="saude-diet-meal__time">${esc(meal.horario || '—')}</span><strong>${esc(meal.titulo || DIET_MEALS.find((entry) => entry.tipo === meal.tipo)?.titulo || meal.tipo)}</strong></div>
      <ul class="saude-diet-items">${(meal.itens || []).map((item) => `<li>${renderDietFoodDetails(item, foods)}</li>`).join('') || '<li class="saude-empty-item">🍽️ Sem alimentos nesta refeição.</li>'}</ul></li>`).join('');
}

function renderDietDetail(diet, { editable = false, profile = null, showWeek = false, foods = [] } = {}) {
  if (!diet) return '<section class="module-page"><h1>Dieta</h1><p class="saude-empty-row">Selecione uma dieta para abrir os detalhes.</p></section>';
  const weekly = Boolean(diet.semanal);
  const days = weekly && showWeek ? DIET_WEEK.map((day, index) => ({ day, meals: diet.semana?.[index]?.refeicoes || [] })) : null;
  const daily = weekly ? dietForDate(diet, todayDietDate()) : diet;
  const body = days
    ? `<div class="saude-week-detail">${days.map((entry) => {
      const dayDiet = { ...diet, semanal: false, refeicoes: entry.meals };
      return `<section class="saude-week-detail__day"><h3>${esc(entry.day)}</h3><ul class="fin-list saude-diet-list">${renderDietMeals(entry.meals, foods) || '<li class="saude-empty-row">Nenhuma refeição cadastrada para este dia.</li>'}</ul>${renderDietNutritionTotal(dayDiet, foods)}</section>`;
    }).join('')}</div>`
    : `<ul class="fin-list saude-diet-list">${renderDietMeals(daily?.refeicoes || [], foods) || '<li class="saude-empty-row">Este plano ainda não tem refeições.</li>'}</ul>${renderDietNutritionTotal(daily || diet, foods)}`;
  const eyebrow = weekly ? (days ? '🗓️ PLANO SEMANAL · SEGUNDA A DOMINGO' : '🗓️ PLANO SEMANAL · HOJE') : '📌 PLANO FIXO';
  return `<section class="module-page">
    <button class="back-link" type="button" data-action="back-to-diets">‹ Voltar para dietas</button>
    <header class="module-heading"><div><span class="eyebrow">${eyebrow}</span><h1>🍽️ ${esc(diet.titulo || diet.title || 'Dieta')}</h1><p>${esc(diet.objetivo || '')}${profile ? ` · ${esc(profileName(profile))}` : ''}</p></div></header>
    ${body}
    ${diet.observacoes ? `<p class="saude-observations"><strong>📝 Observações</strong><br>${esc(diet.observacoes)}</p>` : ''}
    ${editable ? `<div class="saude-detail-actions"><button type="button" class="saude-btn saude-btn--danger" data-action="delete-diet" data-id="${esc(diet.id)}">Excluir dieta</button><button type="button" class="saude-btn saude-btn--primary" data-action="edit-diet" data-id="${esc(diet.id)}">Editar dieta</button></div>` : ''}
  </section>`;
}

function mealEditorFields(meal, dayKey = '', current = null, { showTime = true } = {}) {
  const prefix = dayKey ? `${dayKey}_` : '';
  const items = Array.isArray(current?.itens) ? current.itens : [];
  const storageName = `items_${prefix}${meal.tipo}`;
  return `<fieldset class="saude-meal-editor"><legend><span aria-hidden="true">${mealEmoji(meal.tipo)}</span> ${esc(meal.titulo)}</legend>${showTime ? `<label>Horário<input type="time" name="${prefix}horario_${meal.tipo}" value="${esc(current?.horario || '')}"></label>` : ''}<div class="saude-food-items"><ul class="fin-list" data-food-items="${esc(storageName)}">${renderFoodItemRows(items, meal.tipo, dayKey)}</ul><input type="hidden" name="${storageName}" value="${esc(JSON.stringify(items))}"><button type="button" class="saude-btn" data-food-action="add" data-meal="${esc(meal.tipo)}" data-day="${esc(dayKey)}">➕ Adicionar alimento</button></div></fieldset>`;
}

function renderFoodItemRows(items = [], mealType, dayKey = '') {
  return items.length ? items.map((item, index) => {
    const quantity = item.quantidade_valor ? `${item.quantidade_valor} ${item.quantidade_unidade || 'g'}` : item.quantidade || '';
    return `<li class="saude-food-item-row"><span class="saude-food-item-info"><strong>${esc(item.nome || item.item || item.alimento || 'Alimento')}</strong>${quantity || item.observacao ? `<small>${esc(quantity)}${quantity && item.observacao ? ' · ' : ''}${esc(item.observacao || '')}</small>` : ''}</span><span class="saude-food-item-actions"><button class="saude-row-action" type="button" data-food-action="edit" data-meal="${esc(mealType)}" data-day="${esc(dayKey)}" data-index="${index}">Editar</button><button class="saude-row-action is-danger" type="button" data-food-action="remove" data-meal="${esc(mealType)}" data-day="${esc(dayKey)}" data-index="${index}">Remover</button></span></li>`;
  }).join('') : '<li class="saude-empty-row">🍽️ Nenhum alimento adicionado.</li>';
}

function renderDietItemModal({ foods = [], item = null } = {}) {
  const selectedId = String(item?.food_id ?? item?.alimento_id ?? '');
  const selectedFood = foods.find((food) => String(food.id) === selectedId) || foods.find((food) => (food.item || '').toLowerCase() === String(item?.nome || item?.item || '').toLowerCase());
  const categories = [...new Set(foods.map((food) => food.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const foodOptions = categories.length
    ? categories.map((category) => `<optgroup label="${esc(category)}">${foods.filter((food) => food.categoria === category).map((food) => `<option value="${esc(food.id)}" ${String(food.id) === String(selectedFood?.id || '') ? 'selected' : ''}>${esc(food.item)}</option>`).join('')}</optgroup>`).join('')
    : foods.map((food) => `<option value="${esc(food.id)}" ${String(food.id) === String(selectedFood?.id || '') ? 'selected' : ''}>${esc(food.item)}${food.categoria ? ` · ${esc(food.categoria)}` : ''}</option>`).join('');
  const unit = item?.quantidade_unidade || 'g';
  const selectedChip = selectedFood
    ? `<span class="saude-inline-tag" data-food-selected-chip><span aria-hidden="true">🥗</span> ${esc(selectedFood.item)}${selectedFood.categoria ? ` · ${esc(selectedFood.categoria)}` : ''}</span>`
    : '<span class="saude-inline-tag is-muted" data-food-selected-chip>🥗 Escolha um alimento</span>';
  return `<div class="saude-modal-backdrop" data-food-modal><section class="saude-diet-modal" role="dialog" aria-modal="true" aria-labelledby="food-item-title"><header class="saude-diet-modal__header"><div><h2 id="food-item-title">${item ? '✏️ Editar alimento' : '🥗 Adicionar alimento'}</h2><p>Selecione um alimento do catálogo e informe a quantidade.</p></div><button class="saude-icon-btn" type="button" data-food-action="cancel" aria-label="Fechar">×</button></header><div class="saude-editor-form"><label class="saude-food-picker"><span class="saude-choice-label">🥗 Alimento</span>${selectedChip}<select data-food-field="food_id" required><option value="">Selecione um alimento</option>${foodOptions}</select>${foods.length ? '' : '<small>Catálogo indisponível. Você ainda pode informar o alimento manualmente.</small>'}</label>${foods.length ? '' : `<label>Nome do alimento<input data-food-field="nome" value="${esc(item?.nome || item?.item || '')}" placeholder="Ex.: Aveia"></label>`}<label>Quantidade<input data-food-field="quantidade_valor" type="number" min="0.01" max="10000" step="0.01" required value="${esc(item?.quantidade_valor ?? '')}"></label>${renderChoiceOptions({ name: 'quantidade_unidade', label: '📏 Unidade', value: unit, options: FOOD_UNIT_OPTIONS, fieldAttrs: 'data-food-field="quantidade_unidade"' })}<label>Observação (opcional)<textarea data-food-field="observacao" rows="2">${esc(item?.observacao || '')}</textarea></label><div class="saude-editor__actions"><button type="button" class="saude-btn" data-food-action="cancel">Cancelar</button><button type="button" class="saude-btn saude-btn--primary" data-food-action="save">Salvar alimento</button></div></div></section></div>`;
}

function renderDietEditor({ diet = null, profiles = [], selectedUserId = '', editing = false, templateMode = false, foods = [], itemContext = null } = {}) {
  const selected = selectedUserId || profileId(profiles.find((profile) => profile.access !== false));
  const accessible = profiles.filter((profile) => profile.access !== false || profileId(profile) === String(selected));
  const mealSource = diet?.refeicoes || [];
  const singleFields = DIET_MEALS.map((meal) => mealEditorFields(meal, '', mealSource.find((entry) => entry.tipo === meal.tipo))).join('');
  const weekTimes = DIET_MEALS.map((meal) => {
    const value = DIET_WEEK.map((_, index) => (diet?.semana?.[index]?.refeicoes || []).find((entry) => entry.tipo === meal.tipo)?.horario || '').find(Boolean) || '';
    return `<label><span class="saude-week-times__label"><span aria-hidden="true">${mealEmoji(meal.tipo)}</span> ${esc(meal.titulo)}</span><input type="time" name="week_horario_${meal.tipo}" value="${esc(value)}"></label>`;
  }).join('');
  const weekFields = DIET_WEEK.map((day, dayIndex) => {
    const dayMeals = diet?.semana?.[dayIndex]?.refeicoes || [];
    return `<details class="saude-week-day"${dayIndex === 0 ? ' open' : ''}><summary>${esc(day)}</summary><div class="saude-meal-editors">${DIET_MEALS.map((meal) => mealEditorFields(meal, `day${dayIndex}`, dayMeals.find((entry) => entry.tipo === meal.tipo), { showTime: false })).join('')}</div></details>`;
  }).join('');
  const formatValue = diet?.semanal ? 'weekly' : 'single';
  const studentField = templateMode ? '' : renderStudentDrill(accessible, selected, { name: 'user_id', required: true, disabled: editing });
  return `<div class="saude-modal-backdrop"><section class="saude-diet-modal" role="dialog" aria-modal="true" aria-labelledby="diet-editor-title">
    <header class="saude-diet-modal__header"><div><h2 id="diet-editor-title">${templateMode ? (editing ? '✏️ Editar modelo' : '➕ Novo modelo de dieta') : editing ? '✏️ Editar dieta' : '➕ Nova dieta'}</h2><p>${templateMode ? 'Modelo reutilizável do seu portfólio, sem vínculo com aluno.' : 'Monte o plano e organize as refeições do aluno.'}</p></div><button class="saude-icon-btn" type="button" data-action="cancel-editor" aria-label="Fechar">×</button></header>
    <form class="saude-editor-form" data-diet-editor data-template-mode="${templateMode}">
      ${studentField}
      <label>📝 ${templateMode ? 'Nome do modelo' : 'Nome da dieta'}<input name="titulo" required maxlength="100" value="${esc(diet?.titulo || diet?.title || '')}" placeholder="Ex.: Plano alimentar" /></label>
      <label>🎯 Objetivo<input name="objetivo" maxlength="200" value="${esc(diet?.objetivo || '')}" placeholder="Ex.: rotina equilibrada" /></label>
      ${renderChoiceOptions({ name: 'formato', label: '📋 Formato do plano', value: formatValue, options: DIET_FORMAT_OPTIONS, variant: 'cards', fieldAttrs: 'data-diet-format', help: `<small class="saude-format-help" data-format-help>${diet?.semanal ? 'Cada dia tem seu próprio cardápio. Os horários valem para segunda a domingo.' : 'O mesmo cardápio e os mesmos horários valem para todos os dias.'}</small>` })}
      <label>🔥 Meta calórica diária (kcal)<input type="number" name="meta_calorias" min="500" max="10000" step="1" value="${esc(diet?.meta_calorias ?? '')}" placeholder="Opcional · ex. 2000" /></label>
      <label>📝 Observações<textarea name="observacoes" rows="2" maxlength="1000">${esc(diet?.observacoes || '')}</textarea></label>
      <div class="saude-meal-editors" data-single-meals${diet?.semanal ? ' hidden' : ''}>${singleFields}</div>
      <div class="saude-week-editors" data-week-meals${diet?.semanal ? '' : ' hidden'}>
        <fieldset class="saude-week-times"><legend>⏰ Horários das refeições</legend><p>Os mesmos horários valem para segunda a domingo.</p><div class="saude-week-times__grid">${weekTimes}</div></fieldset>
        <div class="saude-week-tools"><div><strong>🗓️ Cardápio da semana</strong><small>Preencha a segunda e copie para os outros dias, ou ajuste cada dia separadamente.</small></div><button type="button" class="saude-btn" data-week-action="copy-monday">📋 Copiar segunda para todos</button></div>
        <p class="saude-week-feedback" data-week-feedback role="status" hidden></p>
        ${weekFields}
      </div>
      <div class="saude-editor__actions"><button type="button" class="saude-btn" data-action="cancel-editor">Cancelar</button><button type="submit" class="saude-btn saude-btn--primary">${editing ? 'Salvar alterações' : templateMode ? 'Criar modelo' : 'Criar dieta'}</button></div>
      <div data-food-modal-host>${itemContext ? renderDietItemModal({ foods, item: itemContext.item }) : ''}</div>
    </form>
  </section></div>`;
}

function cloneDiet(diet) {
  if (!diet) return null;
  return typeof structuredClone === 'function' ? structuredClone(diet) : JSON.parse(JSON.stringify(diet));
}

function fillDietEditor(form, diet) {
  const setValue = (name, value) => { const field = form.elements.namedItem(name); if (field) field.value = value ?? ''; };
  setValue('titulo', diet?.titulo || diet?.title || '');
  setValue('objetivo', diet?.objetivo || '');
  setValue('observacoes', diet?.observacoes || '');
  setValue('meta_calorias', diet?.meta_calorias ?? '');
  const weekly = Boolean(diet?.semanal);
  syncChoiceField(form, 'formato', weekly ? 'weekly' : 'single');
  const weeklyFields = form.querySelector('[data-week-meals]');
  const singleFields = form.querySelector('[data-single-meals]');
  if (weeklyFields) weeklyFields.hidden = !weekly;
  if (singleFields) singleFields.hidden = weekly;
  const help = form.querySelector('[data-format-help]');
  if (help) help.textContent = weekly ? 'Cada dia tem seu próprio cardápio. Os horários valem para segunda a domingo.' : 'O mesmo cardápio e os mesmos horários valem para todos os dias.';
  DIET_MEALS.forEach((meal) => {
    const single = (diet?.refeicoes || []).find((entry) => entry.tipo === meal.tipo);
    setValue(`horario_${meal.tipo}`, single?.horario || '');
    const sharedTime = DIET_WEEK.map((_, index) => (diet?.semana?.[index]?.refeicoes || []).find((entry) => entry.tipo === meal.tipo)?.horario || '').find(Boolean) || '';
    setValue(`week_horario_${meal.tipo}`, sharedTime);
    setMealItems('items_' + meal.tipo, single?.itens || [], meal.tipo, '');
    DIET_WEEK.forEach((_, index) => {
      const dayMeal = (diet?.semana?.[index]?.refeicoes || []).find((entry) => entry.tipo === meal.tipo);
      setMealItems(`items_day${index}_${meal.tipo}`, dayMeal?.itens || [], meal.tipo, `day${index}`);
    });
  });
  function setMealItems(key, items, mealType, dayKey) {
    const hidden = form.elements.namedItem(key);
    const list = form.querySelector(`[data-food-items="${key}"]`);
    if (hidden) hidden.value = JSON.stringify(items);
    if (list) list.innerHTML = renderFoodItemRows(items, mealType, dayKey);
  }
}

function parseDietItems(value) {
  try {
    const items = JSON.parse(String(value || '[]'));
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function renderWater(water, { editable = false, canSetGoal = false, showBack = false, userId = '', title = 'Água', userName = '', error = '' } = {}) {
  if (!water) return `<section class="module-page">${showBack ? '<button class="back-link" type="button" data-action="back-to-profiles">‹ Voltar para alunos</button>' : ''}<h1>${esc(title)}</h1><div class="saude-water-load-error" role="alert"><strong>Não foi possível carregar os dados deste perfil.</strong><p>${esc(error || 'Tente abrir esta tela novamente. Se continuar, confira se o aluno está ativo e vinculado ao seu perfil.')}</p></div></section>`;
  const goal = Number(water.goal_ml || 0);
  const total = Number(water.total_ml || 0);
  const percent = goal ? Math.min(100, Math.round(total / goal * 100)) : 0;
  const remaining = Math.max(0, goal - total);
  const complete = goal > 0 && total >= goal;
  const status = !goal ? '🎯 Defina uma meta para acompanhar o consumo.' : complete ? '🎉 Meta do dia concluída! Muito bem!' : `💪 Faltam ${remaining.toLocaleString('pt-BR')} ml para a meta de hoje.`;
  const checkins = [...(water.checkins || [])].reverse();
  const entries = checkins.map((item) => `<li class="saude-water-log__item"><span class="saude-water-log__time">${esc(item.time || 'Hoje')}</span><span class="saude-water-log__amount"><span aria-hidden="true">${waterEmoji(item.amount_ml)}</span> ${esc(waterAmountLabel(item.amount_ml))}</span></li>`).join('');
  return `<section class="module-page">
    ${showBack ? '<button class="back-link" type="button" data-action="back-to-profiles">‹ Voltar para alunos</button>' : ''}
    <header class="module-heading"><div><span class="eyebrow">ACOMPANHAMENTO DE ÁGUA</span><h1>💧 ${esc(title)}${userName ? ` · ${esc(userName)}` : ''}</h1><p>${editable ? 'Registre cada consumo ao longo do dia.' : 'Meta e consumo diário do aluno.'}</p></div></header>
    <div class="saude-water-overview"><div class="saude-water-main"><small>💧 CONSUMO DE HOJE</small><strong>${(total / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L</strong><span>${goal ? `🎯 ${esc(water.nome || 'Meta diária')} · ${(goal / 1000).toLocaleString('pt-BR')} L · ${percent}%` : '🎯 Meta ainda não definida'}</span></div>${renderWaterDropHtml({ meta_ml: goal, realizado_ml: total })}<div class="saude-water-progress" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${percent}%"></span></div></div>
    <p class="saude-water-status${complete ? ' is-complete' : ''}">${status}</p>
    ${canSetGoal ? `<form class="saude-goal-editor fin-list" data-water-goal data-user-id="${esc(userId)}"><p class="fin-section-label">${goal ? '🎯 Meta oficial de água' : '🎯 Definir meta oficial de água'}</p><label for="water-name-input">Nome da meta</label><input id="water-name-input" name="nome" maxlength="80" required value="${esc(water.nome || 'Meta diária')}" placeholder="Ex.: Meta diária"><label for="water-goal-input">Meta diária (ml)</label><div><input id="water-goal-input" name="goal_ml" type="number" min="100" max="10000" step="100" required value="${goal || 2000}"><button type="submit" class="saude-btn saude-btn--primary">${goal ? 'Atualizar meta oficial' : 'Salvar meta oficial'}</button>${goal ? '<button type="button" class="saude-btn saude-btn--danger" data-action="delete-water-goal">Excluir meta oficial</button>' : ''}</div><small>Existe uma meta oficial por aluno. Salvar substitui o valor atual.</small></form>` : ''}
    ${editable ? `<div class="saude-water-checkin"><p class="fin-section-label">💧 Registrar consumo</p>${goal ? `<ul class="saude-water-checks">${WATER_AMOUNTS_ML.map((amount) => `<li><button type="button" class="saude-water-check" data-action="add-water" data-id="${amount}" aria-label="Registrar ${esc(waterAmountLabel(amount))}"><span aria-hidden="true">${waterEmoji(amount)}</span><strong>${esc(waterAmountLabel(amount))}</strong></button></li>`).join('')}</ul>` : '<p class="saude-empty-row">🎯 Seu professor ainda não configurou uma meta de água.</p>'}</div>` : ''}
    <details class="saude-water-log"><summary class="saude-water-log__summary"><span>📝 Registros de hoje · ${checkins.length}</span><span class="saude-water-log__chevron" aria-hidden="true">›</span></summary><ul class="saude-water-log__list">${entries || '<li class="saude-water-log__empty">💧 Nenhum consumo registrado hoje.</li>'}</ul></details>
  </section>`;
}

function renderStudentLanding({ diets = [], water = null } = {}) {
  const dietCount = diets.length;
  const waterTotal = Number(water?.total_ml || 0);
  const waterGoal = Number(water?.goal_ml || 0);
  const waterLabel = waterGoal
    ? `${(waterTotal / 1000).toLocaleString('pt-BR')} L de ${(waterGoal / 1000).toLocaleString('pt-BR')} L hoje`
    : waterTotal
      ? `${(waterTotal / 1000).toLocaleString('pt-BR')} L hoje`
      : 'Registrar consumo de água';
  return `<section class="module-page saude-home-page">
    <header class="module-heading"><div><span class="eyebrow">MINHA SAÚDE</span><h1>🏠 Início</h1><p>Escolha por onde começar: dieta ou água.</p></div></header>
    <div class="saude-home-grid">
      <button type="button" class="saude-home-card" data-module="diets">
        <span class="saude-home-card__icon" aria-hidden="true">🥗</span>
        <strong>Dieta</strong>
        <span>Consulte os planos preparados pelo seu professor.</span>
        <small>${dietCount} plano${dietCount === 1 ? '' : 's'}</small>
      </button>
      <button type="button" class="saude-home-card" data-module="water">
        <span class="saude-home-card__icon" aria-hidden="true">💧</span>
        <strong>Água</strong>
        <span>Acompanhe sua meta e registre o consumo do dia.</span>
        <small>${esc(waterLabel)}</small>
      </button>
    </div>
  </section>`;
}

function renderStudentHome(state) {
  const diets = Array.isArray(state.diets) ? state.diets : [];
  if (state.module === 'water') return renderWater(state.water, { editable: true, title: 'Minha água' });
  if (state.module === 'diet-detail') return renderDietDetail(state.diet, { foods: state.foods || [] });
  if (state.module === 'diets') return renderDietsList(state.profiles, diets, state.selectedUserId, true);
  return renderStudentLanding({ diets, water: state.water });
}

function ensureWaterDropStyles() {
  if (!document.getElementById('ritmo-water-drop-styles')) {
    const style = document.createElement('style');
    style.id = 'ritmo-water-drop-styles';
    style.textContent = WATER_DROP_STYLES;
    document.head.append(style);
  }
  if (!document.getElementById('ritmo-admin-metrics-styles')) {
    const style = document.createElement('style');
    style.id = 'ritmo-admin-metrics-styles';
    style.textContent = `.saude-metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px;margin:20px 0}.saude-metric-grid article{padding:18px;display:flex;flex-direction:column;gap:8px}.saude-metric-grid small{color:#64748b}.saude-metric-grid strong{font-size:1.35rem;color:#111827}.saude-metric-chart{height:150px;display:flex;align-items:flex-end;gap:2px;padding:12px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}.saude-metric-bar{flex:1;min-width:2px;background:#d20a0a;border-radius:3px 3px 0 0}.saude-metric-bar.has-errors{background:#f59e0b}.saude-metric-legend{display:flex;justify-content:space-between;color:#64748b;font-size:.8rem;padding:8px 2px}`;
    document.head.append(style);
  }
  if (!document.getElementById('ritmo-diet-nutrition-styles')) {
    const style = document.createElement('style');
    style.id = 'ritmo-diet-nutrition-styles';
    style.textContent = DIET_NUTRITION_STYLES;
    document.head.append(style);
  }
}

function currentProfile(state, id = state.selectedUserId) {
  return (state.profiles || []).find((profile) => profileId(profile) === String(id)) || null;
}

function renderAccounts(accounts = [], currentUser = null) {
  const rows = accounts.map((account) => {
    const id = account.id ?? account.user_id;
    const isSelf = String(id) === String(currentUser?.id ?? currentUser?.user_id ?? '');
    const active = account.access !== false && account.enabled !== false && account.active !== false;
    const role = account.role === 'student' ? 'Aluno' : account.role === 'professor' ? 'Professor' : 'Administração';
    const mustChange = account.must_change_password || account.mustChangePassword;
    const professorLink = account.role === 'student' && account.professor_name ? ` · Professor: ${account.professor_name}` : account.role === 'student' ? ' · Sem professor vinculado' : '';
    return `<li class="saude-student-row"><div class="saude-student-row__identity"><span class="saude-avatar" aria-hidden="true">${esc(String(account.name || account.nome || '?').slice(0, 1).toUpperCase())}</span><span><strong>${esc(account.name || account.nome || 'Conta')}</strong><small>${esc(account.email || '')}</small></span></div><div class="saude-student-row__summary"><span>${esc(role)}</span><small>${active ? 'Acesso ativo' : 'Acesso pausado'}${mustChange ? ' · Senha inicial pendente de troca' : ''}${esc(professorLink)}</small></div><div class="saude-student-row__actions"><button class="saude-row-action" type="button" data-edit-account data-id="${esc(id)}">Editar</button><button class="saude-row-action is-danger" type="button" ${isSelf ? 'hidden' : ''} data-delete-account data-id="${esc(id)}">Excluir</button><button class="saude-row-action ${active ? 'is-danger' : 'is-primary'}" type="button" ${isSelf ? 'hidden' : ''} data-admin-access data-id="${esc(id)}" data-enabled="${active}">${active ? 'Pausar acesso' : 'Liberar acesso'}</button></div></li>`;
  }).join('');
  return `<section class="module-page"><header class="module-heading"><div><span class="eyebrow">ADMINISTRAÇÃO</span><h1>Contas</h1><p>Cadastre professores e alunos e controle o acesso à plataforma.</p></div><button type="button" class="button button--primary" data-module="createAccount">Nova conta</button></header><p class="fin-section-label">Contas cadastradas · ${accounts.length}</p><ul class="fin-list saude-student-list">${rows || '<li class="saude-empty-row">Nenhuma conta cadastrada.</li>'}</ul></section>`;
}

function renderAccountEditor(account = null, professors = []) {
  const editing = Boolean(account);
  const role = account?.role || 'student';
  const roleLabel = role === 'admin' ? 'Administrador' : role === 'professor' ? 'Professor' : 'Aluno';
  const activeProfessors = professors.filter((entry) => entry.access !== false);
  const roleField = role === 'admin'
    ? `<input type="hidden" name="role" value="admin"><span class="saude-inline-tag" aria-label="Perfil da conta, não editável">🛡️ ${esc(roleLabel)}</span>`
    : renderChoiceOptions({
      name: 'role',
      label: '👤 Perfil',
      value: role === 'professor' ? 'professor' : 'student',
      required: true,
      options: [
        { value: 'professor', label: 'Professor', emoji: '🩺' },
        { value: 'student', label: 'Aluno', emoji: '👩‍🎓' },
      ],
    });
  const showProfessorLink = role === 'student';
  const professorField = renderProfessorDrill(activeProfessors, account?.professor_id || activeProfessors[0]?.id || '', { required: showProfessorLink });
  const professorBlock = `<div data-professor-link-field${showProfessorLink ? '' : ' hidden'}><span class="saude-choice-label">🩺 Professor responsável</span>${professorField}${activeProfessors.length ? '' : '<p class="saude-empty-row">Cadastre um professor ativo antes de vincular alunos.</p>'}</div>`;
  return `<section class="module-page"><button class="back-link" type="button" data-module="accounts">‹ Voltar para contas</button><header class="module-heading"><div><span class="eyebrow">ADMINISTRAÇÃO</span><h1>${editing ? '✏️ Editar conta' : '➕ Nova conta'}</h1><p>${editing ? 'Atualize os dados do acesso.' : 'Cadastre um acesso de professor ou aluno.'}</p></div></header><form class="saude-student-form fin-list" data-account-form data-editing="${editing}" data-id="${esc(account?.id ?? account?.user_id ?? '')}"><label>👤 Nome<input name="name" maxlength="80" required autocomplete="name" value="${esc(account?.name || account?.nome || '')}"></label><label>✉️ E-mail<input name="email" type="email" maxlength="160" required autocomplete="email" value="${esc(account?.email || '')}"></label>${roleField}${professorBlock}${editing ? '' : '<p class="saude-empty-row">Senha inicial: <strong>123456</strong>. O usuário deverá criar uma senha pessoal no primeiro acesso.</p>'}<button type="submit" class="saude-btn saude-btn--primary">${editing ? 'Salvar alterações' : 'Criar conta'}</button></form></section>`;
}

function renderObservability(metrics = {}) {
  const buckets = Array.isArray(metrics.buckets) ? metrics.buckets : [];
  const maxRequests = Math.max(1, ...buckets.map((bucket) => Number(bucket.requests || 0)));
  const bars = buckets.map((bucket) => {
    const height = Math.max(2, (Number(bucket.requests || 0) / maxRequests) * 100);
    const errors = Number(bucket.errors || 0);
    return `<span class="saude-metric-bar${errors ? ' has-errors' : ''}" title="${esc(bucket.minute || '')}: ${Number(bucket.requests || 0)} requisições, ${errors} erros" style="height:${height}%"></span>`;
  }).join('');
  const uptime = Number(metrics.uptime_seconds || 0);
  const uptimeLabel = uptime >= 86400 ? `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h` : uptime >= 3600 ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}min` : `${Math.floor(uptime / 60)}min`;
  return `<section class="module-page"><header class="module-heading"><div><span class="eyebrow">ADMINISTRAÇÃO${metrics.scope ? ` · ${esc(metrics.scope)}` : ''}</span><h1>Observabilidade</h1><p>Métricas do servidor local e volume de requisições na última hora.</p></div><button type="button" class="button button--primary" data-module="observability">Atualizar</button></header><div class="saude-metric-grid"><article class="fin-list"><small>Requisições</small><strong>${Number(metrics.total_requests ?? metrics.total ?? 0).toLocaleString('pt-BR')}</strong></article><article class="fin-list"><small>Erros</small><strong>${Number(metrics.errors || 0).toLocaleString('pt-BR')}</strong></article><article class="fin-list"><small>Pico por minuto</small><strong>${Number(metrics.peak_requests_per_minute || 0).toLocaleString('pt-BR')}</strong></article><article class="fin-list"><small>Resposta média</small><strong>${Number(metrics.avg_response_ms || 0).toLocaleString('pt-BR')} ms</strong></article><article class="fin-list"><small>Memória</small><strong>${Number(metrics.memory_mb || 0).toLocaleString('pt-BR')} MB</strong></article><article class="fin-list"><small>Tempo ativo</small><strong>${esc(uptimeLabel)}</strong></article></div><p class="fin-section-label">Requisições por minuto · últimos 60 minutos</p><div class="saude-metric-chart" role="img" aria-label="Gráfico de requisições por minuto">${bars || '<span class="saude-empty-row">Sem métricas disponíveis.</span>'}</div><div class="saude-metric-legend"><span>Requisições</span><span>Minutos com erro</span></div></section>`;
}

function renderAdminHome({ accounts = [], metrics = null } = {}) {
  const accountCount = accounts.length;
  const totalRequests = Number(metrics?.total_requests ?? metrics?.total ?? 0);
  const errors = Number(metrics?.errors || 0);
  const observabilityLabel = metrics
    ? `${totalRequests.toLocaleString('pt-BR')} requisiç${totalRequests === 1 ? 'ão' : 'ões'}${errors ? ` · ${errors.toLocaleString('pt-BR')} erro${errors === 1 ? '' : 's'}` : ''}`
    : 'Métricas do servidor local';
  return `<section class="module-page saude-home-page">
    <header class="module-heading"><div><span class="eyebrow">ADMINISTRAÇÃO</span><h1>🏠 Início</h1><p>Escolha por onde começar: contas ou observabilidade.</p></div></header>
    <div class="saude-home-grid">
      <button type="button" class="saude-home-card" data-module="accounts">
        <span class="saude-home-card__icon" aria-hidden="true">👥</span>
        <strong>Contas</strong>
        <span>Cadastre professores e alunos e controle o acesso à plataforma.</span>
        <small>${accountCount} conta${accountCount === 1 ? '' : 's'}</small>
      </button>
      <button type="button" class="saude-home-card" data-module="observability">
        <span class="saude-home-card__icon" aria-hidden="true">📈</span>
        <strong>Observabilidade</strong>
        <span>Acompanhe métricas do servidor e volume de requisições.</span>
        <small>${esc(observabilityLabel)}</small>
      </button>
    </div>
  </section>`;
}

export function renderSaudeContent(container, { state, onNavigate, onCreateDiet, onDeleteDiet, onEditDiet, onSetDietVisibility, onWaterGoal, onWaterAmount, onCreateAccount, onEditAccount, onDeleteAccount, onAccountAccess, onSaveTemplate, onDeleteTemplate, onUseTemplate, onLogout }) {
  const admin = state.user?.role === 'admin';
  const professor = state.user?.role === 'professor';
  const homeModule = 'home';
  const view = admin
    ? { label: 'Administração', homeLabel: '🏠 Início', nav: [['accounts', '👥 Contas'], ['observability', '📈 Observabilidade']] }
    : professor
    ? { label: 'Professor', homeLabel: '🏠 Início', nav: [['users', '👩‍🎓 Alunos'], ['portfolio', '📚 Portfólio']] }
    : { label: 'Aluno', homeLabel: '🏠 Início', nav: [['diets', '🥗 Dieta'], ['water', '💧 Água']] };
  const homeActive = state.module === homeModule;
  let content;

  const adminProfessors = (state.accounts || []).filter((entry) => entry.role === 'professor');
  if (admin) {
    if (state.module === 'createAccount') content = renderAccountEditor(null, adminProfessors);
    else if (state.module === 'editAccount') content = renderAccountEditor(state.editingAccount || (state.accounts || []).find((account) => String(account.id ?? account.user_id) === String(state.selectedUserId)) || null, adminProfessors);
    else if (state.module === 'observability') content = renderObservability(state.metrics || {});
    else if (state.module === 'accounts') content = renderAccounts(state.accounts || [], state.user);
    else content = renderAdminHome({ accounts: state.accounts || [], metrics: state.metrics });
  } else if (professor) {
    const profile = currentProfile(state);
    if (state.module === 'createDiet') content = state.dietSourceSelected
      ? renderDietEditor({ profiles: state.profiles, selectedUserId: state.selectedUserId, diet: state.templateDraft || state.dietDraft || null, foods: state.foods || [], itemContext: state.foodItemContext })
      : renderDietStartModal(state.templates || []);
    else if (state.module === 'editDiet') content = renderDietEditor({ profiles: state.profiles, selectedUserId: state.selectedUserId, diet: state.dietDraft || state.diet, editing: true, foods: state.foods || [], itemContext: state.foodItemContext });
    else if (state.module === 'createTemplate') content = renderDietEditor({ templateMode: true, foods: state.foods || [], diet: state.templateDraft || null });
    else if (state.module === 'editTemplate') content = renderDietEditor({ templateMode: true, editing: true, foods: state.foods || [], diet: state.templateDraft || state.template });
    else if (state.module === 'template-detail') content = renderTemplateDetail(state.template);
    else if (state.module === 'portfolio') content = renderPortfolio(state.templates || []);
    else if (state.module === 'diet-detail') content = renderDietDetail(state.diet, { editable: true, profile, showWeek: true, foods: state.foods || [] });
    else if (state.module === 'diets') content = renderDietsList(state.profiles, state.diets, state.selectedUserId);
    else if (state.module === 'monitor') content = renderWater(state.monitor?.water, { editable: false, canSetGoal: true, showBack: true, userId: state.monitor?.user?.id || state.selectedUserId, title: 'Água', userName: profileName(state.monitor?.user || profile), error: state.moduleError });
    else if (state.module === 'users') content = renderProfessorProfiles(state.profiles, state.selectedUserId);
    else content = renderProfessorHome({ profiles: state.profiles || [], templates: state.templates || [] });
  } else content = renderStudentHome(state);

  ensureWaterDropStyles();
  const navTitle = admin ? 'Administração' : 'Área do Professor / Aluno';
  const navActive = (module) => {
    if (module === 'portfolio') return ['portfolio', 'template-detail', 'createTemplate', 'editTemplate'].includes(state.module);
    if (module === 'users') return ['users', 'diets', 'diet-detail', 'createDiet', 'editDiet', 'monitor'].includes(state.module);
    if (module === 'accounts') return ['accounts', 'createAccount', 'editAccount'].includes(state.module);
    if (module === 'diets') return ['diets', 'diet-detail'].includes(state.module);
    if (module === 'observability') return state.module === 'observability';
    if (module === 'water') return state.module === 'water';
    return false;
  };
  const tabButtons = [
    `<button type="button" role="tab" data-module="${homeModule}" class="nav-link nav-link--home ${homeActive ? 'is-active' : ''}"${homeActive ? ' aria-selected="true"' : ' aria-selected="false"'}>${view.homeLabel}</button>`,
    ...view.nav.map(([module, label]) => {
      const active = navActive(module);
      return `<button type="button" role="tab" data-module="${module}" class="nav-link ${active ? 'is-active' : ''}" aria-selected="${active ? 'true' : 'false'}">${label}</button>`;
    }),
  ].join('');
  container.innerHTML = `<main class="app-shell"><header class="app-header"><div class="header-brand"><span class="header-heart">♥</span> RITMO <strong>SAÚDE</strong></div><div class="header-account"><span>${esc(state.user?.name || view.label)}</span><small>${view.label}</small><button type="button" data-action="logout">Sair</button></div></header>
    <nav class="module-nav" aria-label="Módulos"><p class="nav-title">${navTitle}</p><div class="module-tabs" role="tablist" aria-label="Seções">${tabButtons}</div></nav>
    <div class="content-wrap" aria-busy="${state.loading ? 'true' : 'false'}">${state.loading ? '<div class="navigation-loading" role="status" aria-live="polite"><span class="navigation-loading__card"><span class="navigation-loading__spinner" aria-hidden="true"></span><span><strong>Abrindo sua área</strong><small>Carregando os dados…</small></span></span></div>' : ''}${renderNotice()}${content}</div><footer class="app-footer">Ritmo Saúde · dados mock locais</footer></main>`;

  if (state.notice) {
    const pendingNotice = state.notice;
    state.notice = '';
    publishNotice(pendingNotice);
  }

  container.querySelectorAll('[data-action="toggle-diet-visibility"]').forEach((button) => button.addEventListener('click', () => {
    onSetDietVisibility?.(button.dataset.id, state.selectedUserId, button.dataset.visible !== 'true');
  }));

  container.querySelectorAll('[data-module]').forEach((button) => button.addEventListener('click', () => onNavigate?.(button.dataset.module)));
  const setDrillOpen = (drill, open) => {
    if (!drill) return;
    const list = drill.querySelector('[data-student-drill-list]');
    const toggle = drill.querySelector('[data-student-drill-toggle]');
    if (!list || !toggle || toggle.disabled) return;
    drill.classList.toggle('is-open', open);
    list.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  container.querySelectorAll('[data-student-drill]').forEach((drill) => {
    drill.querySelector('[data-student-drill-toggle]')?.addEventListener('click', () => {
      const open = drill.querySelector('[data-student-drill-toggle]')?.getAttribute('aria-expanded') !== 'true';
      setDrillOpen(drill, open);
    });
  });
  container.querySelectorAll('[data-student-choice]').forEach((button) => button.addEventListener('click', () => {
    setDrillOpen(button.closest('[data-student-drill]'), false);
    onNavigate?.('users', button.dataset.studentChoice);
  }));
  container.querySelectorAll('[data-diet-start-choice]').forEach((button) => button.addEventListener('click', () => {
    const id = String(button.dataset.dietStartChoice || '');
    state.foodItemContext = null;
    if (!id) {
      state.templateDraft = null;
      state.dietDraft = null;
    } else {
      const template = (state.templates || []).find((item) => String(item.id) === id);
      if (!template) return;
      const draft = cloneDiet(template);
      delete draft.id;
      state.templateDraft = null;
      state.dietDraft = draft;
    }
    state.dietSourceSelected = true;
    onNavigate?.('createDiet', state.selectedUserId);
  }));
  container.querySelector('[data-action="logout"]')?.addEventListener('click', onLogout);
  container.querySelector('[data-account-form]')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-choice-set]');
    if (!button || button.disabled) return;
    const form = event.currentTarget;
    const name = button.dataset.choiceSet;
    const value = button.dataset.choiceValue;
    syncChoiceField(form, name, value);
    if (button.hasAttribute('data-drill-pick')) {
      const drill = button.closest('[data-student-drill]');
      const label = button.querySelector('.saude-drill-option__label')?.textContent || '';
      const valueEl = drill?.querySelector('.saude-drill-trigger__value');
      if (valueEl) valueEl.textContent = label;
      drill?.querySelectorAll('[data-drill-pick]').forEach((option) => {
        const selected = String(option.dataset.choiceValue) === String(value);
        option.classList.toggle('is-selected', selected);
        option.setAttribute('aria-selected', String(selected));
        option.querySelector('.saude-nav-meta')?.remove();
        if (selected) option.insertAdjacentHTML('beforeend', '<span class="saude-nav-meta">Atual</span>');
      });
      setDrillOpen(drill, false);
    }
    if (name === 'role') {
      const showProfessor = value === 'student';
      form.querySelector('[data-professor-link-field]')?.toggleAttribute('hidden', !showProfessor);
      const professorInput = form.querySelector('[name="professor_id"]');
      if (professorInput) {
        if (showProfessor) professorInput.setAttribute('required', '');
        else professorInput.removeAttribute('required');
      }
    }
  });
  container.querySelectorAll('[data-action="open-diets"]').forEach((button) => button.addEventListener('click', () => onNavigate?.('diets', button.dataset.id)));
  container.querySelectorAll('[data-action="open-water"]').forEach((button) => button.addEventListener('click', () => onNavigate?.('monitor', button.dataset.id)));
  container.querySelectorAll('[data-action="new-diet"]').forEach((button) => button.addEventListener('click', () => onNavigate?.('createDiet', button.dataset.id)));
  container.querySelectorAll('[data-action="open-template"]').forEach((button) => button.addEventListener('click', () => {
    state.template = (state.templates || []).find((item) => String(item.id) === String(button.dataset.id)) || null;
    onNavigate?.('template-detail', button.dataset.id);
  }));
  container.querySelectorAll('[data-action="edit-template"]').forEach((button) => button.addEventListener('click', () => onNavigate?.('editTemplate', button.dataset.id)));
  container.querySelectorAll('[data-action="use-template"]').forEach((button) => button.addEventListener('click', () => onUseTemplate?.(button.dataset.id)));
  container.querySelectorAll('[data-action="delete-template"]').forEach((button) => button.addEventListener('click', async () => {
    if (await confirmAction('Dietas já criadas a partir dele não serão alteradas.', { title: 'Excluir este modelo?', confirmLabel: 'Excluir modelo' })) onDeleteTemplate?.(button.dataset.id);
  }));
  container.querySelectorAll('[data-action="edit-diet"]').forEach((button) => button.addEventListener('click', () => {
    state.diet = (state.diets || []).find((diet) => String(diet.id) === String(button.dataset.id)) || state.diet;
    onNavigate?.('editDiet');
  }));
  container.querySelectorAll('[data-action="open-diet"]').forEach((button) => button.addEventListener('click', () => {
    state.diet = (state.diets || []).find((diet) => String(diet.id) === String(button.dataset.id)) || null;
    onNavigate?.('diet-detail');
  }));
  container.querySelectorAll('[data-action="delete-diet"]').forEach((button) => button.addEventListener('click', async () => {
    if (await confirmAction('As refeições deste plano também serão removidas.', { title: 'Excluir esta dieta?', confirmLabel: 'Excluir dieta' })) onDeleteDiet?.(button.dataset.id, state.selectedUserId);
  }));
  container.querySelectorAll('[data-action="back-to-diets"]').forEach((button) => button.addEventListener('click', () => onNavigate?.('diets', state.selectedUserId)));
  container.querySelectorAll('[data-action="back-to-profiles"]').forEach((button) => button.addEventListener('click', () => onNavigate?.('users')));
  container.querySelectorAll('[data-admin-access]').forEach((button) => button.addEventListener('click', () => onAccountAccess?.(button.dataset.id, button.dataset.enabled !== 'true')));
  container.querySelectorAll('[data-edit-account]').forEach((button) => button.addEventListener('click', () => onNavigate?.('editAccount', button.dataset.id)));
  container.querySelectorAll('[data-delete-account]').forEach((button) => button.addEventListener('click', async () => {
    if (await confirmAction('O usuário perderá o acesso à plataforma.', { title: 'Excluir esta conta?', confirmLabel: 'Excluir conta' })) onDeleteAccount?.(button.dataset.id);
  }));
  container.querySelectorAll('[data-action="add-water"]').forEach((button) => button.addEventListener('click', () => onWaterAmount?.(Number(button.dataset.id))));
  container.querySelector('[data-water-goal]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const amount = Number(values.get('goal_ml'));
    state.waterGoalName = String(values.get('nome') || '').trim();
    const isCreate = !state.monitor?.water?.goal_ml;
    onWaterGoal?.(form.dataset.userId, amount, isCreate ? 'create' : 'save');
  });
  container.querySelector('[data-action="delete-water-goal"]')?.addEventListener('click', async () => {
    if (await confirmAction('O histórico de consumo do aluno será mantido.', { title: 'Excluir a meta de água?', confirmLabel: 'Excluir meta' })) onWaterGoal?.(state.monitor?.user?.id || state.selectedUserId, null, 'delete');
  });
  container.querySelectorAll('[data-action="cancel-editor"]').forEach((button) => button.addEventListener('click', () => {
    const target = ['createTemplate', 'editTemplate'].includes(state.module) ? 'portfolio'
      : ['createAccount', 'editAccount'].includes(state.module) ? 'accounts'
      : ['createDiet', 'editDiet'].includes(state.module) ? 'diets' : 'users';
    onNavigate?.(target);
  }));
  container.querySelector('[data-diet-editor]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const weekly = String(form.get('formato')) === 'weekly';
    const buildMeals = (dayKey = '') => DIET_MEALS.map((meal) => ({
      tipo: meal.tipo,
      titulo: meal.titulo,
      horario: String(form.get(weekly ? `week_horario_${meal.tipo}` : `horario_${meal.tipo}`) || ''),
      itens: parseDietItems(form.get(`items_${dayKey ? `${dayKey}_` : ''}${meal.tipo}`)),
    }));
    const editingId = state.module === 'editTemplate' ? state.template?.id : state.module === 'editDiet' ? state.diet?.id : '';
    const payload = {
      ...(editingId ? { id: editingId } : {}),
      user_id: String(form.get('user_id') || state.selectedUserId),
      titulo: String(form.get('titulo') || '').trim(),
      objetivo: String(form.get('objetivo') || '').trim(),
      observacoes: String(form.get('observacoes') || '').trim(),
      meta_calorias: String(form.get('meta_calorias') || '').trim(),
      semanal: weekly,
      ...(weekly ? { semana: DIET_WEEK.map((titulo, dayIndex) => ({ titulo, refeicoes: buildMeals(`day${dayIndex}`) })) } : { refeicoes: buildMeals() }),
    };
    if (formElement.dataset.templateMode === 'true') {
      delete payload.user_id;
      onSaveTemplate?.(payload);
    } else if (state.module === 'editDiet') onEditDiet?.(payload);
    else onCreateDiet?.(payload);
  });
  const applyDietFormat = (form, weekly) => {
    container.querySelector('[data-single-meals]').hidden = weekly;
    container.querySelector('[data-week-meals]').hidden = !weekly;
    DIET_MEALS.forEach((meal) => {
      const source = weekly ? form?.elements.namedItem(`horario_${meal.tipo}`) : form?.elements.namedItem(`week_horario_${meal.tipo}`);
      const target = weekly ? form?.elements.namedItem(`week_horario_${meal.tipo}`) : form?.elements.namedItem(`horario_${meal.tipo}`);
      if (source?.value && target && !target.value) target.value = source.value;
    });
    const help = container.querySelector('[data-format-help]');
    if (help) help.textContent = weekly ? 'Cada dia tem seu próprio cardápio. Os horários valem para segunda a domingo.' : 'O mesmo cardápio e os mesmos horários valem para todos os dias.';
  };
  container.querySelector('[data-account-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const role = String(values.get('role') || state.editingAccount?.role || 'student');
    const payload = { name: String(values.get('name') || '').trim(), email: String(values.get('email') || '').trim(), role };
    if (role === 'student') payload.professor_id = String(values.get('professor_id') || '').trim();
    if (form.dataset.editing === 'true') onEditAccount?.({ ...payload, id: form.dataset.id });
    else onCreateAccount?.(payload);
  });

  const dietForm = container.querySelector('[data-diet-editor]');
  const closeFoodModal = () => { dietForm?.querySelector('[data-food-modal]')?.remove(); state.foodItemContext = null; };
  dietForm?.addEventListener('click', (event) => {
    const choiceButton = event.target.closest('[data-choice-set]');
    if (!choiceButton || choiceButton.disabled) return;
    const name = choiceButton.dataset.choiceSet;
    const value = choiceButton.dataset.choiceValue;
    const scope = choiceButton.closest('[data-food-modal]') || dietForm;
    syncChoiceField(scope, name, value);
    if (choiceButton.hasAttribute('data-drill-pick')) {
      const drill = choiceButton.closest('[data-student-drill]');
      const label = choiceButton.querySelector('.saude-drill-option__label')?.textContent || '';
      const valueEl = drill?.querySelector('.saude-drill-trigger__value');
      if (valueEl) valueEl.textContent = label;
      drill?.querySelectorAll('[data-drill-pick]').forEach((option) => {
        const selected = String(option.dataset.choiceValue) === String(value);
        option.classList.toggle('is-selected', selected);
        option.setAttribute('aria-selected', String(selected));
        option.querySelector('.saude-nav-meta')?.remove();
        if (selected) option.insertAdjacentHTML('beforeend', '<span class="saude-nav-meta">Atual</span>');
      });
      setDrillOpen(drill, false);
    }
    if (name === 'formato') applyDietFormat(dietForm, value === 'weekly');
  });
  dietForm?.addEventListener('change', (event) => {
    const select = event.target.closest('[data-food-field="food_id"]');
    if (!select) return;
    const food = (state.foods || []).find((item) => String(item.id) === String(select.value));
    const chip = dietForm.querySelector('[data-food-selected-chip]');
    if (!chip) return;
    chip.classList.toggle('is-muted', !food);
    chip.innerHTML = food
      ? `<span aria-hidden="true">🥗</span> ${esc(food.item)}${food.categoria ? ` · ${esc(food.categoria)}` : ''}`
      : '🥗 Escolha um alimento';
  });

  const currentMealItems = (mealType, dayKey = '') => {
    const key = `items_${dayKey ? `${dayKey}_` : ''}${mealType}`;
    try { return JSON.parse(dietForm?.elements.namedItem(key)?.value || '[]'); } catch { return []; }
  };
  const storeMealItems = (mealType, dayKey, items) => {
    if (!dietForm) return;
    const key = `items_${dayKey ? `${dayKey}_` : ''}${mealType}`;
    const hidden = dietForm.elements.namedItem(key);
    const list = dietForm.querySelector(`[data-food-items="${key}"]`);
    if (hidden) hidden.value = JSON.stringify(items);
    if (list) list.innerHTML = renderFoodItemRows(items, mealType, dayKey);
  };
  dietForm?.addEventListener('click', async (event) => {
    if (event.target.matches('[data-food-modal]')) { closeFoodModal(); return; }
    const button = event.target.closest('[data-food-action]');
    if (!button) return;
    const action = button.dataset.foodAction;
    if (action === 'cancel') { closeFoodModal(); return; }
    if (action === 'add' || action === 'edit') {
      const items = currentMealItems(button.dataset.meal, button.dataset.day || '');
      const index = Number(button.dataset.index);
      state.foodItemContext = { meal: button.dataset.meal, day: button.dataset.day || '', index: action === 'edit' ? index : null, item: action === 'edit' ? items[index] : null };
      const host = dietForm.querySelector('[data-food-modal-host]');
      if (host) host.innerHTML = renderDietItemModal({ foods: state.foods || [], item: state.foodItemContext.item });
      host?.querySelector('[data-food-field="food_id"]')?.focus();
      return;
    }
    if (action === 'remove') {
      const items = currentMealItems(button.dataset.meal, button.dataset.day || '');
      items.splice(Number(button.dataset.index), 1);
      storeMealItems(button.dataset.meal, button.dataset.day || '', items);
      return;
    }
    if (action === 'save') {
      const modal = dietForm.querySelector('[data-food-modal]');
      const context = state.foodItemContext;
      if (!modal || !context) return;
      const select = modal.querySelector('[data-food-field="food_id"]');
      const foodId = select?.value || '';
      const food = (state.foods || []).find((item) => String(item.id) === String(foodId));
      const amount = modal.querySelector('[data-food-field="quantidade_valor"]')?.value || '';
      const unit = modal.querySelector('[data-food-field="quantidade_unidade"]')?.value || 'g';
      const name = food?.item || modal.querySelector('[data-food-field="nome"]')?.value?.trim() || '';
      if (select && !foodId) { select.reportValidity(); select.focus(); return; }
      if (!name) { modal.querySelector('[data-food-field="nome"]')?.focus(); return; }
      if (!(Number(amount) > 0)) { modal.querySelector('[data-food-field="quantidade_valor"]')?.reportValidity(); return; }
      const item = { alimento_id: food?.id || null, food_id: food?.id || null, nome: name, quantidade_valor: Number(amount), quantidade_unidade: unit, quantidade: `${amount} ${unit}`, observacao: modal.querySelector('[data-food-field="observacao"]')?.value?.trim() || '' };
      const items = currentMealItems(context.meal, context.day);
      if (Number.isInteger(context.index)) items[context.index] = item; else items.push(item);
      storeMealItems(context.meal, context.day, items);
      closeFoodModal();
    }
  });
  dietForm?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-week-action]');
    if (!button) return;
    if (button.dataset.weekAction !== 'copy-monday') return;
    const sourceMeals = DIET_MEALS.map((meal) => ({ meal, items: currentMealItems(meal.tipo, 'day0') }));
    if (!sourceMeals.some(({ items }) => items.length)) {
      showToast('Preencha a segunda-feira antes de copiar.', { type: 'error' });
      return;
    }
    const hasTarget = DIET_MEALS.some(({ meal }) => [1, 2, 3, 4, 5, 6].some((day) => currentMealItems(meal.tipo, `day${day}`).length));
    if (hasTarget && !(await confirmAction('O cardápio dos outros dias será substituído pelo da segunda-feira.', { title: 'Copiar segunda?', confirmLabel: 'Copiar', tone: 'primary' }))) return;
    sourceMeals.forEach(({ meal, items }) => {
      for (let day = 1; day < DIET_WEEK.length; day += 1) storeMealItems(meal.tipo, `day${day}`, cloneDiet(items) || []);
    });
    showToast('Segunda-feira copiada para terça a domingo.', { type: 'success' });
  });

  dietForm?.addEventListener('keydown', (event) => {
    if (!dietForm.querySelector('[data-food-modal]')) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeFoodModal(); return; }
    if (event.key === 'Enter' && !event.target.matches('textarea')) event.preventDefault();
  });
}
