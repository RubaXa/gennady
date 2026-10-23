# authoring-spec-trajectory-oct23-scope-product-baseline-r3 — fail (completed)

VERDICT: fail
The required Input/Outcome rows and pending-operator handoff are present, but `TOK-REQ-3` only mandates replacing runs of **two or more** separators. The supplied contract requires collapsing spaces, underscores, and hyphens to one hyphen; a single internal separator (`"foo bar"` or `"foo_bar"`) is left unspecified and may not become `"foo-bar"`, conflicting with the artifact's own "separated by single hyphens" Vision. The positive example uses only `__` and does not close this gap; this semantic omission is outside the structural oracle's bounded pass.
