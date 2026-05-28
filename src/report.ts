import type { Decision, Receipt } from "./types.js";

function displayDecision(decision: Decision): string {
  return decision.toUpperCase();
}

function mark(passed: boolean): string {
  return passed ? "✓" : "✗";
}

export function formatReport(receipt: Receipt): string {
  const decisive = receipt.rule_trace.find((entry) => entry.rule === receipt.decisive_rule);

  return [
    "Reapproval Gate Report",
    "",
    `Decision: ${displayDecision(receipt.decision)}`,
    `Reason: ${receipt.reason}`,
    "",
    `Scope: ${receipt.scope_id}`,
    `Action: ${receipt.action_id}`,
    `Actor: ${receipt.actor}`,
    `Action type: ${receipt.action_type}`,
    `Resource: ${receipt.resource}`,
    "",
    "Decisive rule:",
    `- ${receipt.decisive_rule}: ${decisive?.message ?? "No decisive message recorded."}`,
    "",
    "Rule trace:",
    ...receipt.rule_trace.map((entry) => `${mark(entry.passed)} ${entry.rule}`)
  ].join("\n");
}
