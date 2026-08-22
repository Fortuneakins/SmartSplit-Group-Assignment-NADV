const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// --- Create a group (creator is automatically the first member) ---
router.post('/', requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'group name is required' });
    }

    await client.query('BEGIN');
    const groupResult = await client.query(
      'INSERT INTO groups (name, created_by) VALUES ($1, $2) RETURNING id, name, created_by, created_at',
      [name.trim(), req.userId]
    );
    const group = groupResult.rows[0];

    await client.query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [group.id, req.userId]);
    await client.query('COMMIT');

    res.status(201).json(group);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// --- List groups the current user belongs to ---
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT g.id, g.name, g.created_by, g.created_at
       FROM groups g
       JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = $1
       ORDER BY g.created_at DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// --- Add a member to a group ---
router.post('/:id/members', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    const membership = await pool.query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [
      id,
      req.userId,
    ]);
    if (membership.rows.length === 0) {
      return res.status(403).json({ error: 'you are not a member of this group' });
    }

    const userResult = await pool.query('SELECT id, email, full_name FROM users WHERE email = $1', [
      email.toLowerCase(),
    ]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'no user found with that email' });
    }
    const newMember = userResult.rows[0];

    await pool.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, newMember.id]
    );

    res.status(201).json({ groupId: id, member: { id: newMember.id, email: newMember.email, fullName: newMember.full_name } });
  } catch (err) {
    next(err);
  }
});

// --- List members of a group (used by the UI and by other services) ---
router.get('/:id/members', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const membership = await pool.query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [
      id,
      req.userId,
    ]);
    if (membership.rows.length === 0) {
      return res.status(403).json({ error: 'you are not a member of this group' });
    }

    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1`,
      [id]
    );
    res.json(result.rows.map((r) => ({ id: r.id, email: r.email, fullName: r.full_name })));
  } catch (err) {
    next(err);
  }
});

// --- Internal endpoint: is `userId` a member of `groupId`? Used by expense/settlement services. ---
router.get('/:id/members/:userId/check', async (req, res, next) => {
  try {
    const { id, userId } = req.params;
    const result = await pool.query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [id, userId]);
    res.json({ isMember: result.rows.length > 0 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
