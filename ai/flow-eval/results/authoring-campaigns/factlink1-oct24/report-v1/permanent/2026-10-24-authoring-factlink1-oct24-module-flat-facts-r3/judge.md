# authoring-factlink1-oct24-module-flat-facts-r3 — fail (completed)

VERDICT: fail

The DbC Post in `MODULE_CONTRACTS` requires "no leading or trailing hyphen", but the brief and TOK-REQ/NOR-REQ-1 only trim leading/trailing ASCII spaces; underscores and hyphens are collapsed, not stripped. For `___foo___` (which satisfies the stated Pre), the domain-consistent result is `-foo-`, contradicting that Post. The Pre also admits mixed input such as `aé` while the same contract classifies any non-ASCII character as a pre-violation that throws `TypeError`, leaving overlapping return/throw conditions.
