const STORAGE_KEY = 'ritmo_saude_biometric';
const STORAGE_BACKUP_KEY = 'ritmo_saude_biometric_backup';
const COOKIE_KEY = 'ritmo_saude_biometric';

function bufferToBase64Url(value) {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value || []);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBuffer(value) {
  const padded = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function parsePreference(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function readFromStore(store) {
  try {
    return parsePreference(store?.getItem?.(STORAGE_KEY) || store?.getItem?.(STORAGE_BACKUP_KEY));
  } catch {
    return null;
  }
}

function readFromCookie() {
  try {
    const match = String(document.cookie || '').match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
    if (!match) return null;
    return parsePreference(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

function writeCookie(payload) {
  try {
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(payload)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    return true;
  } catch {
    return false;
  }
}

function clearCookie() {
  try {
    document.cookie = `${COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

export function readBiometricPreference() {
  return readFromStore(window.localStorage)
    || readFromStore(window.sessionStorage)
    || readFromCookie();
}

export function writeBiometricPreference(value) {
  if (!value) {
    clearBiometricPreference();
    return true;
  }
  const payload = JSON.stringify(value);
  let saved = false;
  try {
    localStorage.setItem(STORAGE_KEY, payload);
    localStorage.setItem(STORAGE_BACKUP_KEY, payload);
    saved = true;
  } catch {
    /* private mode / quota */
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, payload);
    sessionStorage.setItem(STORAGE_BACKUP_KEY, payload);
    saved = true;
  } catch {
    /* ignore */
  }
  if (writeCookie(payload)) saved = true;
  const verify = readBiometricPreference();
  if (!saved || !verify) return false;
  if (value.credentialId && String(verify.credentialId) !== String(value.credentialId)) return false;
  if (value.preferred && verify.preferred === false) return false;
  return true;
}

export function clearBiometricPreference() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(STORAGE_BACKUP_KEY); } catch { /* ignore */ }
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  try { sessionStorage.removeItem(STORAGE_BACKUP_KEY); } catch { /* ignore */ }
  clearCookie();
}

export function normalizeLoginEmail(email = '') {
  return String(email || '').trim().toLowerCase();
}

/** Tem credencial neste aparelho e não foi desligada de propósito. */
export function isBiometricPreferred() {
  const pref = readBiometricPreference();
  if (!pref?.credentialId) return false;
  if (pref.preferred === false) return false;
  return true;
}

/** Usuário padrão salvo no aparelho (login prioritário estilo app bancário). */
export function hasSavedDeviceUser() {
  return isBiometricPreferred();
}

/** Credencial local vinculada a este e-mail (mesmo após "Mudar usuário"). */
export function hasLocalBiometricForEmail(email = '') {
  const pref = readBiometricPreference();
  if (!pref?.credentialId || pref.preferred === false) return false;
  const saved = normalizeLoginEmail(pref.userEmail);
  if (!saved) return false;
  return saved === normalizeLoginEmail(email);
}

export function hasDeclinedBiometricOffer(userId = '') {
  const pref = readBiometricPreference();
  if (!pref?.offerDeclined) return false;
  if (userId && pref.userId && String(pref.userId) !== String(userId)) return false;
  return true;
}

export function markBiometricOfferDeclined(userId) {
  const current = readBiometricPreference() || {};
  return writeBiometricPreference({
    ...current,
    userId: userId || current.userId || null,
    preferred: false,
    offerDeclined: true,
    offerDeclinedAt: new Date().toISOString(),
  });
}

/** Biometria só no mobile (telefone/tablet). Desktop usa e-mail e senha. */
export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.userAgentData?.mobile === 'boolean') {
    return navigator.userAgentData.mobile;
  }
  const ua = String(navigator.userAgent || '');
  if (/Android|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  // iPadOS moderno se identifica como Mac, mas tem toque.
  if (/iPad/i.test(ua) || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1)) {
    return true;
  }
  return false;
}

export async function supportsPlatformAuth() {
  if (!isMobileDevice()) return false;
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
    return false;
  }
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function publicKeyCredentialToJSON(cred) {
  if (!cred) return null;
  const response = cred.response;
  const json = {
    id: cred.id,
    rawId: bufferToBase64Url(cred.rawId),
    type: cred.type,
    response: {},
    clientExtensionResults: cred.getClientExtensionResults?.() || {},
  };
  if (response.clientDataJSON) json.response.clientDataJSON = bufferToBase64Url(response.clientDataJSON);
  if (response.attestationObject) json.response.attestationObject = bufferToBase64Url(response.attestationObject);
  if (response.authenticatorData) json.response.authenticatorData = bufferToBase64Url(response.authenticatorData);
  if (response.signature) json.response.signature = bufferToBase64Url(response.signature);
  if (response.userHandle) json.response.userHandle = bufferToBase64Url(response.userHandle);
  if (response.getTransports) json.response.transports = response.getTransports();
  return json;
}

function reviveCreationOptions(options) {
  const next = structuredClone(options);
  next.challenge = base64UrlToBuffer(options.challenge);
  if (next.user?.id && typeof next.user.id === 'string') {
    next.user.id = base64UrlToBuffer(next.user.id);
  }
  if (Array.isArray(next.excludeCredentials)) {
    next.excludeCredentials = next.excludeCredentials.map((item) => ({
      ...item,
      id: typeof item.id === 'string' ? base64UrlToBuffer(item.id) : item.id,
    }));
  }
  return next;
}

function reviveRequestOptions(options) {
  const next = structuredClone(options);
  next.challenge = base64UrlToBuffer(options.challenge);
  if (Array.isArray(next.allowCredentials)) {
    next.allowCredentials = next.allowCredentials.map((item) => ({
      ...item,
      id: typeof item.id === 'string' ? base64UrlToBuffer(item.id) : item.id,
    }));
  }
  return next;
}

export async function enrollBiometric(request) {
  const { options } = await request('/api/auth?resource=webauthn-register-options', {
    method: 'POST',
    body: '{}',
  });
  const credential = await navigator.credentials.create({
    publicKey: reviveCreationOptions(options),
  });
  if (!credential) throw Error('Não foi possível capturar a biometria.');
  const result = await request('/api/auth?resource=webauthn-register', {
    method: 'POST',
    body: JSON.stringify({ response: publicKeyCredentialToJSON(credential) }),
  });
  const credentialId = String(result?.credentialId || credential.id || '').trim();
  if (!credentialId) throw Error('Biometria ativada no servidor, mas sem identificador local.');
  return { ...result, credentialId };
}

export async function assertBiometric(request, credentialId) {
  const { options } = await request('/api/auth?resource=webauthn-login-options', {
    method: 'POST',
    body: JSON.stringify({ credentialId }),
  });
  const assertion = await navigator.credentials.get({
    publicKey: reviveRequestOptions(options),
  });
  if (!assertion) throw Error('Biometria cancelada.');
  return request('/api/auth?resource=webauthn-login', {
    method: 'POST',
    body: JSON.stringify({ response: publicKeyCredentialToJSON(assertion) }),
  });
}

export async function revokeBiometric(request, credentialId) {
  if (!credentialId) {
    clearBiometricPreference();
    return { ok: true };
  }
  try {
    await request('/api/auth?resource=webauthn-revoke', {
      method: 'POST',
      body: JSON.stringify({ credentialId }),
    });
  } catch {
    // Preferência local ainda deve ser limpa se a sessão já acabou.
  }
  clearBiometricPreference();
  return { ok: true };
}

export function persistBiometricLogin(userId, credentialId, profile = {}) {
  const id = String(credentialId || '').trim();
  if (!id) throw Error('Credencial biométrica inválida.');
  const current = readBiometricPreference() || {};
  const userName = String(profile.name || profile.nome || current.userName || '').trim();
  const userEmail = String(profile.email || current.userEmail || '').trim().toLowerCase();
  const ok = writeBiometricPreference({
    ...current,
    userId,
    credentialId: id,
    preferred: true,
    offerDeclined: false,
    userName,
    userEmail,
    updatedAt: new Date().toISOString(),
  });
  if (!ok || !isBiometricPreferred()) {
    throw Error('Não foi possível salvar a preferência de biometria neste aparelho.');
  }
  return true;
}
