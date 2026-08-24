/**
 * Settlement Optimisation Engine
 * -----------------------------------------------------------------------
 * Given each member's net balance within a group, produce a small payment
 * plan that settles all outstanding balances.
 *
 * For small groups, the service uses DFS with branch-and-bound to search
 * for the true minimum number of transactions.
 *
 * For larger groups, exhaustive search can become computationally expensive,
 * so the service falls back to a greedy creditor/debtor matching strategy.
 *
 * All calculations are performed in integer cents to avoid floating-point
 * rounding errors when dealing with monetary values.
 */

const CENTS = 100; // work in integer cents to avoid floating point drift
const EXHAUSTIVE_SEARCH_LIMIT = 12;  // maximum members for exact DFS

function toCents(amount) {
  return Math.round(amount * CENTS);
}

function fromCents(cents) {
  return Math.round(cents) / CENTS;
}

/**
 * @param {Record<string, number>} balances userId -> net balance (+ve = owed money, -ve = owes money)
 * @returns {{ payments: {from: string, to: string, amount: number}[], algorithm: string }}
 */
function minimiseTransactions(balances) {
  const entries = Object.entries(balances)
    .map(([id, amt]) => [id, toCents(amt)])
    .filter(([, cents]) => cents !== 0);

  if (entries.length === 0) {
    return { payments: [], algorithm: 'min-transactions' };
  }

  const sum = entries.reduce((s, [, c]) => s + c, 0);
  if (sum !== 0) {
    throw new Error(
      `Balances must net to zero, got ${fromCents(sum)}. This indicates a bug upstream in expense/balance calculation.`
    );
  }

  const components = splitIntoComponents(entries);

  let payments = [];
  let usedFallback = false;

  for (const component of components) {
    if (component.length <= EXHAUSTIVE_SEARCH_LIMIT) {
      payments = payments.concat(exactMinimise(component));
    } else {
      usedFallback = true;
      payments = payments.concat(greedyMinimise(component));
    }
  }

  return {
    payments: payments.map((p) => ({ ...p, amount: fromCents(p.amount) })),
    algorithm: usedFallback ? 'min-transactions+greedy-fallback' : 'min-transactions',
  };
}

/**
 * Returns the balance entries as a single component.
 *
 * The current settlement input contains only net balances, not the
 * underlying expense graph, so true graph-based component detection
 * is not possible here. Keeping this step separate makes it possible
 * to introduce graph-based optimisation later without changing the
 * main algorithm.
 */

function splitIntoComponents(entries) {
  return [entries];
}

/**
 * Exact DFS + branch-and-bound search for the true minimum number of
 * transactions that zeroes out every balance in `entries`.
 */
function exactMinimise(entries) {
  const balances = entries.map(([, cents]) => cents);
  const ids = entries.map(([id]) => id);

  let best = { count: Infinity, payments: [] };

  function dfs(bals, path) {
    // Skip already-settled members
    let i = 0;
    while (i < bals.length && bals[i] === 0) i++;

    if (i === bals.length) {
      if (path.length < best.count) {
        best = { count: path.length, payments: path.slice() };
      }
      return;
    }

    // Prune: current path already at/above the best known solution
    if (path.length >= best.count) return;

    for (let j = i + 1; j < bals.length; j++) {
      if (bals[j] === 0) continue;
      // Only pair opposite signs (one owes, one is owed)
      if ((bals[i] > 0 && bals[j] > 0) || (bals[i] < 0 && bals[j] < 0)) continue;

      const next = bals.slice();
      next[j] = bals[i] + bals[j];
      next[i] = 0;

      // i's entire balance is transferred to j in this hypothesis, so the
      // payment amount is |bals[i]| (not min), and j absorbs whatever
      // remains (which may flip j's sign - that's handled by recursion).
      const amount = Math.abs(bals[i]);
      const [from, to] = bals[i] < 0 ? [ids[i], ids[j]] : [ids[j], ids[i]];

      path.push({ from, to, amount });
      dfs(next, path);
      path.pop();
    }
  }

  dfs(balances, []);
  return best.payments;
}

/**
 * O(n log n) greedy fallback: repeatedly match the largest creditor with
 * the largest debtor. Not guaranteed minimal, but fast and gives a
 * reasonable upper bound for very large single components.
 */
function greedyMinimise(entries) {
  let pool = entries.map(([id, cents]) => ({ id, cents })).filter((e) => e.cents !== 0);
  const payments = [];

  while (pool.length > 1) {
    pool.sort((a, b) => a.cents - b.cents); // most negative (debtor) first, most positive (creditor) last
    const debtor = pool[0];
    const creditor = pool[pool.length - 1];

    const amount = Math.min(-debtor.cents, creditor.cents);
    payments.push({ from: debtor.id, to: creditor.id, amount });

    debtor.cents += amount;
    creditor.cents -= amount;

    pool = pool.filter((e) => e.cents !== 0);
  }

  return payments;
}

module.exports = { minimiseTransactions, toCents, fromCents, EXHAUSTIVE_SEARCH_LIMIT };
