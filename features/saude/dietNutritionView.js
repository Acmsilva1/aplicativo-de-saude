import { dietItemNutritionIssue, enrichDietNutrition, matchFoodForDietItem, nutritionForDietItem } from './service/alimentosService.js';

function escape(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

const number = (value) => value == null ? '—' : Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const line = (nutrition) => `${number(nutrition.kcal)} kcal · Proteína ${number(nutrition.proteina)} g · Carboidratos ${number(nutrition.carboidrato)} g · Gordura ${number(nutrition.gordura)} g`;
const highlightedLine = (nutrition) => `<strong>${escape(number(nutrition.kcal))} kcal</strong> · Proteína <strong>${escape(number(nutrition.proteina))} g</strong> · Carboidratos <strong>${escape(number(nutrition.carboidrato))} g</strong> · Gordura <strong>${escape(number(nutrition.gordura))} g</strong>`;

export const DIET_NUTRITION_STYLES = `
  .diet-food-details { min-width: 0; width: 100%; }
  .diet-food-details summary { display: flex; align-items: center; justify-content: space-between; gap: .65rem; cursor: pointer; list-style: none; }
  .diet-food-details summary::-webkit-details-marker { display: none; }
  .diet-food-details summary > span { min-width: 0; overflow-wrap: anywhere; }
  .diet-food-details summary:focus-visible { outline: 2px solid #c90018; outline-offset: 3px; border-radius: .3rem; }
  .diet-food-details summary > span > small { display: block; color: #64748b; font-size: .75rem; margin-top: .2rem; }
  .diet-food-details summary > i { flex-shrink: 0; transition: transform .15s; }
  .diet-food-details[open] summary > i { transform: rotate(90deg); }
  .diet-food-details__body, .diet-nutrition-total { padding: .75rem; margin: .6rem 0; border: 1px solid #dce4ed; border-radius: .65rem; background: #f7f9fc; color: #344258; font-size: .8rem; line-height: 1.6; overflow-wrap: anywhere; }
  .diet-food-details__body p, .diet-nutrition-total p { margin: .25rem 0; }
  .diet-food-details__body strong, .diet-nutrition-total strong { color: #17253b; font-weight: 750; }
  .diet-nutrition-total { border-color: #cfe3d5; background: #f1f8f3; }
`;

export function renderDietFoodDetails(item, foods = []) {
  const food = matchFoodForDietItem(item, foods);
  const nutrition = nutritionForDietItem(item, food ? [food] : []);
  const issue = dietItemNutritionIssue(item, food ? [food] : []);
  const messages = {
    alimento_sem_vinculo: 'Alimento não vinculado ao catálogo nutricional.',
    quantidade_indefinida: 'Informe uma quantidade única para calcular os nutrientes.',
    peso_nao_cadastrado: 'Cadastre o peso da unidade ou porção para calcular este alimento.',
    nutrientes_incompletos: 'Os dados nutricionais deste alimento estão incompletos no catálogo.',
  };
  const quantity = item.quantidade || (item.quantidade_valor ? `${item.quantidade_valor} ${item.quantidade_unidade || 'g'}` : 'Quantidade não informada');
  return `<details class="diet-food-details"><summary><span><strong>${escape(item.nome)}</strong><small>${escape(quantity)}</small></span><i aria-hidden="true">›</i></summary><div class="diet-food-details__body">${issue
    ? `<p>${escape(messages[issue])}</p>${nutrition.kcal != null ? `<p>Calorias informadas: ${escape(number(nutrition.kcal))} kcal</p>` : ''}`
    : `<p>${highlightedLine(nutrition)}</p>`}${item.observacao ? `<p>${escape(item.observacao)}</p>` : ''}</div></details>`;
}

export function renderDietNutritionTotal(diet, foods = []) {
  const hasItems = (diet.refeicoes || []).some((meal) => Array.isArray(meal.itens) && meal.itens.length);
  if (!hasItems) return '';
  const total = enrichDietNutrition(diet, foods).nutricao_total;
  if (!total) return '';
  return `<div class="diet-nutrition-total"><strong>${total.completo ? 'Total nutricional planejado' : 'Total nutricional parcial'}</strong><p>${escape(line(total))}</p>${total.itens_pendentes ? `<p>${escape(total.itens_pendentes)} alimento(s) precisam de vínculo, quantidade ou dados nutricionais completos.</p>` : ''}${diet.meta_calorias ? `<p>Meta diária: ${escape(diet.meta_calorias)} kcal${total.completo ? ` · Diferença do plano: ${escape(number(total.kcal - Number(diet.meta_calorias)))} kcal` : ''}</p>` : ''}</div>`;
}
