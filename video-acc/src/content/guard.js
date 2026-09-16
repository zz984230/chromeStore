// src/content/guard.js — 守速熔断：短窗内恢复次数超阈值即停手，直到用户手动调档复位或熔断窗口滑过
export function createTripWatch({ windowMs = 800, ceiling = 8, now = Date.now, onTrip } = {}) {
  const ledger = new WeakMap(); // key → { count, since, tripped }
  return {
    allows(key) {
      const t = now();
      let rec = ledger.get(key);
      if (!rec || t - rec.since > windowMs) {
        ledger.set(key, { count: 1, since: t, tripped: false });
        return true;
      }
      rec.count += 1;
      if (rec.count > ceiling) {
        if (!rec.tripped) { rec.tripped = true; onTrip?.(key); }
        return false;
      }
      return true;
    },
    reset(key) { ledger.delete(key); },
  };
}
