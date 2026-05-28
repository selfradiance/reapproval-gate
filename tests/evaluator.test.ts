import { describe, expect, it } from "vitest";
import { evaluateAction } from "../src/evaluator.js";
import type { ApprovedScope, ProposedAction } from "../src/schemas.js";

const scope: ApprovedScope = {
  scope_id: "scope-demo-001",
  approved_by: "human-local",
  approved_at: "2026-05-28T12:00:00.000Z",
  allowed_actors: ["codex", "claude"],
  allowed_action_types: ["edit_file", "send_email", "pay_invoice", "run_command"],
  allowed_resource_prefixes: [
    "src/**",
    "tests/**",
    "scripts/**",
    "README.md",
    "package.json",
    "invoice:INV-1001",
    "email:draft-001"
  ],
  allowed_recipients: ["teammate@example.com"],
  allowed_domains: ["example.com", "github.com"],
  spend_limit_cents: 5000,
  currency: "USD",
  reapproval_triggers: {
    destructive_operation: true,
    new_recipient: true,
    new_domain: true,
    credential_use: true,
    scope_expansion: true,
    spend_above_limit: true
  },
  default_decision: "deny"
};

const baseAction: ProposedAction = {
  action_id: "action-edit-001",
  actor: "codex",
  action_type: "edit_file",
  resource: "src/index.ts",
  operation: "modify",
  destructive: false,
  uses_credentials: false,
  requests_scope_expansion: false
};

function action(overrides: Partial<ProposedAction>): ProposedAction {
  return { ...baseAction, ...overrides };
}

describe("evaluateAction", () => {
  it("allows an in-scope non-destructive file edit", () => {
    const receipt = evaluateAction(scope, baseAction);

    expect(receipt.decision).toBe("allow");
    expect(receipt.reason).toBe("NO_REAPPROVAL_TRIGGERED");
    expect(receipt.decisive_rule).toBe("default_allow");
  });

  it("denies disallowed action type", () => {
    const receipt = evaluateAction(scope, action({ action_type: "open_browser" }));

    expect(receipt.decision).toBe("deny");
    expect(receipt.reason).toBe("ACTION_TYPE_NOT_ALLOWED");
    expect(receipt.decisive_rule).toBe("action_type_allowed");
  });

  it("denies disallowed actor", () => {
    const receipt = evaluateAction(scope, action({ actor: "unknown-agent" }));

    expect(receipt.decision).toBe("deny");
    expect(receipt.reason).toBe("ACTOR_NOT_ALLOWED");
    expect(receipt.decisive_rule).toBe("actor_allowed");
  });

  it("denies resource outside approved prefixes", () => {
    const receipt = evaluateAction(scope, action({ resource: "secrets/token.txt" }));

    expect(receipt.decision).toBe("deny");
    expect(receipt.reason).toBe("RESOURCE_OUTSIDE_APPROVED_PREFIXES");
    expect(receipt.decisive_rule).toBe("resource_prefix_allowed");
  });

  it("requires reapproval for destructive operation", () => {
    const receipt = evaluateAction(scope, action({ destructive: true, operation: "delete" }));

    expect(receipt.decision).toBe("reapproval_required");
    expect(receipt.reason).toBe("DESTRUCTIVE_OPERATION_REQUIRES_REAPPROVAL");
  });

  it("requires reapproval for spend above limit", () => {
    const receipt = evaluateAction(
      scope,
      action({
        action_type: "pay_invoice",
        resource: "invoice:INV-1001",
        operation: "pay",
        amount_cents: 7500,
        currency: "USD",
        recipient: "teammate@example.com",
        domain: "example.com"
      })
    );

    expect(receipt.decision).toBe("reapproval_required");
    expect(receipt.reason).toBe("SPEND_ABOVE_LIMIT_REQUIRES_REAPPROVAL");
  });

  it("requires reapproval for new recipient", () => {
    const receipt = evaluateAction(
      scope,
      action({
        action_type: "send_email",
        resource: "email:draft-001",
        operation: "send",
        recipient: "newperson@example.com",
        domain: "example.com"
      })
    );

    expect(receipt.decision).toBe("reapproval_required");
    expect(receipt.reason).toBe("NEW_RECIPIENT_REQUIRES_REAPPROVAL");
  });

  it("requires reapproval for new domain", () => {
    const receipt = evaluateAction(
      scope,
      action({
        action_type: "send_email",
        resource: "email:draft-001",
        operation: "send",
        recipient: "teammate@example.com",
        domain: "new.example"
      })
    );

    expect(receipt.decision).toBe("reapproval_required");
    expect(receipt.reason).toBe("NEW_DOMAIN_REQUIRES_REAPPROVAL");
  });

  it("requires reapproval for credential use", () => {
    const receipt = evaluateAction(
      scope,
      action({
        action_type: "run_command",
        resource: "package.json",
        operation: "npm_publish",
        uses_credentials: true
      })
    );

    expect(receipt.decision).toBe("reapproval_required");
    expect(receipt.reason).toBe("CREDENTIAL_USE_REQUIRES_REAPPROVAL");
  });

  it("requires reapproval for scope expansion", () => {
    const receipt = evaluateAction(scope, action({ requests_scope_expansion: true }));

    expect(receipt.decision).toBe("reapproval_required");
    expect(receipt.reason).toBe("SCOPE_EXPANSION_REQUIRES_REAPPROVAL");
  });

  it("keeps fixed rule priority so deny beats reapproval", () => {
    const receipt = evaluateAction(scope, action({ action_type: "open_browser", destructive: true }));

    expect(receipt.decision).toBe("deny");
    expect(receipt.reason).toBe("ACTION_TYPE_NOT_ALLOWED");
    expect(receipt.rule_trace).toHaveLength(1);
  });

  it("keeps the first decisive rule stable", () => {
    const receipt = evaluateAction(
      scope,
      action({
        destructive: true,
        amount_cents: 7500,
        currency: "USD",
        recipient: "newperson@example.com",
        domain: "new.example"
      })
    );

    expect(receipt.decision).toBe("reapproval_required");
    expect(receipt.decisive_rule).toBe("destructive_operation_requires_reapproval");
    expect(receipt.reason).toBe("DESTRUCTIVE_OPERATION_REQUIRES_REAPPROVAL");
  });
});
