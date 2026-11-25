import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { useMockData } from '../../../lib/env.js';
import { getSupabaseAdmin, createUserClient } from '../../../lib/supabase.js';
import * as mock from './mockAuthService.js';
import * as real from './supabaseAuthService.js';

const challenges = new Map();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function appPublicUrl(req) {
  const fromEnv = String(process.env.APP_PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const proto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0]?.trim()
    || (req?.secure ? 'https' : 'http');
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0]?.trim();
  if (host) return `${proto}://${host}`;
  return 'http://localhost:5199';
}

function rpConfig(req) {
  const origin = appPublicUrl(req);
  let rpID = 'localhost';
  try {
    rpID = new URL(origin).hostname;
  } catch {
    rpID = 'localhost';
  }
  return { rpID, origin, rpName: 'Ritmo Saúde' };
}

function putChallenge(key, challenge) {
  challenges.set(key, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

function takeChallenge(key) {
  const entry = challenges.get(key);
  challenges.delete(key);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.challenge;
}

function uint8ToBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlToUint8(value) {
  return new Uint8Array(Buffer.from(String(value || ''), 'base64url'));
}

async function listCredentials(userId) {
  if (useMockData()) return mock.listWebAuthnCredentials(userId);
  const { data, error } = await getSupabaseAdmin()
    .from('health_webauthn_credentials')
    .select('credential_id, user_id, public_key, counter, device_type, backed_up, transports')
    .eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

async function getCredential(credentialId) {
  if (useMockData()) return mock.getWebAuthnCredential(credentialId);
  const { data, error } = await getSupabaseAdmin()
    .from('health_webauthn_credentials')
    .select('credential_id, user_id, public_key, counter, device_type, backed_up, transports')
    .eq('credential_id', credentialId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function saveCredential(row) {
  if (useMockData()) return mock.saveWebAuthnCredential(row);
  const { error } = await getSupabaseAdmin().from('health_webauthn_credentials').upsert({
    credential_id: row.credential_id,
    user_id: row.user_id,
    public_key: row.public_key,
    counter: row.counter,
    device_type: row.device_type,
    backed_up: row.backed_up,
    transports: row.transports || [],
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function deleteCredential(credentialId, userId) {
  if (useMockData()) return mock.deleteWebAuthnCredential(credentialId, userId);
  const { error } = await getSupabaseAdmin()
    .from('health_webauthn_credentials')
    .delete()
    .eq('credential_id', credentialId)
    .eq('user_id', userId);
  if (error) throw error;
  return true;
}

async function updateCounter(credentialId, counter) {
  if (useMockData()) return mock.updateWebAuthnCounter(credentialId, counter);
  const { error } = await getSupabaseAdmin()
    .from('health_webauthn_credentials')
    .update({ counter, updated_at: new Date().toISOString() })
    .eq('credential_id', credentialId);
  if (error) throw error;
}

export async function getWebAuthnRegisterOptions(req, user) {
  if (!user?.id) return { error: 'Sessão encerrada. Entre novamente.' };
  const { rpID, rpName } = rpConfig(req);
  const existing = await listCredentials(user.id);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email || user.id,
    userDisplayName: user.name || user.email || 'Usuário',
    userID: new TextEncoder().encode(String(user.id)),
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred',
    },
    excludeCredentials: existing.map((row) => ({
      id: row.credential_id,
      transports: row.transports || undefined,
    })),
  });
  putChallenge(`reg:${user.id}`, options.challenge);
  return { options };
}

export async function verifyWebAuthnRegistration(req, user, body = {}) {
  if (!user?.id) return { error: 'Sessão encerrada. Entre novamente.' };
  const expectedChallenge = takeChallenge(`reg:${user.id}`);
  if (!expectedChallenge) return { error: 'Desafio expirado. Tente ativar a biometria novamente.' };
  const { rpID, origin } = rpConfig(req);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response || body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch {
    return { error: 'Não foi possível validar a biometria neste aparelho.' };
  }
  if (!verification.verified || !verification.registrationInfo) {
    return { error: 'Não foi possível validar a biometria neste aparelho.' };
  }
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  await saveCredential({
    credential_id: credential.id,
    user_id: user.id,
    public_key: uint8ToBase64Url(credential.publicKey),
    counter: credential.counter,
    device_type: credentialDeviceType,
    backed_up: credentialBackedUp,
    transports: credential.transports || [],
  });
  return { ok: true, credentialId: credential.id };
}

export async function getWebAuthnLoginOptions(req, body = {}) {
  const credentialId = String(body.credentialId || body.credential_id || '').trim();
  if (!credentialId) return { error: 'Ative a biometria neste aparelho pelo login com senha.' };
  const stored = await getCredential(credentialId);
  if (!stored) return { error: 'Biometria não encontrada neste aparelho. Entre com e-mail e senha.' };
  const { rpID } = rpConfig(req);
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'required',
    allowCredentials: [{
      id: stored.credential_id,
      transports: stored.transports || undefined,
    }],
  });
  putChallenge(`auth:${credentialId}`, options.challenge);
  return { options, userId: stored.user_id };
}

export async function verifyWebAuthnLogin(req, res, body = {}) {
  const response = body.response || body;
  const credentialId = String(response?.id || body.credentialId || '').trim();
  if (!credentialId) return { error: 'Resposta biométrica inválida.' };
  const expectedChallenge = takeChallenge(`auth:${credentialId}`);
  if (!expectedChallenge) return { error: 'Desafio expirado. Tente a biometria novamente.' };
  const stored = await getCredential(credentialId);
  if (!stored) return { error: 'Biometria não encontrada neste aparelho. Entre com e-mail e senha.' };
  const { rpID, origin } = rpConfig(req);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: stored.credential_id,
        publicKey: base64UrlToUint8(stored.public_key),
        counter: Number(stored.counter || 0),
        transports: stored.transports || undefined,
      },
    });
  } catch {
    return { error: 'Não foi possível validar a biometria. Use e-mail e senha.' };
  }
  if (!verification.verified) {
    return { error: 'Não foi possível validar a biometria. Use e-mail e senha.' };
  }
  const newCounter = verification.authenticationInfo?.newCounter;
  if (typeof newCounter === 'number') await updateCounter(credentialId, newCounter);

  // createSession* só grava cookie se a senha já foi definida.
  const account = useMockData()
    ? mock.createDemoSessionForUserId(req, res, stored.user_id)
    : await real.createSessionForUserId(req, res, stored.user_id);
  if (!account) return { error: 'Conta indisponível. Consulte o administrador.' };
  if (account.must_change_password) {
    return { error: 'Defina sua senha pelo link do e-mail antes de usar a biometria.' };
  }
  return { user: account };
}

export async function listWebAuthnCredentials(user) {
  if (!user?.id) return { error: 'Sessão encerrada. Entre novamente.' };
  const rows = await listCredentials(user.id);
  return {
    credentials: rows.map((row) => ({
      credentialId: row.credential_id,
      deviceType: row.device_type || null,
      transports: row.transports || [],
    })),
  };
}

export async function revokeWebAuthnCredential(user, body = {}) {
  if (!user?.id) return { error: 'Sessão encerrada. Entre novamente.' };
  const credentialId = String(body.credentialId || body.credential_id || '').trim();
  if (!credentialId) return { error: 'Informe a credencial a remover.' };
  await deleteCredential(credentialId, user.id);
  return { ok: true };
}
