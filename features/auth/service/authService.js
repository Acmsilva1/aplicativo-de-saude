import { useMockData } from '../../../lib/env.js';
import * as mock from './mockAuthService.js';
import * as real from './supabaseAuthService.js';

export function isMockAuthEnabled() {
  return useMockData();
}

export async function getUser(req, res) {
  return useMockData() ? mock.getDemoUser(req) : real.getUser(req, res);
}

export async function createSession(req, res) {
  return useMockData() ? mock.createDemoSession(req, res) : real.createSession(req, res);
}

export async function clearSession(req, res) {
  return useMockData() ? mock.clearDemoSession(req, res) : real.clearSession(req, res);
}

export async function changePassword(req, res, password) {
  return useMockData()
    ? mock.changeDemoPassword(req, res, password)
    : real.changePassword(req, res, password);
}

export async function completeInvite(req, res, payload) {
  return useMockData()
    ? mock.completeDemoInvite(req, res, payload)
    : real.completeInvite(req, res, payload);
}

export async function listUsers() {
  return useMockData() ? mock.listDemoUsers() : real.listUsers();
}

export async function listActiveProfessors() {
  return useMockData() ? mock.listActiveProfessors() : real.listActiveProfessors();
}

export async function listAvailableStudents(professorId = '') {
  return useMockData()
    ? mock.listAvailableStudents(professorId)
    : real.listAvailableStudents(professorId);
}

export async function createAccount(payload, req) {
  return useMockData() ? mock.createDemoAccount(payload) : real.createAccount(payload, req);
}

export async function sendPasswordSetupEmail(id, req) {
  return useMockData()
    ? mock.sendPasswordSetupEmail(id)
    : real.sendPasswordSetupEmail(id, req);
}

export async function regenerateTemporaryPassword(id, req) {
  return sendPasswordSetupEmail(id, req);
}

export async function updateAccount(id, payload) {
  return useMockData() ? mock.updateDemoAccount(id, payload) : real.updateAccount(id, payload);
}

export async function setAccountAccess(id, access) {
  return useMockData() ? mock.setAccountAccess(id, access) : real.setAccountAccess(id, access);
}

export async function deleteAccount(id) {
  return useMockData() ? mock.deleteDemoAccount(id) : real.deleteAccount(id);
}

export async function verifyAccountPassword(email, password) {
  return useMockData()
    ? mock.verifyDemoPassword(email, password)
    : real.verifyPassword(email, password);
}
