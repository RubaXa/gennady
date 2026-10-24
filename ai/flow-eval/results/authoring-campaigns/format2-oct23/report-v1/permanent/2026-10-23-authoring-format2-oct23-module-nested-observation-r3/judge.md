# authoring-format2-oct23-module-nested-observation-r3 — fail (completed)

VERDICT: fail

`NOR-REQ-1` and the `Module Contracts` Pre allow any string containing at least one non-separator ASCII character, so a mixed input such as `"Fooé"` satisfies the positive normalization precondition. The same input is required by `NOR-REQ-2` to throw `TypeError` for containing non-ASCII, with no stated exception or precedence. This also diverges from parent `TOK-REQ-1` ("ASCII-строка") and `docs/token-contract.md` (non-ASCII throws). The required example table is present, but this positive/negative overlap remains a normative contradiction; the bounded oracle pass does not resolve it.
