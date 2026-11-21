export function isSecureCookie(req) {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (req.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0]?.trim().toLowerCase();
  return proto === 'https';
}

export function sessionCookieOptions(req, maxAgeMs = 8 * 60 * 60 * 1000) {
  return { httpOnly: true, sameSite: 'strict', secure: isSecureCookie(req), path: '/', maxAge: maxAgeMs };
}

export function readCookie(req, name) {
  const entry = String(req.headers.cookie || '')
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
}
