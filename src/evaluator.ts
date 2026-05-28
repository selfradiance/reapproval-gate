import { matchAllowedResource } from "./match.js";
import type { ApprovedScope, ProposedAction } from "./schemas.js";
import type { Decision, ReasonCode, Receipt, RuleName, RuleTraceEntry } from "./types.js";

interface DecisiveRule {
  decision: Decision;
  reason: ReasonCode;
  rule: RuleName;
}

function addTrace(
  trace: RuleTraceEntry[],
  entry: RuleTraceEntry,
  decisive?: DecisiveRule
): DecisiveRule | undefined {
  trace.push(entry);
  return decisive;
}

function decisiveTrace(
  rule: RuleName,
  decision: Decision,
  reason: ReasonCode,
  message: string
): RuleTraceEntry {
  return {
    rule,
    passed: false,
    decision,
    message
  };
}

function passTrace(rule: RuleName, message: string): RuleTraceEntry {
  return {
    rule,
    passed: true,
    message
  };
}

function normalizeAction(action: ProposedAction): Receipt["normalized_action"] {
  return {
    action_id: action.action_id.trim(),
    actor: action.actor.trim(),
    action_type: action.action_type.trim(),
    resource: action.resource.trim().replaceAll("\\", "/"),
    operation: action.operation.trim(),
    destructive: action.destructive,
    ...(action.amount_cents !== undefined ? { amount_cents: action.amount_cents } : {}),
    ...(action.currency !== undefined ? { currency: action.currency.trim() } : {}),
    ...(action.recipient !== undefined ? { recipient: action.recipient.trim() } : {}),
    ...(action.domain !== undefined ? { domain: action.domain.trim().toLowerCase() } : {}),
    uses_credentials: action.uses_credentials,
    requests_scope_expansion: action.requests_scope_expansion
  };
}

function includesTrimmed(values: string[], candidate: string): boolean {
  const normalized = candidate.trim();
  return values.some((value) => value.trim() === normalized);
}

function includesDomain(values: string[], candidate: string): boolean {
  const normalized = candidate.trim().toLowerCase();
  return values.some((value) => value.trim().toLowerCase() === normalized);
}

export function evaluateAction(scope: ApprovedScope, action: ProposedAction): Receipt {
  const ruleTrace: RuleTraceEntry[] = [];
  let decisive: DecisiveRule | undefined;

  if (!includesTrimmed(scope.allowed_action_types, action.action_type)) {
    decisive = addTrace(
      ruleTrace,
      decisiveTrace(
        "action_type_allowed",
        "deny",
        "ACTION_TYPE_NOT_ALLOWED",
        "Action type is not allowed by approved scope."
      ),
      {
        decision: "deny",
        reason: "ACTION_TYPE_NOT_ALLOWED",
        rule: "action_type_allowed"
      }
    );
  } else {
    addTrace(ruleTrace, passTrace("action_type_allowed", "Action type is allowed by approved scope."));
  }

  if (!decisive) {
    if (!includesTrimmed(scope.allowed_actors, action.actor)) {
      decisive = addTrace(
        ruleTrace,
        decisiveTrace("actor_allowed", "deny", "ACTOR_NOT_ALLOWED", "Actor is not allowed by approved scope."),
        {
          decision: "deny",
          reason: "ACTOR_NOT_ALLOWED",
          rule: "actor_allowed"
        }
      );
    } else {
      addTrace(ruleTrace, passTrace("actor_allowed", "Actor is allowed by approved scope."));
    }
  }

  if (!decisive) {
    const resourceMatch = matchAllowedResource(action.resource, scope.allowed_resource_prefixes);

    if (!resourceMatch.valid || !resourceMatch.matched) {
      decisive = addTrace(
        ruleTrace,
        decisiveTrace(
          "resource_prefix_allowed",
          "deny",
          "RESOURCE_OUTSIDE_APPROVED_PREFIXES",
          resourceMatch.reason ?? "Resource is outside approved resource prefixes."
        ),
        {
          decision: "deny",
          reason: "RESOURCE_OUTSIDE_APPROVED_PREFIXES",
          rule: "resource_prefix_allowed"
        }
      );
    } else {
      addTrace(ruleTrace, passTrace("resource_prefix_allowed", "Resource is inside approved resource prefixes."));
    }
  }

  if (!decisive) {
    if (action.destructive && scope.reapproval_triggers.destructive_operation) {
      decisive = addTrace(
        ruleTrace,
        decisiveTrace(
          "destructive_operation_requires_reapproval",
          "reapproval_required",
          "DESTRUCTIVE_OPERATION_REQUIRES_REAPPROVAL",
          "Destructive operation requires fresh human reapproval."
        ),
        {
          decision: "reapproval_required",
          reason: "DESTRUCTIVE_OPERATION_REQUIRES_REAPPROVAL",
          rule: "destructive_operation_requires_reapproval"
        }
      );
    } else {
      addTrace(
        ruleTrace,
        passTrace(
          "destructive_operation_requires_reapproval",
          "No destructive-operation reapproval trigger fired."
        )
      );
    }
  }

  if (!decisive) {
    const spendCurrencyMissingOrMismatched =
      action.amount_cents !== undefined && action.currency?.trim() !== scope.currency.trim();

    if (spendCurrencyMissingOrMismatched && scope.reapproval_triggers.spend_above_limit) {
      decisive = addTrace(
        ruleTrace,
        decisiveTrace(
          "spend_currency_mismatch_requires_reapproval",
          "reapproval_required",
          "SPEND_CURRENCY_MISMATCH_REQUIRES_REAPPROVAL",
          "Spend currency is missing or differs from the approved scope currency and requires fresh human reapproval."
        ),
        {
          decision: "reapproval_required",
          reason: "SPEND_CURRENCY_MISMATCH_REQUIRES_REAPPROVAL",
          rule: "spend_currency_mismatch_requires_reapproval"
        }
      );
    } else {
      addTrace(
        ruleTrace,
        passTrace(
          "spend_currency_mismatch_requires_reapproval",
          "Spend currency matches the approved scope currency or spend is not declared."
        )
      );
    }
  }

  if (!decisive) {
    const exceedsSpendLimit = action.amount_cents !== undefined && action.amount_cents > scope.spend_limit_cents;

    if (exceedsSpendLimit && scope.reapproval_triggers.spend_above_limit) {
      decisive = addTrace(
        ruleTrace,
        decisiveTrace(
          "spend_above_limit_requires_reapproval",
          "reapproval_required",
          "SPEND_ABOVE_LIMIT_REQUIRES_REAPPROVAL",
          "Spend exceeds the approved amount threshold and requires fresh human reapproval."
        ),
        {
          decision: "reapproval_required",
          reason: "SPEND_ABOVE_LIMIT_REQUIRES_REAPPROVAL",
          rule: "spend_above_limit_requires_reapproval"
        }
      );
    } else {
      addTrace(
        ruleTrace,
        passTrace("spend_above_limit_requires_reapproval", "Spend is within approved threshold or not declared.")
      );
    }
  }

  if (!decisive) {
    const recipientIsNew =
      action.recipient !== undefined && !includesTrimmed(scope.allowed_recipients, action.recipient);

    if (recipientIsNew && scope.reapproval_triggers.new_recipient) {
      decisive = addTrace(
        ruleTrace,
        decisiveTrace(
          "new_recipient_requires_reapproval",
          "reapproval_required",
          "NEW_RECIPIENT_REQUIRES_REAPPROVAL",
          "New or undeclared recipient requires fresh human reapproval."
        ),
        {
          decision: "reapproval_required",
          reason: "NEW_RECIPIENT_REQUIRES_REAPPROVAL",
          rule: "new_recipient_requires_reapproval"
        }
      );
    } else {
      addTrace(
        ruleTrace,
        passTrace("new_recipient_requires_reapproval", "Recipient is approved or not declared.")
      );
    }
  }

  if (!decisive) {
    const domainIsNew = action.domain !== undefined && !includesDomain(scope.allowed_domains, action.domain);

    if (domainIsNew && scope.reapproval_triggers.new_domain) {
      decisive = addTrace(
        ruleTrace,
        decisiveTrace(
          "new_domain_requires_reapproval",
          "reapproval_required",
          "NEW_DOMAIN_REQUIRES_REAPPROVAL",
          "New or undeclared domain requires fresh human reapproval."
        ),
        {
          decision: "reapproval_required",
          reason: "NEW_DOMAIN_REQUIRES_REAPPROVAL",
          rule: "new_domain_requires_reapproval"
        }
      );
    } else {
      addTrace(ruleTrace, passTrace("new_domain_requires_reapproval", "Domain is approved or not declared."));
    }
  }

  if (!decisive) {
    if (action.uses_credentials && scope.reapproval_triggers.credential_use) {
      decisive = addTrace(
        ruleTrace,
        decisiveTrace(
          "credential_use_requires_reapproval",
          "reapproval_required",
          "CREDENTIAL_USE_REQUIRES_REAPPROVAL",
          "Credential use requires fresh human reapproval."
        ),
        {
          decision: "reapproval_required",
          reason: "CREDENTIAL_USE_REQUIRES_REAPPROVAL",
          rule: "credential_use_requires_reapproval"
        }
      );
    } else {
      addTrace(ruleTrace, passTrace("credential_use_requires_reapproval", "Credential use is absent or allowed."));
    }
  }

  if (!decisive) {
    if (action.requests_scope_expansion && scope.reapproval_triggers.scope_expansion) {
      decisive = addTrace(
        ruleTrace,
        decisiveTrace(
          "scope_expansion_requires_reapproval",
          "reapproval_required",
          "SCOPE_EXPANSION_REQUIRES_REAPPROVAL",
          "Scope expansion requires fresh human reapproval."
        ),
        {
          decision: "reapproval_required",
          reason: "SCOPE_EXPANSION_REQUIRES_REAPPROVAL",
          rule: "scope_expansion_requires_reapproval"
        }
      );
    } else {
      addTrace(
        ruleTrace,
        passTrace("scope_expansion_requires_reapproval", "No scope-expansion reapproval trigger fired.")
      );
    }
  }

  if (!decisive) {
    ruleTrace.push({
      rule: "default_allow",
      passed: true,
      decision: "allow",
      message: "No deny or reapproval rule fired."
    });
    decisive = {
      decision: "allow",
      reason: "NO_REAPPROVAL_TRIGGERED",
      rule: "default_allow"
    };
  }

  return {
    decision: decisive.decision,
    reason: decisive.reason,
    decisive_rule: decisive.rule,
    scope_id: scope.scope_id,
    action_id: action.action_id,
    actor: action.actor,
    action_type: action.action_type,
    resource: action.resource,
    rule_trace: ruleTrace,
    normalized_action: normalizeAction(action)
  };
}
