# authoring-toolfact1-oct24-module-nested-facts-r6 — fail (completed)

VERDICT: fail

The required `MODULE_REQUIREMENTS` table includes both rows, and NOR-REQ-2 correctly covers empty, separator-only, and non-ASCII input with `TypeError` before I/O. Handoff also remains pending with no implementation claim.

However, `MODULE_CONTRACTS` contains a contradictory postcondition: it says the result never starts or ends with `-`, but NOR-REQ-1 only trims ASCII spaces and allows any valid input containing a non-separator character. Concrete witness: `" -a"` satisfies NOR-REQ-1, trims to `"-a"`, and collapses to `"-a"`; likewise `"a-"` yields `"a-"`. Both start/end with `-`, directly violating the stated postcondition. The brief and parent contract do not authorize trimming edge hyphens, so the artifact is semantically inconsistent for valid inputs.
