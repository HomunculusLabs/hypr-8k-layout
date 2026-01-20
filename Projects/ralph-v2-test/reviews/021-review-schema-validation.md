# Review: Schema Validation (Spec 021)

## Scope
- Files reviewed: src/lib/schemas.ts, src/lib/stats.ts, package.json, bun.lock

## Findings

### Blocking
1. Missing tests for schema validation in compareStats (valid and invalid JSON). There is no coverage for invalid stats file handling or error message quality.

### Non-blocking
- Types are not inferred from schemas (no z.infer usage), so schema/type drift remains possible.
- Error messages rely on Zod's default message string; consider formatting errors for clearer, actionable feedback.

## Checklist Notes
- All JSON.parse calls use schema validation: yes (compareStats).
- Schemas are defined once in src/lib/schemas.ts: yes.
- Edge cases: empty object accepted due to partial schema, null field values rejected, extra keys stripped.

## Approval
Changes requested.
