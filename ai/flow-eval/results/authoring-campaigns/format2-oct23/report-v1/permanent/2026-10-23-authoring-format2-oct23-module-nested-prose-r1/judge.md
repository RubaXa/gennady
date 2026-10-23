# authoring-format2-oct23-module-nested-prose-r1 — fail (completed)

VERDICT: fail

`NOR-REQ-1` applies to any string containing at least one non-separator ASCII character, so mixed input such as `"aé"` is simultaneously required to return a normalized token and, under `NOR-REQ-2`, to throw `TypeError`; unlike parent `TOK-REQ-1`, it never restricts the whole input to ASCII, and no precedence or exception is stated. The `normalizeToken` invariant also claims the result never starts or ends with a hyphen, but valid input `"_foo_"` or `"-foo-"` satisfies `NOR-REQ-1`, and the specified trim/collapse behavior yields `"-foo-"`, violating that invariant.

The required Input/Outcome rows are present and correct, and the handoff remains pending, but the bounded oracle pass does not resolve these semantic conflicts.
