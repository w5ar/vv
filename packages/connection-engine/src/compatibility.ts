import type { ConnectionRule, Id } from '@fds/domain';

export type CompatibilityVerdict =
  | { compatible: true; rule: ConnectionRule }
  | { compatible: false; reason: 'denied'; rule: ConnectionRule }
  | { compatible: false; reason: 'no-rule' };

function matches(rule: ConnectionRule, a: Id, b: Id): boolean {
  const [x, y] = rule.portTypes;
  return (x === a && y === b) || (x === b && y === a);
}

/**
 * Decides compatibility of two port types from declared rules only.
 * A `deny` rule always wins; otherwise an `allow` rule is required.
 * Rules with review status `rejected` are ignored.
 */
export function checkPortTypeCompatibility(rules: readonly ConnectionRule[], a: Id, b: Id): CompatibilityVerdict {
  let allow: ConnectionRule | undefined;
  for (const rule of rules) {
    if (rule.review.status === 'rejected' || !matches(rule, a, b)) continue;
    if (rule.effect === 'deny') return { compatible: false, reason: 'denied', rule };
    allow ??= rule;
  }
  return allow ? { compatible: true, rule: allow } : { compatible: false, reason: 'no-rule' };
}

/** All port types that may connect to `type` according to declared allow rules. */
export function compatiblePortTypes(rules: readonly ConnectionRule[], type: Id): Id[] {
  const out = new Set<Id>();
  for (const rule of rules) {
    if (rule.effect !== 'allow' || rule.review.status === 'rejected') continue;
    const [x, y] = rule.portTypes;
    if (x === type) out.add(y);
    if (y === type) out.add(x);
  }
  return [...out].filter((t) => checkPortTypeCompatibility(rules, type, t).compatible);
}
