# Review: Type Coercion Fixes (Spec 022)

## Scope
- Files reviewed: src/lib/coerce.ts, src/lib/coerce.test.ts, src/lib/project-health.ts

## Findings

### Blocking
1. Tests do not cover leap-year validation or month boundary cases (30 vs 31 days), which are explicitly required by the review checklist.

### Non-blocking
- coerceDate does not trim input strings; it relies on callers like coerceDateInput to trim. If coerceDate is used directly elsewhere in the future, whitespace-only inputs will be treated as invalid (which may be fine), but tests do not document this behavior.

## Checklist Notes
- coerceBool handles boolean/string/number/null inputs: yes.
- coerceDate validates month/day ranges and rejects impossible dates: yes via explicit range checks + month mismatch guard.
- All === true checks in project-health use coerceBool: yes (grep clean).
- Date parsing in project-health uses coerceDate via coerceDateInput: yes.

## Approval
Changes requested.
