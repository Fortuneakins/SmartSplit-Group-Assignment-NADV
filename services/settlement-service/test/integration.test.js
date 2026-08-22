require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const request = require('supertest');
const axios = require('axios');
const app = require('../src/index');
const pool = require('../src/db');

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const EXPENSE_SERVICE_URL = process.env.EXPENSE_SERVICE_URL || 'http://localhost:3002';

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@spu.ac.za`;
}

async function registerAndGroup(prefix) {
  const email = uniqueEmail(prefix);
  const reg = await axios.post(`${USER_SERVICE_URL}/api/auth/register`, {
    email,
    password: 'password123',
    fullName: `${prefix} User`,
  });
  const user = reg.data.user;
  const token = reg.data.token;
  const groupRes = await axios.post(
    `${USER_SERVICE_URL}/api/groups`,
    { name: `${prefix} group` },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return { user, token, group: groupRes.data };
}

async function addMember(ownerToken, groupId, email) {
  await axios.post(
    `${USER_SERVICE_URL}/api/groups/${groupId}/members`,
    { email },
    { headers: { Authorization: `Bearer ${ownerToken}` } }
  );
}

async function logExpense(token, groupId, body) {
  await axios.post(`${EXPENSE_SERVICE_URL}/api/groups/${groupId}/expenses`, body, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe('Settlement Service - integration (requires user-service + expense-service running)', () => {
  let skip = false;

  beforeAll(async () => {
    try {
      await axios.get(`${USER_SERVICE_URL}/health`);
      await axios.get(`${EXPENSE_SERVICE_URL}/health`);
    } catch (e) {
      skip = true;
      console.warn('upstream services not reachable - skipping settlement-service integration tests');
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  test('reproduces the classic 3-cycle: everyone nets to zero, settlement needs 0 payments', async () => {
    if (skip) return;
    const a = await registerAndGroup('cyc-a');
    const b = await registerAndGroup('cyc-b');
    const c = await registerAndGroup('cyc-c');
    await addMember(a.token, a.group.id, b.user.email);
    await addMember(a.token, a.group.id, c.user.email);

    // A owes B 100, B owes C 100, C owes A 100 -> pay via expenses so everyone paid + owes equally.
    // Use amounts divisible by 3 so the equal split has no rounding remainder to keep this test clean.
    await logExpense(a.token, a.group.id, {
      description: 'A pays',
      amount: 300,
      splitType: 'equal',
      memberIds: [a.user.id, b.user.id, c.user.id],
    });
    await logExpense(b.token, a.group.id, {
      description: 'B pays',
      amount: 300,
      splitType: 'equal',
      memberIds: [a.user.id, b.user.id, c.user.id],
    });
    await logExpense(c.token, a.group.id, {
      description: 'C pays',
      amount: 300,
      splitType: 'equal',
      memberIds: [a.user.id, b.user.id, c.user.id],
    });

    const balRes = await request(app).get(`/api/groups/${a.group.id}/balances`).set('Authorization', `Bearer ${a.token}`);
    expect(balRes.status).toBe(200);
    balRes.body.forEach((b) => expect(b.balance).toBe(0));

    const settleRes = await request(app)
      .post(`/api/groups/${a.group.id}/settle`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(settleRes.status).toBe(201);
    expect(settleRes.body.payments).toHaveLength(0);
  });

  test('finds the minimum payment count for an uneven group', async () => {
    if (skip) return;
    const a = await registerAndGroup('unev-a');
    const b = await registerAndGroup('unev-b');
    const c = await registerAndGroup('unev-c');
    await addMember(a.token, a.group.id, b.user.email);
    await addMember(a.token, a.group.id, c.user.email);

    // A pays 300 for accommodation split equally -> everyone owes 100
    await logExpense(a.token, a.group.id, {
      description: 'Accommodation',
      amount: 300,
      splitType: 'equal',
      memberIds: [a.user.id, b.user.id, c.user.id],
    });
    // Net: A +200, B -100, C -100 -> optimal settlement is exactly 2 payments.
    // The specific pairing isn't unique (both may pay A directly, or one may pay
    // the other who then pays A) - what matters is it's minimal and replays correctly.
    const settleRes = await request(app)
      .post(`/api/groups/${a.group.id}/settle`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(settleRes.status).toBe(201);
    expect(settleRes.body.payments).toHaveLength(2);

    const net = { [a.user.id]: 0, [b.user.id]: 0, [c.user.id]: 0 };
    settleRes.body.payments.forEach((p) => {
      net[p.from] -= p.amount;
      net[p.to] += p.amount;
    });
    expect(net[a.user.id]).toBeCloseTo(200, 2);
    expect(net[b.user.id]).toBeCloseTo(-100, 2);
    expect(net[c.user.id]).toBeCloseTo(-100, 2);

    // Retrieve the persisted settlement by id
    const getRes = await request(app)
      .get(`/api/groups/${a.group.id}/settlements/${settleRes.body.id}`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.payments).toHaveLength(2);
  });

  test('rejects balance/settle requests from non-members', async () => {
    if (skip) return;
    const a = await registerAndGroup('priv-a');
    const outsider = await registerAndGroup('priv-outsider');

    const balRes = await request(app)
      .get(`/api/groups/${a.group.id}/balances`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(balRes.status).toBe(403);

    const settleRes = await request(app)
      .post(`/api/groups/${a.group.id}/settle`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(settleRes.status).toBe(403);
  });

  test('404s for a settlement id that does not exist', async () => {
    if (skip) return;
    const a = await registerAndGroup('missing-a');
    const res = await request(app)
      .get(`/api/groups/${a.group.id}/settlements/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${a.token}`);
    expect(res.status).toBe(404);
  });
});
