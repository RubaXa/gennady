# authoring-toolfact1-oct24-module-nested-facts-r4 — fail (completed)

VERDICT: fail

NOR-REQ-1’s positive precondition (“contains at least one ASCII letter and no characters outside ASCII spaces, underscore and hyphen”) is self-contradictory as written: the required letter is itself outside that allowed set. It also conflicts with its own successful example `"  Foo__BAR  "` → `"foo-bar"`. More substantive, it narrows parent TOK-REQ-1, which covers any ASCII string containing at least one non-separator, while NOR-REQ-2 rejects only empty, separator-only, and non-ASCII input. Witnesses such as `"a1"` or `"foo!"` are therefore uncovered by the positive requirement and would throw via MODULE_CONTRACTS’ “On pre-violation” clause, although the parent requires them to normalize. The required example rows are present, but this contract gap/contradiction prevents a pass.
