# authoring-toolfact1-oct24-module-flat-facts-r3 — fail (completed)

VERDICT: fail

`NOR-REQ-1` applies to any string containing at least one non-separator ASCII character, so a mixed input such as `"aé"` would require normalization, while `NOR-REQ-2` requires `TypeError` for any non-ASCII character. The DbC precondition narrows the positive case to all-ASCII input, but that contradicts rather than resolves `NOR-REQ-1`; it also drops the parent’s all-ASCII scoping in `TOK-REQ-1`. The required example rows and pending handoff are otherwise present.
