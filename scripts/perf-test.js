/**
 * Performance & scalability test (rubric Q4 requirement).
 *
 * Simulates a group with many members and expenses, logs them through the
 * real HTTP API (gateway -> services -> Postgres), then measures how long
 * balance calculation and settlement optimisation take end-to-end.
 *
 * Usage:
 *   node scripts/perf-test.js [members] [expenses]
 *   node scripts/perf-test.js 50 500
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');

const GATEWAY_URL = `http://localhost:${process.env.GATEWAY_PORT || 3000}`;

const MEMBER_COUNT = parseInt(process.argv[2], 10) || 50;
const EXPENSE_COUNT = parseInt(process.argv[3], 10) || 500;

function randomAmount() {
  return Math.round((Math.random() * 200 + 5) * 100) / 100;
}

async function registerUser(i) {
  const email = `perf-${Date.now()}-${i}@spu.ac.za`;
  const res = await axios.post(`${GATEWAY_URL}/api/auth/register`, {
    email,
    password: 'password123',
    fullName: `Perf User ${i}`,
  });
  return { token: res.data.token, id: res.data.user.id, email };
}

async function main() {
  console.log(`SmartSplit performance test: ${MEMBER_COUNT} members, ${EXPENSE_COUNT} expenses\n`);

  console.time('1. Register members');
  const users = [];
  for (let i = 0; i < MEMBER_COUNT; i++) {
    users.push(await registerUser(i));
  }
  console.timeEnd('1. Register members');

  console.time('2. Create group + add members');
  const groupRes = await axios.post(
    `${GATEWAY_URL}/api/groups`,
    { name: `Perf Test Group (${MEMBER_COUNT} members)` },
    { headers: { Authorization: `Bearer ${users[0].token}` } }
  );
  const groupId = groupRes.data.id;
  for (let i = 1; i < users.length; i++) {
    await axios.post(
      `${GATEWAY_URL}/api/groups/${groupId}/members`,
      { email: users[i].email },
      { headers: { Authorization: `Bearer ${users[0].token}` } }
    );
  }
  console.timeEnd('2. Create group + add members');

  console.time('3. Log expenses');
  for (let i = 0; i < EXPENSE_COUNT; i++) {
    const payer = users[Math.floor(Math.random() * users.length)];
    // Random subset of the group shares each expense, to make balances genuinely tangled
    const subsetSize = Math.max(2, Math.floor(Math.random() * users.length));
    const shuffled = [...users].sort(() => Math.random() - 0.5).slice(0, subsetSize);
    const memberIds = shuffled.map((u) => u.id);

    await axios.post(
      `${GATEWAY_URL}/api/groups/${groupId}/expenses`,
      { description: `Expense #${i}`, amount: randomAmount(), splitType: 'equal', memberIds },
      { headers: { Authorization: `Bearer ${payer.token}` } }
    );
  }
  console.timeEnd('3. Log expenses');

  console.time('4. Fetch balances');
  const balRes = await axios.get(`${GATEWAY_URL}/api/groups/${groupId}/balances`, {
    headers: { Authorization: `Bearer ${users[0].token}` },
  });
  console.timeEnd('4. Fetch balances');

  console.time('5. Run settlement optimisation');
  const settleRes = await axios.post(
    `${GATEWAY_URL}/api/groups/${groupId}/settle`,
    {},
    { headers: { Authorization: `Bearer ${users[0].token}` } }
  );
  console.timeEnd('5. Run settlement optimisation');

  console.log(`\nMembers with non-zero balance: ${balRes.data.filter((b) => b.balance !== 0).length}`);
  console.log(`Algorithm used: ${settleRes.data.algorithm}`);
  console.log(`Payments produced: ${settleRes.data.total_payments}`);
  console.log(`(Naive "everyone pays everyone" upper bound would be up to ${users.length - 1} payments per person)`);
}

main().catch((err) => {
  console.error('Performance test failed:', err.response?.data || err.message);
  process.exit(1);
});
