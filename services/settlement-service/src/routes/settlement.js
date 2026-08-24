const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');
const {
  getNetBalances,
  isMember,
  getGroupMembers,
} = require('../services/expenseClient');
const { minimiseTransactions } = require('../optimisation/minTransactions');

const router = express.Router();

/**
 * Ensure the authenticated user belongs to the requested group.
 *
 * Keeping this check in one helper avoids repeating the same membership
 * validation in every settlement route.
 *
 * @param {string} groupId
 * @param {string} userId
 * @param {import('express').Response} res
 * @returns {Promise<boolean>} true when the user is a member
 */
async function requireGroupMembership(groupId, userId, res) {
  const member = await isMember(groupId, userId);

  if (!member) {
    res.status(403).json({
      error: 'you are not a member of this group',
    });

    return false;
  }

  return true;
}

/**
 * Build a lookup table for member names.
 *
 * This allows settlement payment responses to include human-readable
 * names without repeatedly searching the members array.
 *
 * @param {Array<{id: string, fullName: string}>} members
 * @returns {Record<string, string>}
 */
function buildNameLookup(members) {
  return Object.fromEntries(
    members.map((member) => [member.id, member.fullName])
  );
}

/**
 * Convert the raw balance response into a complete balance object.
 *
 * Every current group member is included. If the expense service does not
 * return a balance for a member, that member is treated as having a zero
 * balance.
 *
 * @param {Array<{id: string}>} members
 * @param {Record<string, number>} rawBalances
 * @returns {Record<string, number>}
 */
function buildMemberBalances(members, rawBalances) {
  return Object.fromEntries(
    members.map((member) => [
      member.id,
      Number(rawBalances[member.id] || 0),
    ])
  );
}

/**
 * Add human-readable member names to settlement payments.
 *
 * @param {Array<{
 *   from: string,
 *   to: string,
 *   amount: number
 * }>} payments
 * @param {Record<string, string>} nameById
 * @returns {Array<object>}
 */
function formatPayments(payments, nameById) {
  return payments.map((payment) => ({
    ...payment,
    fromName: nameById[payment.from],
    toName: nameById[payment.to],
  }));
}

// -----------------------------------------------------------------------
// GET /groups/:groupId/balances
// -----------------------------------------------------------------------
// Return the current net balance of every member in the group.
//
// This endpoint does not create or persist a settlement.
// -----------------------------------------------------------------------

router.get('/groups/:groupId/balances', requireAuth, async (req, res, next) => {
  try {
    const { groupId } = req.params;

    if (!(await requireGroupMembership(groupId, req.userId, res))) {
      return;
    }

    const [rawBalances, members] = await Promise.all([
      getNetBalances(groupId),
      getGroupMembers(groupId),
    ]);

    const result = members.map((member) => ({
      userId: member.id,
      fullName: member.fullName,
      balance: Number(rawBalances[member.id] || 0),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------
// POST /groups/:groupId/settle
// -----------------------------------------------------------------------
// Calculate the minimum-payment settlement plan and persist it.
//
// The settlement header and all payment rows are written inside one
// database transaction. If any insert fails, everything is rolled back.
// -----------------------------------------------------------------------

router.post('/groups/:groupId/settle', requireAuth, async (req, res, next) => {
  try {
    const { groupId } = req.params;

    if (!(await requireGroupMembership(groupId, req.userId, res))) {
      return;
    }

    const [rawBalances, members] = await Promise.all([
      getNetBalances(groupId),
      getGroupMembers(groupId),
    ]);

    const balances = buildMemberBalances(members, rawBalances);

    let payments;
    let algorithm;

    // The optimisation engine validates that all balances net to zero.
    // An inconsistent balance state is reported to the API client as 409.
    try {
      ({ payments, algorithm } = minimiseTransactions(balances));
    } catch (err) {
      const conflict = new Error(
        `cannot settle this group because its balances are inconsistent: ${err.message}`
      );

      conflict.status = 409;
      conflict.expose = true;

      throw conflict;
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Insert the settlement header first so its generated ID can be
      // referenced by the individual payment records.
      const settlementResult = await client.query(
        `INSERT INTO settlements
          (group_id, algorithm, total_payments)
         VALUES ($1, $2, $3)
         RETURNING id, group_id, algorithm, total_payments, created_at`,
        [groupId, algorithm, payments.length]
      );

      const settlement = settlementResult.rows[0];

      // Store every payment as part of the same database transaction.
      for (const payment of payments) {
        await client.query(
          `INSERT INTO settlement_payments
            (settlement_id, from_user, to_user, amount)
           VALUES ($1, $2, $3, $4)`,
          [
            settlement.id,
            payment.from,
            payment.to,
            payment.amount,
          ]
        );
      }

      // Only make the settlement visible after every payment was stored.
      await client.query('COMMIT');

      const nameById = buildNameLookup(members);

      res.status(201).json({
        ...settlement,
        payments: formatPayments(payments, nameById),
      });
    } catch (err) {
      // Ensure no partial settlement remains in the database.
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------
// GET /groups/:groupId/settlements/:settlementId
// -----------------------------------------------------------------------
// Retrieve a previously generated settlement and its payments.
// -----------------------------------------------------------------------

router.get(
  '/groups/:groupId/settlements/:settlementId',
  requireAuth,
  async (req, res, next) => {
    try {
      const { groupId, settlementId } = req.params;

      if (!(await requireGroupMembership(groupId, req.userId, res))) {
        return;
      }

      const settlementResult = await pool.query(
        `SELECT
          id,
          group_id,
          algorithm,
          total_payments,
          created_at
         FROM settlements
         WHERE id = $1
           AND group_id = $2`,
        [settlementId, groupId]
      );

      if (settlementResult.rows.length === 0) {
        return res.status(404).json({
          error: 'settlement not found',
        });
      }

      const paymentsResult = await pool.query(
        `SELECT
          from_user,
          to_user,
          amount
         FROM settlement_payments
         WHERE settlement_id = $1`,
        [settlementId]
      );

      res.json({
        ...settlementResult.rows[0],
        payments: paymentsResult.rows,
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------
// GET /groups/:groupId/settlements
// -----------------------------------------------------------------------
// Return settlement history for the group, newest first.
// -----------------------------------------------------------------------

router.get(
  '/groups/:groupId/settlements',
  requireAuth,
  async (req, res, next) => {
    try {
      const { groupId } = req.params;

      if (!(await requireGroupMembership(groupId, req.userId, res))) {
        return;
      }

      const result = await pool.query(
        `SELECT
          id,
          algorithm,
          total_payments,
          created_at
         FROM settlements
         WHERE group_id = $1
         ORDER BY created_at DESC`,
        [groupId]
      );

      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;