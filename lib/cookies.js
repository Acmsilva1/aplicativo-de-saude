export function isSecureCookie(req) {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (req.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0]?.trim().toLowerCase();
  return proto === 'https';
}

import { SESSION_TTL_MS } from './sessionTtl.js';

export function sessionCookieOptions(req, maxAgeMs = SESSION_TTL_MS) {
  return { httpOnly: true, sameSite: 'strict', secure: isSecureCookie(req), path: '/', maxAge: maxAgeMs };
}

export function readCookie(req, name) {
  const entry = String(req.headers.cookie || '')
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${name}=`));
  try { return entry ? decodeURIComponent(entry.slice(name.length + 1)) : ''; }
  catch { return ''; }
}
