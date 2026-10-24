# authoring-toolfact1-oct24-module-flat-facts-r4 — fail (completed)

VERDICT: fail

NOR-REQ-1 accepts any string containing at least one non-separator ASCII character, without excluding mixed non-ASCII input. For `"aé"`, NOR-REQ-1 requires a normalized return while NOR-REQ-2 and the contract pre-violation rule require `TypeError`; no exception or precedence is stated. The parent TOK-REQ-1 avoids this by requiring an ASCII-only string, whereas the module broadened the precondition to a general string. The required Input/Outcome table is present, but this normative overlap prevents a semantic pass.
