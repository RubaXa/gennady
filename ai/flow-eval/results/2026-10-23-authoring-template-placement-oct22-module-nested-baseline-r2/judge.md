# authoring-template-placement-oct22-module-nested-baseline-r2 — fail (completed)

VERDICT: fail
The domain requirements are encoded correctly, including the required Input/Outcome table with `"  Foo__BAR  " → "foo-bar"` and `"" → TypeError`, and the contract consistently requires `TypeError` without I/O.
However, Module Vision links the seeded token contract as `../../../docs/token-contract.md`, which resolves to `specs/docs/token-contract.md`; the source-owned oracle reports that path is missing. This violates the acceptance requirement to retain valid relative links, so the artifact fails. This agrees with the oracle.
