require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const request = require('supertest');
const app = require('../src/index');
const pool = require('../src/db');

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const axios = require('axios');

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

// Single, file-level teardown. This runs once, after every describe block below
// has finished, so the pg pool stays open for the whole test file instead of
// being closed after the first describe block's tests complete.
afterAll(async () => {
  await pool.end();
});

describe('Expense Service - integration (requires user-service running)', () => {
  let skip = false;

  beforeAll(async () => {
    try {
      await axios.get(`${USER_SERVICE_URL}/health`);
    } catch (e) {
      skip = true;
      console.warn('user-service not reachable - skipping expense-service integration tests');
    }
  });

  test('creates an equal-split expense and lists it back', async () => {
    if (skip) return;
    const alice = await registerAndGroup('exp-alice');
    const bob = await registerAndGroup('exp-bob'); // separate account, invited below
    await addMember(alice.token, alice.group.id, bob.user.email);

    const createRes = await request(app)
      .post(`/api/groups/${alice.group.id}/expenses`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ description: 'Groceries', amount: 50, splitType: 'equal', memberIds: [alice.user.id, bob.user.id] });

    expect(createRes.status).toBe(201);
    expect(createRes.body.splits).toHaveLength(2);
    expect(createRes.body.splits.every((s) => s.amountOwed === 25)).toBe(true);

    const listRes = await request(app)
      .get(`/api/groups/${alice.group.id}/expenses`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBeGreaterThanOrEqual(1);
  });

  test('rejects an expense from someone who is not a group member', async () => {
    if (skip) return;
    const alice = await registerAndGroup('exp-alice2');
    const outsider = await registerAndGroup('exp-outsider');

    const res = await request(app)
      .post(`/api/groups/${alice.group.id}/expenses`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ description: 'Snacks', amount: 20, splitType: 'equal', memberIds: [alice.user.id] });

    expect(res.status).toBe(403);
  });

  test('rejects a malformed exact split that does not sum to the total', async () => {
    if (skip) return;
    const alice = await registerAndGroup('exp-alice3');

    const res = await request(app)
      .post(`/api/groups/${alice.group.id}/expenses`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ description: 'Bad split', amount: 100, splitType: 'exact', splitInput: { [alice.user.id]: 40 } });

    expect(res.status).toBe(400);
  });

  test('rejects a missing amount', async () => {
    if (skip) return;
    const alice = await registerAndGroup('exp-alice4');
    const res = await request(app)
      .post(`/api/groups/${alice.group.id}/expenses`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ description: 'No amount', splitType: 'equal', memberIds: [alice.user.id] });
    expect(res.status).toBe(400);
  });

  test('internal net-balances endpoint reflects paid vs owed correctly', async () => {
    if (skip) return;
    const alice = await registerAndGroup('exp-alice5');
    const bob = await registerAndGroup('exp-bob5');
    await addMember(alice.token, alice.group.id, bob.user.email);

    await request(app)
      .post(`/api/groups/${alice.group.id}/expenses`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ description: 'Dinner', amount: 100, splitType: 'equal', memberIds: [alice.user.id, bob.user.id] });

    const balRes = await request(app).get(`/api/internal/groups/${alice.group.id}/net-balances`);
    expect(balRes.status).toBe(200);
    expect(balRes.body[alice.user.id]).toBe(50); // paid 100, owes 50
    expect(balRes.body[bob.user.id]).toBe(-50); // paid 0, owes 50
  });
});

// CRUD + validation regression coverage added for the final demonstration rubric.
describe('Expense CRUD and participant validation', () => {
  let skip = false;

  beforeAll(async () => {
    try { await axios.get(`${USER_SERVICE_URL}/health`); }
    catch (e) { skip = true; }
  });

  test('rejects split participants who are not group members', async () => {
    if (skip) return;
    const alice = await registerAndGroup('crud-alice');
    const outsider = await registerAndGroup('crud-outsider');
    const res = await request(app)
      .post(`/api/groups/${alice.group.id}/expenses`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ description: 'Invalid participant', amount: 100, splitType: 'equal', memberIds: [alice.user.id, outsider.user.id] });
    expect(res.status).toBe(400);
  });

  test('updates and deletes an expense', async () => {
    if (skip) return;
    const alice = await registerAndGroup('crud-owner');
    const bob = await registerAndGroup('crud-bob');
    await addMember(alice.token, alice.group.id, bob.user.email);

    const created = await request(app)
      .post(`/api/groups/${alice.group.id}/expenses`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ description: 'Original', amount: 100, splitType: 'equal', memberIds: [alice.user.id, bob.user.id] });
    expect(created.status).toBe(201);

    const updated = await request(app)
      .put(`/api/groups/${alice.group.id}/expenses/${created.body.id}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ description: 'Updated', amount: 120, splitType: 'exact', paidBy: bob.user.id, memberIds: [alice.user.id, bob.user.id], splitInput: { [alice.user.id]: 80, [bob.user.id]: 40 } });
    expect(updated.status).toBe(200);
    expect(updated.body.description).toBe('Updated');
    expect(Number(updated.body.amount)).toBe(120);

    const deleted = await request(app)
      .delete(`/api/groups/${alice.group.id}/expenses/${created.body.id}`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(deleted.status).toBe(204);

    const list = await request(app)
      .get(`/api/groups/${alice.group.id}/expenses`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(list.body.some((e) => e.id === created.body.id)).toBe(false);
  });
});