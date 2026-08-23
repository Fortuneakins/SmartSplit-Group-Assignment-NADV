const express = require('express');
const axios = require('axios');
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { computeSplits, ensureSplitMembersAreInGroup, badRequest } = require('../lib/splitLogic');

const router = express.Router();

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const SERVICE_TIMEOUT_MS = Number(process.env.SERVICE_TIMEOUT_MS || 5000);
const SERVICE_RETRIES = Number(process.env.SERVICE_RETRIES || 2);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err) {
  const status = err.response?.status;
  return !status || status >= 500 || ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(err.code);
}

/**
 * GET wrapper around axios with bounded retries + exponential backoff for
 * calls to user-service. Only retries on network failures / 5xx responses
 * (never on 4xx, which represent a real client error that retrying won't fix).
 * Surfaces a clean 503 to our own caller instead of an opaque axios error.
 */
async function serviceGet(url, config = {}) {
  let lastError;
  for (let attempt = 0; attempt <= SERVICE_RETRIES; attempt += 1) {
    try {
      return await axios.get(url, { timeout: SERVICE_TIMEOUT_MS, ...config });
    } catch (err) {
      lastError = err;
      if (attempt >= SERVICE_RETRIES || !isRetryable(err)) break;
      await sleep(150 * 2 ** attempt);
    }
  }
  const error = new Error('user/group service is temporarily unavailable');
  error.status = 503;
  error.expose = true;
  error.cause = lastError;
  throw error;
}

async function assertMembership(groupId, userId) {
  const { data } = await serviceGet(`${USER_SERVICE_URL}/internal/groups/${groupId}/members/${userId}/check`);
  return data.isMember;
}

async function getGroupMemberIds(groupId) {
  const { data } = await serviceGet(`${USER_SERVICE_URL}/internal/groups/${groupId}/members`);
  return data.map((member) => member.id);
}

/**
 * Validates and normalises the body of a create/update expense request,
 * checking group membership (via user-service) and delegating the actual
 * split-share arithmetic to splitLogic.computeSplits. Throws a badRequest
 * (400) or a 403 error on any validation failure; the route handler is
 * responsible only for catching that and persisting the result.
 */
async function validateExpenseInput(groupId, requesterId, body) {
  const { description, amount, splitType, paidBy, memberIds, splitInput } = body;

  if (typeof description !== 'string' || !description.trim()) {
    throw badRequest('description is required');
  }

  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw badRequest('amount must be a number greater than 0');
  }
  // Normalise to a clean 2-decimal (cent) value ONCE, here, and use this same
  // value for both the stored `amount` column and the split computation below.
  // Without this, `amount` (rounded by Postgres's NUMERIC(12,2) column on
  // insert) and `Math.round(amount * 100)` inside computeSplits (JS float
  // rounding) can occasionally disagree by a cent for values that aren't
  // exactly representable in binary floating point (e.g. 99.995), which
  // silently breaks the invariant that splits always sum to the expense
  // amount and shows up later as a group balance that won't net to zero.
  const numericAmount = Math.round(parsedAmount * 100) / 100;

  if (!['equal', 'exact', 'percentage'].includes(splitType)) {
    throw badRequest('splitType must be equal, exact or percentage');
  }

  if (!(await assertMembership(groupId, requesterId))) {
    const err = new Error('you are not a member of this group');
    err.status = 403;
    err.expose = true;
    throw err;
  }

  const groupMemberIds = await getGroupMemberIds(groupId);
  const payer = paidBy || requesterId;
  if (!groupMemberIds.includes(payer)) {
    throw badRequest('paidBy must be a member of this group');
  }

  ensureSplitMembersAreInGroup(memberIds, groupMemberIds);

  if (splitType !== 'equal') {
    const splitIds = Object.keys(splitInput || {});
    const selected = [...memberIds].sort();
    const provided = [...splitIds].sort();
    if (selected.length !== provided.length || selected.some((id, i) => id !== provided[i])) {
      throw badRequest('splitInput must contain exactly the selected memberIds');
    }
  }

  const splits = computeSplits(numericAmount, splitType, memberIds, splitInput);
  return { description: description.trim(), amount: numericAmount, splitType, payer, splits };
}

// --- Log a new shared expense ---
router.post('/groups/:groupId/expenses', requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { groupId } = req.params;
    const input = await validateExpenseInput(groupId, req.userId, req.body);

    await client.query('BEGIN');
    const expenseResult = await client.query(
      `INSERT INTO expenses (group_id, paid_by, description, amount, split_type)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, group_id, paid_by, description, amount, split_type, created_at`,
      [groupId, input.payer, input.description, input.amount, input.splitType]
    );
    const expense = expenseResult.rows[0];

    for (const s of input.splits) {
      await client.query('INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES ($1, $2, $3)', [
        expense.id,
        s.userId,
        s.amountOwed,
      ]);
    }
    await client.query('COMMIT');

    res.status(201).json({ ...expense, splits: input.splits });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// --- List all expenses for a group ---
router.get('/groups/:groupId/expenses', requireAuth, async (req, res, next) => {
  try {
    const { groupId } = req.params;
    if (!(await assertMembership(groupId, req.userId))) {
      return res.status(403).json({ error: 'you are not a member of this group' });
    }

    const expensesResult = await pool.query(
      `SELECT id, group_id, paid_by, description, amount, split_type, created_at
       FROM expenses WHERE group_id = $1 ORDER BY created_at DESC`,
      [groupId]
    );
    const expenses = expensesResult.rows;

    if (expenses.length === 0) return res.json([]);

    const splitsResult = await pool.query(
      `SELECT expense_id, user_id, amount_owed FROM expense_splits WHERE expense_id = ANY($1::uuid[])`,
      [expenses.map((e) => e.id)]
    );

    const splitsByExpense = {};
    for (const s of splitsResult.rows) {
      (splitsByExpense[s.expense_id] ||= []).push({ userId: s.user_id, amountOwed: Number(s.amount_owed) });
    }

    res.json(expenses.map((e) => ({ ...e, splits: splitsByExpense[e.id] || [] })));
  } catch (err) {
    next(err);
  }
});

// --- Update an expense and replace its split definition atomically ---
router.put('/groups/:groupId/expenses/:expenseId', requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { groupId, expenseId } = req.params;
    const existing = await pool.query(
      'SELECT id FROM expenses WHERE id = $1 AND group_id = $2',
      [expenseId, groupId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'expense not found' });

    const input = await validateExpenseInput(groupId, req.userId, req.body);

    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE expenses
       SET paid_by = $1, description = $2, amount = $3, split_type = $4
       WHERE id = $5 AND group_id = $6
       RETURNING id, group_id, paid_by, description, amount, split_type, created_at`,
      [input.payer, input.description, input.amount, input.splitType, expenseId, groupId]
    );

    await client.query('DELETE FROM expense_splits WHERE expense_id = $1', [expenseId]);
    for (const s of input.splits) {
      await client.query('INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES ($1, $2, $3)', [
        expenseId,
        s.userId,
        s.amountOwed,
      ]);
    }
    await client.query('COMMIT');

    res.json({ ...updated.rows[0], splits: input.splits });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// --- Delete an expense. expense_splits are removed automatically by FK cascade. ---
router.delete('/groups/:groupId/expenses/:expenseId', requireAuth, async (req, res, next) => {
  try {
    const { groupId, expenseId } = req.params;
    if (!(await assertMembership(groupId, req.userId))) {
      return res.status(403).json({ error: 'you are not a member of this group' });
    }

    const result = await pool.query('DELETE FROM expenses WHERE id = $1 AND group_id = $2 RETURNING id', [expenseId, groupId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'expense not found' });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// --- Internal: net balance per member for a group (paid - owed), used by settlement-service ---
// NOTE: intentionally has no requireAuth. This route is only ever reached via
// the internal Docker/localhost network (settlement-service calling directly),
// never through the API Gateway, which does not proxy any /internal/* path.
// It carries no user-supplied identity and returns no data beyond one group's
// aggregate balances, so it is safe to leave unauthenticated for this
// service-to-service call pattern (see README section 1 for the network topology).
router.get('/internal/groups/:groupId/net-balances', async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const paidResult = await pool.query(
      `SELECT paid_by AS user_id, COALESCE(SUM(amount), 0) AS total_paid
       FROM expenses WHERE group_id = $1 GROUP BY paid_by`,
      [groupId]
    );
    const owedResult = await pool.query(
      `SELECT es.user_id, COALESCE(SUM(es.amount_owed), 0) AS total_owed
       FROM expense_splits es
       JOIN expenses e ON e.id = es.expense_id
       WHERE e.group_id = $1
       GROUP BY es.user_id`,
      [groupId]
    );

    const balances = {};
    for (const row of paidResult.rows) balances[row.user_id] = (balances[row.user_id] || 0) + Number(row.total_paid);
    for (const row of owedResult.rows) balances[row.user_id] = (balances[row.user_id] || 0) - Number(row.total_owed);

    Object.keys(balances).forEach((id) => (balances[id] = Math.round(balances[id] * 100) / 100));

    res.json(balances);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
