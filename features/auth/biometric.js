const STORAGE_KEY = 'ritmo_saude_biometric';

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

export function readBiometricPreference() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeBiometricPreference(value) {
  if (!value) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function clearBiometricPreference() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isBiometricPreferred() {
  const pref = readBiometricPreference();
  return Boolean(pref?.preferred && pref?.credentialId);
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
  return result;
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
