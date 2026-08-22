const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { getNetBalances, isMember, getGroupMembers } = require('../services/expenseClient');
const { minimiseTransactions } = require('../optimisation/minTransactions');

const router = express.Router();

// --- Current net balance per member (does not persist anything) ---
router.get('/groups/:groupId/balances', requireAuth, async (req, res, next) => {
  try {
    const { groupId } = req.params;
    if (!(await isMember(groupId, req.userId))) {
      return res.status(403).json({ error: 'you are not a member of this group' });
    }

    const [balances, members] = await Promise.all([getNetBalances(groupId), getGroupMembers(groupId)]);

    const result = members.map((member) => ({
      userId: member.id,
      fullName: member.fullName,
      balance: Number(balances[member.id] || 0),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// --- Trigger settlement: compute + persist the optimal payment plan ---
router.post('/groups/:groupId/settle', requireAuth, async (req, res, next) => {
  try {
    const { groupId } = req.params;
    if (!(await isMember(groupId, req.userId))) {
      return res.status(403).json({ error: 'you are not a member of this group' });
    }

    const [rawBalances, members] = await Promise.all([getNetBalances(groupId), getGroupMembers(groupId)]);
    const balances = Object.fromEntries(members.map((member) => [member.id, Number(rawBalances[member.id] || 0)]));
    let payments;
    let algorithm;
    try {
      ({ payments, algorithm } = minimiseTransactions(balances));
    } catch (err) {
      const conflict = new Error(`cannot settle this group because its balances are inconsistent: ${err.message}`);
      conflict.status = 409;
      conflict.expose = true;
      throw conflict;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const settlementResult = await client.query(
        'INSERT INTO settlements (group_id, algorithm, total_payments) VALUES ($1, $2, $3) RETURNING id, group_id, algorithm, total_payments, created_at',
        [groupId, algorithm, payments.length]
      );
      const settlement = settlementResult.rows[0];

      for (const p of payments) {
        await client.query(
          'INSERT INTO settlement_payments (settlement_id, from_user, to_user, amount) VALUES ($1, $2, $3, $4)',
          [settlement.id, p.from, p.to, p.amount]
        );
      }
      await client.query('COMMIT');

      const nameById = Object.fromEntries(members.map((u) => [u.id, u.fullName]));

      res.status(201).json({
        ...settlement,
        payments: payments.map((p) => ({ ...p, fromName: nameById[p.from], toName: nameById[p.to] })),
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// --- Retrieve a past settlement result ---
router.get('/groups/:groupId/settlements/:settlementId', requireAuth, async (req, res, next) => {
  try {
    const { groupId, settlementId } = req.params;
    if (!(await isMember(groupId, req.userId))) {
      return res.status(403).json({ error: 'you are not a member of this group' });
    }

    const settlementResult = await pool.query(
      'SELECT id, group_id, algorithm, total_payments, created_at FROM settlements WHERE id = $1 AND group_id = $2',
      [settlementId, groupId]
    );
    if (settlementResult.rows.length === 0) {
      return res.status(404).json({ error: 'settlement not found' });
    }

    const paymentsResult = await pool.query(
      'SELECT from_user, to_user, amount FROM settlement_payments WHERE settlement_id = $1',
      [settlementId]
    );

    res.json({ ...settlementResult.rows[0], payments: paymentsResult.rows });
  } catch (err) {
    next(err);
  }
});

// --- List settlement history for a group ---
router.get('/groups/:groupId/settlements', requireAuth, async (req, res, next) => {
  try {
    const { groupId } = req.params;
    if (!(await isMember(groupId, req.userId))) {
      return res.status(403).json({ error: 'you are not a member of this group' });
    }
    const result = await pool.query(
      'SELECT id, algorithm, total_payments, created_at FROM settlements WHERE group_id = $1 ORDER BY created_at DESC',
      [groupId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
