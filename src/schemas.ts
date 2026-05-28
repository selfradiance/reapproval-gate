import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const currencyCode = z.string().trim().regex(/^[A-Z]{3}$/, "Currency must be a three-letter uppercase code.");

export const approvedScopeSchema = z
  .object({
    scope_id: nonEmptyString,
    approved_by: nonEmptyString,
    approved_at: z.string().datetime({ offset: true }),
    allowed_actors: z.array(nonEmptyString).min(1),
    allowed_action_types: z.array(nonEmptyString).min(1),
    allowed_resource_prefixes: z.array(nonEmptyString).min(1),
    allowed_recipients: z.array(nonEmptyString),
    allowed_domains: z.array(nonEmptyString),
    spend_limit_cents: z.number().int().nonnegative(),
    currency: currencyCode,
    reapproval_triggers: z.object({
      destructive_operation: z.boolean(),
      new_recipient: z.boolean(),
      new_domain: z.boolean(),
      credential_use: z.boolean(),
      scope_expansion: z.boolean(),
      spend_above_limit: z.boolean()
    }),
    default_decision: z.literal("deny")
  })
  .strict();

export const proposedActionSchema = z
  .object({
    action_id: nonEmptyString,
    actor: nonEmptyString,
    action_type: nonEmptyString,
    resource: nonEmptyString,
    operation: nonEmptyString,
    destructive: z.boolean(),
    amount_cents: z.number().int().nonnegative().optional(),
    currency: currencyCode.optional(),
    recipient: nonEmptyString.optional(),
    domain: nonEmptyString.optional(),
    uses_credentials: z.boolean().default(false),
    requests_scope_expansion: z.boolean().default(false)
  })
  .strict()
  .superRefine((action, ctx) => {
    if (action.amount_cents !== undefined && action.currency === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currency"],
        message: "Currency is required when amount_cents is declared."
      });
    }

    if (action.amount_cents === undefined && action.currency !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amount_cents"],
        message: "amount_cents is required when currency is declared."
      });
    }
  });

export type ApprovedScope = z.infer<typeof approvedScopeSchema>;
export type ProposedAction = z.infer<typeof proposedActionSchema>;
