# Bounded deviation-verdict retry — mechanical, trajectory and judge PASS

Clean source `b29ecd3bc5da8997d9da583346116de32db06085`, fresh local build, actual
`llm-proxy/deepseek-v4-flash` worker and judge. Exact scenario input is `scenario-input.json`;
its SHA-256 equals the original summary's `source.scenarioSha256`. No old result is regraded.

Nine observed tools: read the brief and actual owners, invoke installed `sdd-log` for exactly
COR-DL-1 accepted / COR-DL-2 rework / COR-DL-3 rolled-back, then verify the golden artifacts.
The independently source-bound terminal checkpoint compares all three artifacts byte-for-byte
and guards its golden inputs. `quality CHECKPOINTS`, complete trajectory and judge all PASS.
The judge now received the actual baseline-to-working-tree CLI diff, retained verbatim in
`judge-input-diff.json` from the public SDK user prompt; its decoded diff contains exactly three transitions.

This corrects the prior run's evidence visibility defect; it does not hide that prior judge FAIL.
Acceptance also now spells out the operator-provided ID/verdict pairs. This is not a controlled
single-variable cost A/B or a proof of the full autonomous execute flow.

Observed worker duration 15066 ms; worker 12340 + judge 4435 = 16775 non-cache tokens.
Cache-read 71808 separately. Actual model/session metadata is in `model-audit.json`.
Monetary cost is UNKNOWN: provider-reported zero is not a verified bill. Owned sandbox removed
only after durable result/trajectory publication; no publication or real project mutation.
