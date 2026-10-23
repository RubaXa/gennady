# authoring-format2-oct23-module-nested-prose-r3 — fail (completed)

VERDICT: fail

The normalization contract itself is consistent: NOR-REQ-1/NOR-REQ-2 match the required trim/lowercase/collapse behavior, the empty and separator-only rejection, and the mandated Input/Outcome table rows. However, the Research section links `../../../docs/token-contract.md`, which resolves from the target to `specs/docs/token-contract.md` rather than the source-owned `docs/token-contract.md`; the oracle confirms that path is missing, so the artifact does not retain a valid relative reference as required.
