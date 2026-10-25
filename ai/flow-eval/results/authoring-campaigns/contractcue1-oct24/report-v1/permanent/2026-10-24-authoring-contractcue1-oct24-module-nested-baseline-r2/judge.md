# authoring-contractcue1-oct24-module-nested-baseline-r2 — fail (completed)

VERDICT: fail
NOR-REQ-1 overlaps NOR-REQ-2: `"Fooé"` satisfies NOR-REQ-1’s “at least one ASCII character” condition while NOR-REQ-2 requires `TypeError` for containing non-ASCII, with no stated precedence; the parent TOK-REQ-1 avoids this by requiring an “ASCII-строка.”
The Module Contracts POST also overstates the output (“содержит только lower-case ASCII-буквы и одиночные hyphen между фрагментами”), contradicting NOR-REQ-1 for valid inputs such as `"x1"`, where the digit is preserved. The required Input/Outcome table, error cases, and pending handoff are otherwise present.
