# authoring-factlink1-oct24-module-flat-facts-r2 — fail (completed)

VERDICT: fail
NOR-REQ-1 applies whenever the input contains any non-separator ASCII character, so mixed input such as `"aé"` must be normalized, while NOR-REQ-2 requires a TypeError for the same input because it contains a non-ASCII character; no exception or precedence is stated. This also broadens parent TOK-REQ-1 by dropping its “ASCII-string” precondition. The required example table and pending handoff are otherwise present.
