const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const MAX_IP_ATTEMPTS = 60;
const MAX_BUCKETS = 10000;
const buckets = new Map();

export function checkLoginRateLimit(req, email) {
  const now = Date.now();
  for (const [key, entry] of buckets) if (now >= entry.resetAt) buckets.delete(key);
  // req.ip is resolved by Express using the configured trusted proxy hops.
  // Never trust the raw leftmost client-supplied X-Forwarded-For value here.
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const pairKey = `account:${ip}|${String(email || '').trim().toLowerCase()}`;
  const ipKey = `ip:${ip}`;
  const limits = [[pairKey, MAX_ATTEMPTS], [ipKey, MAX_IP_ATTEMPTS]];
  for (const [key, max] of limits) {
    const entry = buckets.get(key);
    if (entry && entry.count >= max) return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }
  if (buckets.size + limits.filter(([key]) => !buckets.has(key)).length > MAX_BUCKETS) {
    return { allowed: false, retryAfterSec: 60 };
  }
  // Reserve immediately so concurrent failed requests cannot all pass the check.
  for (const [key] of limits) {
    const entry = buckets.get(key) || { count: 0, resetAt: now + WINDOW_MS };
    entry.count++;
    buckets.set(key, entry);
  }
  return { allowed: true, key: pairKey };
}

// Kept for the existing API contract. Attempts are reserved before network I/O.
export function recordLoginFailure(_key) {}

export function clearLoginAttempts(key) {
  // A successful login clears that account's counter, never the aggregate IP cap.
  if (key) buckets.delete(key);
}
