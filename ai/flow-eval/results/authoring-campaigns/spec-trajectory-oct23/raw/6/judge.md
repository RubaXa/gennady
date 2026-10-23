# authoring-spec-trajectory-oct23-module-nested-baseline-r1 — fail (completed)

VERDICT: fail

The positive precondition in `NOR-REQ-1` covers any string containing a non-separator character, including non-ASCII input such as `"café"`, while `NOR-REQ-2` requires that same input to throw `TypeError`; the DbC Pre excludes non-ASCII input, but the normative requirements remain contradictory, and `NOR-REQ-1` also drops the parent TOK-REQ-1 “ASCII-строка” restriction. The required Input/Outcome table is present and correct (`"  Foo__BAR  "` → `"foo-bar"`, `""` → `TypeError`).
