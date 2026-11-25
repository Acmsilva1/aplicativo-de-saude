const WINDOW_MS = 15 * 60 * 1000;
const WINDOW_SEC = Math.ceil(WINDOW_MS / 1000);
const MAX_ATTEMPTS = 10;
const MAX_IP_ATTEMPTS = 60;
const MAX_BUCKETS = 10000;
const buckets = new Map();

function clientIp(req) {
  // req.ip respeita trust proxy; não usar XFF cru.
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function memoryCheck(req, email) {
  const now = Date.now();
  for (const [key, entry] of buckets) if (now >= entry.resetAt) buckets.delete(key);
  const ip = clientIp(req);
  const pairKey = `account:${ip}|${String(email || '').trim().toLowerCase()}`;
  const ipKey = `ip:${ip}`;
  const limits = [[pairKey, MAX_ATTEMPTS], [ipKey, MAX_IP_ATTEMPTS]];
  for (const [key, max] of limits) {
    const entry = buckets.get(key);
    if (entry && entry.count >= max) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)), key: pairKey };
    }
  }
  if (buckets.size + limits.filter(([key]) => !buckets.has(key)).length > MAX_BUCKETS) {
    return { allowed: false, retryAfterSec: 60, key: pairKey };
  }
  for (const [key] of limits) {
    const entry = buckets.get(key) || { count: 0, resetAt: now + WINDOW_MS };
    entry.count += 1;
    buckets.set(key, entry);
  }
  return { allowed: true, key: pairKey };
}

async function upstashIncr(key, max) {
  const base = String(process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!base || !token) return null;
  const bucket = Math.floor(Date.now() / WINDOW_MS);
  const redisKey = `ritmo:rl:${key}:${bucket}`;
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const incrRes = await fetch(`${base}/incr/${encodeURIComponent(redisKey)}`, { headers });
    if (!incrRes.ok) return null;
    const incrJson = await incrRes.json();
    const count = Number(incrJson?.result);
    if (!Number.isFinite(count)) return null;
    // Melhor esforço: TTL da janela (idempotente se já existir).
    await fetch(`${base}/expire/${encodeURIComponent(redisKey)}/${WINDOW_SEC}`, { headers }).catch(() => null);
    if (count > max) {
      return { allowed: false, retryAfterSec: Math.max(1, WINDOW_SEC - Math.floor((Date.now() % WINDOW_MS) / 1000)) };
    }
    return { allowed: true };
  } catch {
    return null;
  }
}

/** Sync (memória) — usado por testes e fallback. */
export function checkLoginRateLimit(req, email) {
  return memoryCheck(req, email);
}

/**
 * Preferência: Upstash Redis (compartilhado entre instâncias).
 * Sem UPSTASH_* cai no contador em memória.
 */
export async function checkLoginRateLimitAsync(req, email) {
  const ip = clientIp(req);
  const normalized = String(email || '').trim().toLowerCase();
  const pairKey = `account:${ip}|${normalized}`;
  const ipKey = `ip:${ip}`;

  const pair = await upstashIncr(pairKey, MAX_ATTEMPTS);
  if (pair) {
    if (!pair.allowed) return { ...pair, key: pairKey };
    const ipHit = await upstashIncr(ipKey, MAX_IP_ATTEMPTS);
    if (ipHit && !ipHit.allowed) return { ...ipHit, key: pairKey };
    if (ipHit) return { allowed: true, key: pairKey };
    // IP falhou no Redis — não bloqueia o par já contado; fallback memória no IP.
  }

  return memoryCheck(req, email);
}

export function recordLoginFailure(_key) {}

export function clearLoginAttempts(key) {
  if (key) buckets.delete(key);
}
