import { useMockData } from '../../../lib/env.js';
import { mockSaudeStore } from './mockSaudeStore.js';
import { supabaseSaudeStore } from './supabaseSaudeStore.js';
import { ALIMENTOS_NUTRICIONAIS } from './alimentosNutricionais.js';

function store() {
  return useMockData() ? mockSaudeStore : supabaseSaudeStore;
}

async function call(method, ...args) {
  const target = store();
  const result = target[method](...args);
  return result instanceof Promise ? result : result;
}

export const saudeStore = {
  deleteUserData: (...args) => call('deleteUserData', ...args),
  getTemplates: (...args) => call('getTemplates', ...args),
  saveTemplate: (...args) => call('saveTemplate', ...args),
  deleteTemplate: (...args) => call('deleteTemplate', ...args),
  getProfessorUsers: (...args) => call('getProfessorUsers', ...args),
  getProfessorDietSummaries: (...args) => call('getProfessorDietSummaries', ...args),
  getProfessorWater: (...args) => call('getProfessorWater', ...args),
  canUserAccess: (...args) => call('canUserAccess', ...args),
  hasStudent: (...args) => call('hasStudent', ...args),
  getDiets: (...args) => call('getDiets', ...args),
  getProfessorDiets: (...args) => call('getProfessorDiets', ...args),
  getDiet: (...args) => call('getDiet', ...args),
  saveDiet: (...args) => call('saveDiet', ...args),
  setDietVisibility: (...args) => call('setDietVisibility', ...args),
  deleteDiet: (...args) => call('deleteDiet', ...args),
  getWater: (...args) => call('getWater', ...args),
  peekWaterGoal: (...args) => call('peekWaterGoal', ...args),
  setWaterGoal: (...args) => call('setWaterGoal', ...args),
  deleteWaterGoal: (...args) => call('deleteWaterGoal', ...args),
  addWater: (...args) => call('addWater', ...args),
  async listAlimentos() {
    if (useMockData()) {
      return ALIMENTOS_NUTRICIONAIS.map((food, index) => ({
        ...food,
        id: food.source_order || index + 1,
      }));
    }
    return supabaseSaudeStore.listAlimentos();
  },
};
