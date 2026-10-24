# authoring-factlink1-oct24-module-nested-facts-r5 — fail (completed)

VERDICT: fail

Domain behavior is mostly consistent: NOR-REQ-1/NOR-REQ-2, the examples table, and the DbC contract correctly cover `"  Foo__BAR  "` → `"foo-bar"` and `""` → `TypeError`, including empty, separator-only, and non-ASCII rejection without an overlapping return obligation.

The artifact nevertheless breaks required parent traceability: Module Vision links to `../../token.spec.md#REQUIREMENTS_AND_CONSTRAINTS`, while the supplied token spec has the heading `Requirements & Constraints`, not that anchor. The source-owned artifact oracle records `pass:false` for this missing heading link, and acceptance requires valid relative links and an oracle pass. NOR-DL-2's claim that `sdd-check --authoring` passed without remarks is unverified narration and does not cure the broken link.
