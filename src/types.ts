export type Decision = "allow" | "deny" | "reapproval_required";

export type RuleName =
  | "action_type_allowed"
  | "actor_allowed"
  | "resource_prefix_allowed"
  | "destructive_operation_requires_reapproval"
  | "spend_currency_mismatch_requires_reapproval"
  | "spend_above_limit_requires_reapproval"
  | "new_recipient_requires_reapproval"
  | "new_domain_requires_reapproval"
  | "credential_use_requires_reapproval"
  | "scope_expansion_requires_reapproval"
  | "default_allow";

export type ReasonCode =
  | "ACTION_TYPE_NOT_ALLOWED"
  | "ACTOR_NOT_ALLOWED"
  | "RESOURCE_OUTSIDE_APPROVED_PREFIXES"
  | "DESTRUCTIVE_OPERATION_REQUIRES_REAPPROVAL"
  | "SPEND_CURRENCY_MISMATCH_REQUIRES_REAPPROVAL"
  | "SPEND_ABOVE_LIMIT_REQUIRES_REAPPROVAL"
  | "NEW_RECIPIENT_REQUIRES_REAPPROVAL"
  | "NEW_DOMAIN_REQUIRES_REAPPROVAL"
  | "CREDENTIAL_USE_REQUIRES_REAPPROVAL"
  | "SCOPE_EXPANSION_REQUIRES_REAPPROVAL"
  | "NO_REAPPROVAL_TRIGGERED";

export interface RuleTraceEntry {
  rule: RuleName;
  passed: boolean;
  message: string;
  decision?: Decision;
}

export interface Receipt {
  decision: Decision;
  reason: ReasonCode;
  decisive_rule: RuleName;
  scope_id: string;
  action_id: string;
  actor: string;
  action_type: string;
  resource: string;
  rule_trace: RuleTraceEntry[];
  normalized_action: {
    action_id: string;
    actor: string;
    action_type: string;
    resource: string;
    operation: string;
    destructive: boolean;
    amount_cents?: number;
    currency?: string;
    recipient?: string;
    domain?: string;
    uses_credentials: boolean;
    requests_scope_expansion: boolean;
  };
}
