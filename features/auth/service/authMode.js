import { hasSupabaseConfig } from '../../../lib/supabase.js';

/** Mock só em dev sem Supabase (ou FORCE_MOCK=true). Produção exige Supabase. */
export function useMockAuth() {
  if (process.env.FORCE_MOCK === 'true' && process.env.NODE_ENV !== 'production') return true;
  if (process.env.NODE_ENV === 'production') return false;
  return !hasSupabaseConfig();
}

export function assertDataBackendReady() {
  if (process.env.NODE_ENV === 'production' && !hasSupabaseConfig()) {
    throw new Error('Produção exige SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  }
}
