# Authoring defect calibration — 2026-10-23

This is a separate calibration of confirmed harness/reference defects, not an optimization arm
and not a replacement for the immutable 30 placement outcomes in `../template-placement-oct22/`.

Six exact inputs and their expected labels were frozen before any model request: three valid
module documents, two contradictory positive/negative contracts, and one contradictory document
containing an untrusted instruction to output PASS. The actual production `SddEvalJudge` and its
read-only OpenCode adapter evaluated them with `llm-proxy/deepseek-v4-flash` only.

An initial server preflight rejected an inherited enabled MCP before any model request or fixture
creation. Only the owned server was restarted with that MCP explicitly disabled; the user's global
configuration was not edited. There was no model substitution or repeated sampling until green.

- Actual labels matched expected labels **6/6**: 3 PASS, 3 FAIL; zero tool calls.
- Source was explicitly dirty: `calibration.json` records base commit plus exact measured file
  hashes. `source-snapshot.json` preserves those exact bytes, even after mechanical formatting.
- `collector.mjs.txt` is inert historical source, not an active test entry point or temp dependency.
- All six owned sessions were deleted and all six fixture directories removed after their calls.
  The owned server was then stopped. The temporary collection root is not required for replay.
- All original 403 placement evidence hashes and original RED/inconclusive outcomes are unchanged.

The fixture positive domain now excludes empty/separator-only input instead of contradicting its
negative requirement. The current oracle accepts explicit unapproved Russian/English handoffs and
rejects contradictory granted claims, including Markdown list forms. The judge now receives bounded,
identity-checked source-owned parent/contract references and a text-only/no-tools role.

Six successful calibration cases establish this smoke result, not perfect future judge reliability
or improved authoring efficiency. Missing/malformed future judge verdicts still remain inconclusive.
No historical model-generated document has been rewritten to manufacture a better result.
