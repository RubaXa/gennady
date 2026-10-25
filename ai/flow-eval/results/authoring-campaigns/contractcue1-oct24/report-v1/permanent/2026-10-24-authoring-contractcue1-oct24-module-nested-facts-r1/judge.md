# authoring-contractcue1-oct24-module-nested-facts-r1 — fail (completed)

VERDICT: fail

The required `MODULE_REQUIREMENTS` Input/Outcome table is present and matches the brief, but the artifact has normative contradictions. `Module Vision` promises to normalize every "non-empty ASCII string" while `NOR-REQ-2` requires separator-only ASCII input to throw. Also, the `MODULE_CONTRACTS` Pre accepts any string containing at least one non-separator ASCII character—so mixed input such as `"fooé"` satisfies Pre—while the same contract's On pre-violation requires `TypeError` for non-ASCII input. These overlapping return/throw obligations lack an exception or precedence rule. The bounded structural oracle pass does not resolve them.
