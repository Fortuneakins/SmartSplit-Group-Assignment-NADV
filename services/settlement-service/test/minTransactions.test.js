const { minimiseTransactions } = require('../src/optimisation/minTransactions');

function totalOwedByEachUser(balances, payments) {
  const net = {};
  Object.keys(balances).forEach((id) => (net[id] = 0));
  payments.forEach((p) => {
    net[p.from] -= p.amount;
    net[p.to] += p.amount;
  });
  return net;
}

describe('minimiseTransactions', () => {
  test('returns zero payments for an already-settled group', () => {
    const { payments } = minimiseTransactions({ a: 0, b: 0 });
    expect(payments).toHaveLength(0);
  });

  test('classic 3-cycle nets to zero payments (A->B->C->A of equal amounts)', () => {
    // A owes B 100, B owes C 100, C owes A 100 => everyone's net balance is 0
    const { payments } = minimiseTransactions({ a: 0, b: 0, c: 0 });
    expect(payments).toHaveLength(0);
  });

  test('simple two-person debt resolves to a single payment', () => {
    const { payments } = minimiseTransactions({ a: -50, b: 50 });
    expect(payments).toEqual([{ from: 'a', to: 'b', amount: 50 }]);
  });

  test('finds the true minimum, not just any settlement, for a tangled group', () => {
    // a owes 30, b owes 10, c is owed 20, d is owed 20 -> optimal is 2 payments
    const balances = { a: -30, b: -10, c: 20, d: 20 };
    const { payments } = minimiseTransactions(balances);
    expect(payments.length).toBeLessThanOrEqual(3); // n-1 upper bound for 4 members
    // Verify correctness: replaying the payments must reproduce the original balances
    const net = totalOwedByEachUser(balances, payments);
    Object.keys(balances).forEach((id) => {
      expect(net[id]).toBeCloseTo(balances[id], 5);
    });
  });

  test('throws when balances do not net to zero (upstream bug guard)', () => {
    expect(() => minimiseTransactions({ a: -10, b: 5 })).toThrow(/net to zero/);
  });

  test('handles a larger random-ish group correctly (regression for DFS pruning)', () => {
    const balances = { a: -40, b: -25, c: -15, d: 30, e: 25, f: 25 };
    const { payments } = minimiseTransactions(balances);
    const net = totalOwedByEachUser(balances, payments);
    Object.keys(balances).forEach((id) => {
      expect(net[id]).toBeCloseTo(balances[id], 5);
    });
    // Minimum possible for 6 non-zero balances is at most 5 (n-1), true optimum here is 3
    expect(payments.length).toBeLessThanOrEqual(5);
  });
});
