/**
 * splitLogic.js
 * -----------------------------------------------------------------------
 * Pure, framework-free business logic for expense splitting.
 *
 * Deliberately has NO dependency on Express, the database, or any other
 * service - every function here takes plain values in and returns plain
 * values (or throws a plain Error with `.status`/`.expose` set). This is
 * what makes it trivial to unit-test in isolation (see
 * test/splitLogic.test.js) without a running server or a database, and
 * keeps routes/expenses.js focused purely on HTTP + persistence concerns.
 */

/** Build a 400 error that the shared error-handler middleware knows to expose to the client. */
function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

/**
 * Confirms that every user selected to participate in an expense split is
 * actually a member of the group (and that the caller hasn't duplicated a
 * member). Throws a 400 badRequest on any violation.
 *
 * @param {string[]} memberIds - the userIds selected to share this expense
 * @param {string[]} groupMemberIds - the full membership list of the group
 */
function ensureSplitMembersAreInGroup(memberIds, groupMemberIds) {
  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    throw badRequest('memberIds must contain at least one group member');
  }

  const unique = [...new Set(memberIds)];
  if (unique.length !== memberIds.length) {
    throw badRequest('memberIds must not contain duplicates');
  }

  const allowed = new Set(groupMemberIds);
  const invalid = unique.filter((id) => !allowed.has(id));
  if (invalid.length) {
    throw badRequest('all expense participants must already be members of this group');
  }
}

/**
 * Computes each member's owed amount for a given split.
 * - equal: amount is split evenly across memberIds; any leftover cent(s)
 *   from integer division are distributed one-per-member (not dumped on
 *   a single member) so no one is ever over- or under-charged unfairly.
 * - exact: caller supplies exact per-user amounts, must sum to amount.
 * - percentage: caller supplies percentages, must sum to 100; the final
 *   cent(s) are reconciled using the largest-remainder method so stored
 *   shares always sum exactly to the expense (see comment inline below).
 *
 * All amounts are handled in integer cents internally to avoid binary
 * floating-point drift (e.g. 0.1 + 0.2 !== 0.3) silently breaking the
 * invariant that split shares must sum exactly to the expense total.
 *
 * @param {number} amount - the total expense amount, already normalised to 2dp
 * @param {'equal'|'exact'|'percentage'} splitType
 * @param {string[]|null} memberIds - required for 'equal'
 * @param {Record<string, number>|null} splitInput - required for 'exact'/'percentage'
 * @returns {{userId: string, amountOwed: number}[]}
 */
function computeSplits(amount, splitType, memberIds, splitInput) {
  const round2 = (n) => Math.round(n * 100) / 100;

  if (splitType === 'equal') {
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      throw badRequest('memberIds is required for an equal split');
    }
    const totalCents = Math.round(amount * 100);
    const n = memberIds.length;
    const baseCents = Math.floor(totalCents / n);
    const remainderCents = totalCents - baseCents * n;

    return memberIds.map((userId, idx) => ({
      userId,
      amountOwed: (baseCents + (idx < remainderCents ? 1 : 0)) / 100,
    }));
  }

  if (splitType === 'exact') {
    if (!splitInput || typeof splitInput !== 'object' || Array.isArray(splitInput)) {
      throw badRequest('splitInput (userId -> amount) is required for an exact split');
    }
    const splits = Object.entries(splitInput).map(([userId, raw]) => {
      const amountOwed = Number(raw);
      if (!Number.isFinite(amountOwed) || amountOwed < 0) throw badRequest('exact split amounts must be non-negative numbers');
      return { userId, amountOwed: round2(amountOwed) };
    });
    const total = round2(splits.reduce((s, x) => s + x.amountOwed, 0));
    if (Math.abs(total - amount) > 0.001) {
      throw badRequest(`exact split amounts (${total}) must sum to the expense total (${amount})`);
    }
    return splits;
  }

  if (splitType === 'percentage') {
    if (!splitInput || typeof splitInput !== 'object' || Array.isArray(splitInput)) {
      throw badRequest('splitInput (userId -> percentage) is required for a percentage split');
    }

    const entries = Object.entries(splitInput).map(([userId, raw]) => {
      const pct = Number(raw);
      if (!Number.isFinite(pct) || pct < 0) throw badRequest('percentages must be non-negative numbers');
      return { userId, pct };
    });
    const totalPct = round2(entries.reduce((s, x) => s + x.pct, 0));
    if (Math.abs(totalPct - 100) > 0.001) {
      throw badRequest(`percentages must sum to 100, got ${totalPct}`);
    }

    // Work in cents and reconcile the final share. This prevents a legitimate
    // percentage split such as 33.33/33.33/33.34 of R1.00 from becoming
    // R0.99 after per-member rounding and later breaking settlement.
    const totalCents = Math.round(amount * 100);
    const rawShares = entries.map((entry) => ({
      ...entry,
      exactCents: (entry.pct / 100) * totalCents,
    }));
    const floors = rawShares.map((x) => Math.floor(x.exactCents));
    let assigned = floors.reduce((s, x) => s + x, 0);
    let remainder = totalCents - assigned;

    // Largest remainder method: distribute leftover cents to the largest
    // fractional parts so the result is deterministic and fair.
    const order = rawShares
      .map((x, idx) => ({ idx, fraction: x.exactCents - floors[idx] }))
      .sort((a, b) => b.fraction - a.fraction || a.idx - b.idx);
    for (const item of order) {
      if (remainder <= 0) break;
      floors[item.idx] += 1;
      assigned += 1;
      remainder -= 1;
    }

    return rawShares.map((entry, idx) => ({ userId: entry.userId, amountOwed: floors[idx] / 100 }));
  }

  throw badRequest(`unknown split_type "${splitType}", expected equal | exact | percentage`);
}

module.exports = { computeSplits, ensureSplitMembersAreInGroup, badRequest };
