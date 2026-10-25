# authoring-factlink1-oct24-module-nested-baseline-r5 — fail (completed)

VERDICT: fail
The required two-row Input/Outcome table is present, but the `Service: normalizeToken` DbC precondition says only that input contains “at least one ASCII character other than a space, underscore or hyphen,” and `TypeError` is thrown only “On pre-violation.” That admits mixed inputs such as `"abcé"` or `"a é"`, which contain a valid ASCII non-separator and therefore satisfy the stated pre-state, yet the parent TOK-REQ-2 and the artifact’s own Entity Surfaces/Public Operations require any non-ASCII input to throw `TypeError`. The precondition needs an all-ASCII condition or an explicit non-ASCII rejection before the positive contract; otherwise the positive and error cases contradict.
