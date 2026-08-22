const { computeSplits } = require('../src/routes/expenses');

describe('computeSplits', () => {
  test('equal split divides evenly and sums back to the total', () => {
    const splits = computeSplits(90, 'equal', ['a', 'b', 'c'], null);
    expect(splits).toHaveLength(3);
    const total = splits.reduce((s, x) => s + x.amountOwed, 0);
    expect(total).toBeCloseTo(90, 2);
  });

  test('equal split with a remainder assigns the leftover cent to the last member', () => {
    const splits = computeSplits(10, 'equal', ['a', 'b', 'c'], null);
    const total = Math.round(splits.reduce((s, x) => s + x.amountOwed, 0) * 100) / 100;
    expect(total).toBe(10);
  });

  test('equal split never produces a negative share, even with many members and a small amount (regression)', () => {
    const members = Array.from({ length: 50 }, (_, i) => `user-${i}`);
    const splits = computeSplits(5.05, 'equal', members, null);
    splits.forEach((s) => expect(s.amountOwed).toBeGreaterThanOrEqual(0));
    const total = Math.round(splits.reduce((s, x) => s + x.amountOwed, 0) * 100) / 100;
    expect(total).toBe(5.05);
  });

  test('equal split distributes remainder cents evenly, not all on one member (regression)', () => {
    const splits = computeSplits(100, 'equal', ['a', 'b', 'c'], null);
    // 100 / 3 = 33.33 each with 1 cent left over -> one member gets 33.34, not one member absorbing a big remainder
    const amounts = splits.map((s) => s.amountOwed).sort();
    expect(amounts[0]).toBeCloseTo(33.33, 2);
    expect(amounts[2]).toBeCloseTo(33.34, 2);
    expect(amounts[2] - amounts[0]).toBeLessThanOrEqual(0.0100001);
  });

  test('exact split accepts amounts that sum to the total', () => {
    const splits = computeSplits(100, 'exact', null, { a: 60, b: 40 });
    expect(splits).toEqual(
      expect.arrayContaining([
        { userId: 'a', amountOwed: 60 },
        { userId: 'b', amountOwed: 40 },
      ])
    );
  });

  test('exact split rejects amounts that do not sum to the total', () => {
    expect(() => computeSplits(100, 'exact', null, { a: 60, b: 30 })).toThrow(/must sum/);
  });

  test('percentage split converts percentages to amounts', () => {
    const splits = computeSplits(200, 'percentage', null, { a: 25, b: 75 });
    expect(splits.find((s) => s.userId === 'a').amountOwed).toBe(50);
    expect(splits.find((s) => s.userId === 'b').amountOwed).toBe(150);
  });

  test('percentage split rejects percentages that do not sum to 100', () => {
    expect(() => computeSplits(200, 'percentage', null, { a: 25, b: 50 })).toThrow(/sum to 100/);
  });

  test('rejects an unknown split type', () => {
    expect(() => computeSplits(100, 'weird', ['a'], null)).toThrow(/unknown split_type/);
  });

  test('equal split requires at least one member', () => {
    expect(() => computeSplits(100, 'equal', [], null)).toThrow(/memberIds is required/);
  });
});

test('percentage split reconciles cents exactly so settlement balances still net to zero', () => {
  const splits = computeSplits(1, 'percentage', ['a', 'b', 'c'], { a: 33.33, b: 33.33, c: 33.34 });
  const total = splits.reduce((sum, s) => sum + s.amountOwed, 0);
  expect(Math.round(total * 100) / 100).toBe(1);
});
