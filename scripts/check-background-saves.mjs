import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createBackgroundSaves } from '../features/backgroundSaves.js';

const source = await readFile(new URL('../features/app.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};

// Failed check-in must not remove a later click or produce duplicate totals.
let water = { total_ml: 0 };
const first = deferred(), second = deferred();
const saves = createBackgroundSaves();
for (const [amount, network] of [[200, first], [300, second]]) saves.save({
  key: 'water', read: () => water, write: value => { water = value; },
  project: value => ({ total_ml: value.total_ml + amount }), persist: () => network.promise,
});
assert.equal(water.total_ml, 500);
first.reject(Error('Simulated offline'));
await tick();
assert.equal(water.total_ml, 300);
let independentFinished = false;
saves.idle(['templates:all']).then(() => { independentFinished = true; });
await tick();
assert.equal(independentFinished, true, 'unrelated navigation must not wait for water');
second.resolve({ total_ml: 300 });
await saves.idle();
assert.equal(water.total_ml, 300);
assert.equal(saves.pending, 0);

// Actual app projections: failed title edit followed by successful visibility.
const edit = deferred(), toggle = deferred();
const state = { selectedUserId: 'u', diets: [{ id: 'd', titulo: 'Original', visible_to_student: false }], module: 'diets' };
let calls = 0;
const context = vm.createContext({
  state,
  structuredClone,
  crypto,
  mutate: () => ++calls === 1 ? edit.promise : toggle.promise,
  saved() {},
  failed() {},
  clearDietCacheForUser() {},
  saves: createBackgroundSaves(),
});
vm.runInContext(source.slice(source.indexOf('function savePlan('), source.indexOf('\nfunction saveWater(')), context);
context.savePlan({ id: 'd', user_id: 'u', titulo: 'Não salvo' });
context.savePlan({ id: 'd', user_id: 'u', action: 'visibility', visible_to_student: true }, { visibility: true });
edit.reject(Error('Simulated failure'));
await tick();
toggle.resolve({ id: 'd', visible_to_student: true });
await context.saves.idle();
assert.equal(state.diets[0].titulo, 'Original');
assert.equal(state.diets[0].visible_to_student, true);

// Entering hydration does not download the food catalog or diet portfolio.
const urls = [];
const navigationState = { user: { role: 'professor' }, module: 'home', selectedUserId: 'u', profilesLoaded: true, profiles: [{ id: 'u' }], templates: [], foods: [], diets: [] };
const navigation = vm.createContext({
  state: navigationState,
  saves: createBackgroundSaves(),
  flushWaterBuffer: async () => {},
  request: async url => {
    urls.push(url);
    if (url.includes('professor-agua')) return { user: { id: 'u' }, water: {} };
    throw Error(`Unexpected eager request: ${url}`);
  },
});
vm.runInContext(source.slice(source.indexOf('async function load('), source.indexOf('\nasync function navigate(')), navigation);
await navigation.load('monitor', 'u');
assert.equal(urls.length, 1);
assert.ok(urls[0].includes('professor-agua'));
assert.equal(navigationState.foodsLoaded, undefined);

// A hung fetch terminates with an actionable timeout error.
let abortRequest;
const network = vm.createContext({ AbortController, setTimeout: callback => { abortRequest = callback; return 1; }, clearTimeout() {}, fetch: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('aborted')))) });
vm.runInContext(source.slice(source.indexOf('async function request('), source.indexOf('\nconst mutate=')), network);
const hung = network.request('/api/test');
abortRequest();
await assert.rejects(hung, /servidor demorou/);
console.log('PASS: optimistic overlap, isolated rollback, scoped navigation, lazy catalog and request timeout');
