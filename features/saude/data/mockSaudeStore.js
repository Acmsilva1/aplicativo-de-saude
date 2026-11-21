import { listAvailableStudents } from '../../auth/service/mockAuthService.js';
import { randomUUID } from 'node:crypto';
import { createEmptyDietMeals, todayDietDate } from '../service/dietasService.js';
import { ALIMENTOS_NUTRICIONAIS } from './alimentosNutricionais.js';
const users = new Map();
function dataFor(id) {
 if(!users.has(id))users.set(id,{diets:[],goal:null,goalName:'Hidratação diária',entries:[]});
 const data=users.get(id);
 return data;
}
function normalizedMeals(source) {
 return createEmptyDietMeals().map(m=>{const entry=Array.isArray(source)?source.find(x=>x?.tipo===m.tipo):null; return {...m,horario:/^([01]\d|2[0-3]):[0-5]\d$/.test(entry?.horario)?entry.horario:'',itens:(Array.isArray(entry?.itens)?entry.itens:[]).slice(0,80).filter(Boolean).map(x=>({nome:String(x.nome||'').slice(0,160),quantidade:String(x.quantidade||'').slice(0,80),observacao:String(x.observacao||'').slice(0,500),alimento_id:Number.isSafeInteger(Number(x.alimento_id||x.food_id))?Number(x.alimento_id||x.food_id):null,...(Number.isFinite(Number(x.quantidade_valor))&&Number(x.quantidade_valor)>0?{quantidade_valor:Number(x.quantidade_valor),quantidade_unidade:['g','ml','un','porcao'].includes(x.quantidade_unidade)?x.quantidade_unidade:'g'}:{})})).filter(x=>x.nome)};});
}
function buildDiet(input,id){
  const diet={id:id||randomUUID(),titulo:String(input.titulo||input.title||'').trim().slice(0,160),objetivo:String(input.objetivo||input.objective||'').slice(0,240),observacoes:String(input.observacoes||'').slice(0,4000),meta_calorias:input.meta_calorias?Number(input.meta_calorias):null,semanal:input.semanal===true,visible_to_student:input.visible_to_student===true,refeicoes:normalizedMeals(input.refeicoes),updated_at:todayDietDate()};
  if(diet.semanal)diet.semana=Array.from({length:7},(_,i)=>({refeicoes:normalizedMeals(input.semana?.[i]?.refeicoes||[])}));
 return diet;
}
const portfolios=new Map();
function templatesFor(ownerId){
 if(!portfolios.has(ownerId))portfolios.set(ownerId,[buildDiet({titulo:'Modelo — rotina diária',objetivo:'Exemplo de organização diária',refeicoes:[{tipo:'cafe_da_manha',horario:'08:00',itens:[{nome:'Ovo inteiro',quantidade:'2 un',alimento_id:10,quantidade_valor:2,quantidade_unidade:'un'},{nome:'Banana',quantidade:'1 un',alimento_id:37,quantidade_valor:1,quantidade_unidade:'un'}]},{tipo:'almoco',horario:'12:30',itens:[{nome:'Arroz integral cozido',quantidade:'100 g',alimento_id:15,quantidade_valor:100,quantidade_unidade:'g'},{nome:'Feijão cozido',quantidade:'100 g',alimento_id:27,quantidade_valor:100,quantidade_unidade:'g'}]}]}),buildDiet({titulo:'Modelo — rotina vegetariana',objetivo:'Exemplo de plano sem carnes',refeicoes:[{tipo:'almoco',horario:'12:00',itens:[{nome:'Lentilha cozida',quantidade:'100 g',alimento_id:28,quantidade_valor:100,quantidade_unidade:'g'},{nome:'Arroz integral cozido',quantidade:'100 g',alimento_id:15,quantidade_valor:100,quantidade_unidade:'g'}]},{tipo:'jantar',horario:'19:00',itens:[{nome:'Ovo inteiro',quantidade:'2 un',alimento_id:10,quantidade_valor:2,quantidade_unidade:'un'}]}]}),buildDiet({titulo:'Modelo — planejamento semanal',objetivo:'Exemplo de organização em sete dias',semanal:true,semana:Array.from({length:7},(_,i)=>({refeicoes:[{tipo:'almoco',horario:'12:30',itens:[{nome:['Frango com legumes','Peixe com arroz','Lentilha com salada','Omelete com legumes','Arroz e feijão','Macarrão com legumes','Sopa de legumes'][i],quantidade:'1 porção'}]}]}))})].map(d=>({...d,observacoes:'Dados fictícios para demonstração. Personalize antes de atribuir ao aluno.'})));
 return portfolios.get(ownerId);
}
export const mockSaudeStore = {
 deleteUserData(id){users.delete(id);portfolios.delete(id);},
 getTemplates(ownerId){return structuredClone(templatesFor(ownerId));},
 saveTemplate(ownerId,input,id){const list=templatesFor(ownerId);const index=list.findIndex(x=>x.id===id);if(id&&index<0)return null;const template=buildDiet(input,id);if(index<0)list.push(template);else list[index]=template;return structuredClone(template);},
 deleteTemplate(ownerId,id){const list=templatesFor(ownerId);const index=list.findIndex(x=>x.id===id);if(index<0)return false;list.splice(index,1);return true;},
 getProfessorUsers(professorId){return listAvailableStudents(professorId).map(p=>{const diets=dataFor(p.id).diets.filter(diet=>diet.visible_to_student);return {...p,diet_title:diets[0]?.titulo||'Sem dieta',diet_count:diets.length,water:this.getWater(p.id)};});},
 getProfessorDietSummaries(professorId,studentId){if(!listAvailableStudents(professorId).some(p=>p.id===studentId))return null;return dataFor(studentId).diets.map(({id,titulo,objetivo,observacoes,meta_calorias,semanal,visible_to_student,updated_at})=>({id,titulo,objetivo,observacoes,meta_calorias,semanal,visible_to_student,updated_at}));},
 getProfessorWater(professorId,studentId){const user=listAvailableStudents(professorId).find(p=>p.id===studentId);return user?{user,water:this.getWater(studentId)}:null;},
 canUserAccess(id){return listAvailableStudents().some(p=>p.id===id&&p.access);},
 hasStudent(id,professorId){return listAvailableStudents(professorId).some(p=>p.id===id);},
 getDiets(id){return structuredClone(dataFor(id).diets.filter(diet=>diet.visible_to_student));},
 getProfessorDiets(id){return structuredClone(dataFor(id).diets);},
 setDietVisibility(id,dietId,visible){const diet=dataFor(id).diets.find(x=>x.id===dietId);if(!diet)return null;diet.visible_to_student=visible;return {id:diet.id,visible_to_student:visible};},
 getDiet(id,dietId){return structuredClone(dataFor(id).diets.find(x=>x.id===dietId)||dataFor(id).diets[0]||null);},
 saveDiet(id,input,dietId){
  const d=dataFor(id);const index=d.diets.findIndex(x=>x.id===dietId);if(dietId&&index<0)return null;
  const diet=buildDiet(input,dietId);
  if(index>=0&&typeof input.visible_to_student!=='boolean')diet.visible_to_student=d.diets[index].visible_to_student===true;
  if(index>=0)d.diets[index]=diet;else d.diets.push(diet);return structuredClone(diet);
 },
 deleteDiet(id,dietId){const d=dataFor(id);const index=d.diets.findIndex(x=>x.id===dietId);if(index<0)return false;d.diets.splice(index,1);return true;},
 getWater(id){const d=dataFor(id);const date=todayDietDate();const entries=d.entries.filter(x=>x.date===date);return {goal_ml:d.goal,nome:d.goalName,checkins:structuredClone(entries),total_ml:entries.reduce((s,x)=>s+x.amount_ml,0),date,history:[...new Set(d.entries.map(x=>x.date))].filter(x=>x!==date).map(day=>({date:day,total_ml:d.entries.filter(x=>x.date===day).reduce((s,x)=>s+x.amount_ml,0)}))};},
 setWaterGoal(id,goal,name){const d=dataFor(id);d.goal=goal;d.goalName=String(name||d.goalName||'Hidratação diária').slice(0,80);return this.getWater(id);},
 deleteWaterGoal(id){const d=dataFor(id);d.goal=null;return this.getWater(id);},
 listAlimentos(){return structuredClone(ALIMENTOS_NUTRICIONAIS.map(food=>({...food,id:food.id??food.source_order})));},
 addWater(id,amount){const d=dataFor(id);d.entries.push({id:randomUUID(),amount_ml:amount,date:todayDietDate(),time:new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date())});return this.getWater(id);}
};
