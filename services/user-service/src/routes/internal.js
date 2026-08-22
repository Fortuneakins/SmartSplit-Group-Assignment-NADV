const express = require('express');
const pool = require('../db');

const router = express.Router();

// Bulk-resolve user ids to display info - used by expense/settlement services
// to render names instead of raw UUIDs, without duplicating user data.
router.post('/users/resolve', async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }
    const result = await pool.query('SELECT id, email, full_name FROM users WHERE id = ANY($1::uuid[])', [ids]);
    res.json(result.rows.map((r) => ({ id: r.id, email: r.email, fullName: r.full_name })));
  } catch (err) {
    next(err);
  }
});


// Internal member lookup used by expense/settlement services.
router.get('/groups/:groupId/members', async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1
       ORDER BY gm.joined_at ASC`,
      [groupId]
    );
    res.json(result.rows.map((r) => ({ id: r.id, email: r.email, fullName: r.full_name })));
  } catch (err) {
    next(err);
  }
});


// Internal membership check used by expense/settlement services.
router.get('/groups/:groupId/members/:userId/check', async (req, res, next) => {
  try {
    const { groupId, userId } = req.params;
    const result = await pool.query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );
    res.json({ isMember: result.rows.length > 0 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
