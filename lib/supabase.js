import { createClient } from '@supabase/supabase-js';
import { hasSupabaseConfig } from './env.js';

let adminClient;
let anonClient;

function timeoutFetch(input, init = {}) {
  const timeout = AbortSignal.timeout(15000);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}

export function getSupabaseAdmin() {
  if (!hasSupabaseConfig()) {
    throw new Error('Supabase não configurado.');
  }
  if (!adminClient) {
    adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: timeoutFetch },
    });
  }
  return adminClient;
}

export function getSupabaseAnon() {
  if (!hasSupabaseConfig()) {
    throw new Error('Supabase não configurado.');
  }
  if (!anonClient) {
    anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: timeoutFetch },
    });
  }
  return anonClient;
}

export function createUserClient(accessToken) {
  if (!hasSupabaseConfig()) {
    throw new Error('Supabase não configurado.');
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: timeoutFetch,
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  });
}
