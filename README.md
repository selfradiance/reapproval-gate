# reapproval-gate

A local deterministic CLI evaluates a proposed agent action against a human-approved scope and returns `allow`, `deny`, or `reapproval_required` before execution.

## Why This Exists

Agents are moving from answering to acting. Once an agent proposes an action, a human may need to approve more than the original task:

- allowed actions
- spend limits
- destructive operations
- new recipients
- new domains
- new file roots
- credential use
- human override

`reapproval-gate` focuses only on the question: does this proposed action cross a declared threshold that requires fresh human reapproval?

## What It Does

- Reads an approved scope JSON file.
- Reads a proposed action JSON file.
- Validates both files with Zod.
- Evaluates deterministic rules in a fixed order.
- Prints a readable terminal report.
- Optionally writes a stable pretty JSON receipt.
- Exits `0` for completed evaluations, including `deny` and `reapproval_required`.
- Exits `1` for unreadable files, invalid JSON, schema errors, or unsafe `--json-out` paths.

## Decision Meanings

- `allow` means no configured deny or reapproval rule fired for the declared JSON intent. It does not mean the action is safe.
- `deny` means the proposed action is outside the approved action type, actor, or resource prefixes.
- `reapproval_required` means the proposed action crossed a configured threshold and should receive fresh human review before proceeding.

The tool does not verify signatures, approval freshness, or human identity. It evaluates the declared JSON fields only.

## What It Does Not Do

- It does not execute the proposed action.
- It does not enforce runtime behavior.
- It does not make product network calls.
- It does not use an LLM in the critical path.
- It does not verify human identity.
- It does not prevent an agent from ignoring the result.
- It is not an authorization framework, policy engine, dashboard, web server, MCP integration, or AgentGate integration.

## Quick Start

```sh
npm install
npm test
npm run typecheck
npm run build
npm run demo:allow
npm run demo:destructive
npm run demo:spend
npm run demo:deny
```

Run the CLI directly:

```sh
npm run evaluate -- --scope fixtures/scope.demo.json --action fixtures/action.allow.edit-file.json --json-out .reapproval-gate/allow-receipt.json
```

## Example Terminal Output

```text
Reapproval Gate Report

Decision: REAPPROVAL_REQUIRED
Reason: DESTRUCTIVE_OPERATION_REQUIRES_REAPPROVAL

Scope: scope-demo-001
Action: action-delete-001
Actor: codex
Action type: edit_file
Resource: src/old.ts

Decisive rule:
- destructive_operation_requires_reapproval: Destructive operation requires fresh human reapproval.

Rule trace:
✓ action_type_allowed
✓ actor_allowed
✓ resource_prefix_allowed
✗ destructive_operation_requires_reapproval
```

## Example JSON Receipt

```json
{
  "decision": "reapproval_required",
  "reason": "DESTRUCTIVE_OPERATION_REQUIRES_REAPPROVAL",
  "decisive_rule": "destructive_operation_requires_reapproval",
  "scope_id": "scope-demo-001",
  "action_id": "action-delete-001",
  "actor": "codex",
  "action_type": "edit_file",
  "resource": "src/old.ts",
  "rule_trace": [
    {
      "rule": "action_type_allowed",
      "passed": true,
      "message": "Action type is allowed by approved scope."
    },
    {
      "rule": "actor_allowed",
      "passed": true,
      "message": "Actor is allowed by approved scope."
    },
    {
      "rule": "resource_prefix_allowed",
      "passed": true,
      "message": "Resource is inside approved resource prefixes."
    },
    {
      "rule": "destructive_operation_requires_reapproval",
      "passed": false,
      "decision": "reapproval_required",
      "message": "Destructive operation requires fresh human reapproval."
    }
  ],
  "normalized_action": {
    "action_id": "action-delete-001",
    "actor": "codex",
    "action_type": "edit_file",
    "resource": "src/old.ts",
    "operation": "delete",
    "destructive": true,
    "uses_credentials": false,
    "requests_scope_expansion": false
  }
}
```

## Scope Boundaries

The evaluator checks only declared JSON intent before execution. Resource matching is string-based and does not touch the filesystem.

Resource prefix matching supports:

- exact matches, such as `README.md`
- simple prefix globs ending in `/**`, such as `src/**`

The evaluator rejects obvious path traversal, absolute Unix paths, absolute Windows paths, and empty resources as outside scope.

Schemas are strict: unknown fields are rejected. Spend actions with `amount_cents` must also declare `currency`. The evaluator does not convert currencies; if declared spend currency is missing or differs from the scope currency, that spend requires reapproval when spend reapproval is enabled.

Receipts echo selected fields from the supplied action intent, including identifiers, resource strings, recipient/domain values when provided, and whether credential use was declared. Do not put secrets in action intent JSON if they should not appear in receipts.

Rule priority is fixed:

1. malformed input or schema errors produce a CLI error
2. disallowed action type denies
3. disallowed actor denies
4. resource outside approved prefixes denies
5. destructive operation may require reapproval
6. spend currency mismatch may require reapproval
7. spend above limit may require reapproval
8. new recipient may require reapproval
9. new domain may require reapproval
10. credential use may require reapproval
11. scope expansion may require reapproval
12. otherwise allow

The first decisive rule wins. The receipt includes the ordered rule trace that was evaluated up to that decision.

## Relationship To Nearby AgentGate Ecosystem Repos

These projects are related, but this repository does not integrate with them:

- ActionProof checks whether a proposed side-effecting JSON intent fits local policy.
- ActionWarrant checks whether a signed warrant is real, fresh, and scoped to the action.
- agent-intent-ledger compares human intent, agent plan, and proposed action for drift.
- reapproval-gate specifically asks whether a proposed action crosses thresholds that require fresh human reapproval.
- AgentGate handles after-action identity, bonds, execution record, verification, and settlement.
- MCP Firewall mediates selected MCP tool calls at runtime.

## Honest Status

`reapproval-gate` is a v0.1.0 local proof. It demonstrates deterministic before-execution evaluation and receipt generation for a narrow set of reapproval thresholds. It is not release-tagged yet.
