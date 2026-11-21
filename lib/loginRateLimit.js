const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const buckets = new Map();

function bucketKey(req, email) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
  const ip = forwarded || req.socket?.remoteAddress || req.ip || 'unknown';
  return `${ip}|${String(email || '').trim().toLowerCase()}`;
}

export function checkLoginRateLimit(req, email) {
  const key = bucketKey(req, email);
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, entry);
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }
  return { allowed: true, key };
}

export function recordLoginFailure(key) {
  if (!key) return;
  const entry = buckets.get(key);
  if (entry) entry.count += 1;
}

export function clearLoginAttempts(key) {
  if (key) buckets.delete(key);
}