/**
 * Service-to-service client for the settlement service.
 *
 * Provides a small abstraction around HTTP calls to the expense and
 * user services. Requests use timeouts and retry transient failures
 * so settlement operations do not hang indefinitely when a downstream
 * service is temporarily unavailable.
 */


const axios = require('axios');

const EXPENSE_SERVICE_URL = process.env.EXPENSE_SERVICE_URL || 'http://localhost:3002';
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const SERVICE_TIMEOUT_MS = Number(process.env.SERVICE_TIMEOUT_MS || 5000);
const SERVICE_RETRIES = Number(process.env.SERVICE_RETRIES || 2);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Determines whether a failed HTTP request is safe to retry.
 *
 * Network failures and 5xx responses are treated as transient.
 * Client errors such as 400/401/403/404 are returned immediately
 * because retrying them will not normally change the outcome.
 */

function isRetryable(err) {
  const status = err.response?.status;
  return !status || status >= 500 || ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(err.code);
}

async function request(method, url, data) {
  let lastError;
  for (let attempt = 0; attempt <= SERVICE_RETRIES; attempt += 1) {
    try {
      return await axios({ method, url, data, timeout: SERVICE_TIMEOUT_MS });
    } catch (err) {
      lastError = err;
      if (attempt >= SERVICE_RETRIES || !isRetryable(err)) break;
      await sleep(150 * 2 ** attempt);
    }
  }

  const serviceName = url.includes(EXPENSE_SERVICE_URL) ? 'expense service' : 'user service';
  const error = new Error(`${serviceName} is temporarily unavailable`);
  error.status = 503;
  error.expose = true;
  error.cause = lastError;
  throw error;
}

/** @returns {Promise<Record<string, number>>} userId -> net balance for the group */
async function getNetBalances(groupId) {
  const { data } = await request('GET', `${EXPENSE_SERVICE_URL}/api/internal/groups/${groupId}/net-balances`);
  return data;
}

async function isMember(groupId, userId) {
  const { data } = await request('GET', `${USER_SERVICE_URL}/internal/groups/${groupId}/members/${userId}/check`);
  return data.isMember;
}

async function resolveUsers(ids) {
  if (ids.length === 0) return [];
  const { data } = await request('POST', `${USER_SERVICE_URL}/internal/users/resolve`, { ids });
  return data;
}

async function getGroupMembers(groupId) {
  const { data } = await request('GET', `${USER_SERVICE_URL}/internal/groups/${groupId}/members`);
  return data;
}

module.exports = { getNetBalances, isMember, resolveUsers, getGroupMembers };
