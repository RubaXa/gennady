# Exact operator-verdict transitions — mechanical PASS, diagnostic judge FAIL preserved

Clean source `893153399adec842f652e8877e066649bf0a06a0`; actual Flash/llm-proxy metadata and
worker/judge usage are in `model-audit.json`. Exact input bytes are in `scenario-input.json`.

17 real tools in one worker session. Actual installed `sdd-log` updated the module Decision Log,
canonical tasks index and ticket to the three already-provided operator decisions. No model
invented an approval. The source-bound checkpoint verified both golden-file hashes, then compared
all three artifacts byte-for-byte with the expected records. All unrelated bytes must match.
It passed; aggregate batch exit was zero. The old summary has no separate CHECKPOINTS quality
field: inspect the terminal event in trajectory.json, not the judge-derived outcome field.

Judge FAIL is retained unchanged: its SDK DIFF was empty for these Bash/CLI-driven mutations,
and its acceptance text did not enumerate the brief's exact ID→verdict mapping. That is an evidence
visibility defect, not proof that the actual command or byte check failed. The corrective hypothesis
is an owned-fixture Git baseline→working-tree diff (including worker commits), with bounded safe
execution, plus exact expected verdicts in acceptance. A NEW run must test that hypothesis; do not
rewrite this judge result or claim it saw the checkpoint output (judging precedes terminal checks).

30077 ms observed worker duration, 16334 worker tokens and 8761 judge tokens excluding cache.
Monetary cost is unknown. Exact-byte tool acceptance does not prove the autonomous SDD execute flow.
