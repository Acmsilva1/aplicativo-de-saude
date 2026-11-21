import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, '.env') });

export function hasSupabaseConfig() {
  return Boolean(
    process.env.SUPABASE_URL
    && process.env.SUPABASE_SERVICE_ROLE_KEY
    && process.env.SUPABASE_ANON_KEY
  );
}

/** Mock only when not production and Supabase is missing (or FORCE_MOCK=true). */
export function useMockData() {
  if (process.env.FORCE_MOCK === 'true') return process.env.NODE_ENV !== 'production';
  if (process.env.NODE_ENV === 'production') return false;
  return !hasSupabaseConfig();
}

export function assertProductionSupabase() {
  if (process.env.NODE_ENV === 'production' && !hasSupabaseConfig()) {
    throw new Error('Produção exige SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.');
  }
}
