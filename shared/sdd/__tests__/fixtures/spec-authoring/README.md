# Authoring checker corpus

Corpus captured from the 2026-09-02 `fibonacci-library` P7.1 worker run
(`ses_f9dd5b1aeffe5IKerxLrLDeeC1`). The two valid files preserve the worker's
actual completed content. Distorted documents change exactly one observed model-sensitive
shape so checker behavior stays attributable.

- `valid/`: legitimate scope and module variations; no structural false positives.
- `distorted/wrong-heading.spec.md`: a section heading slipped from level 2 to level 3.
- `distorted/prose-list.spec.md`: Out-of-Scope was flattened from bullets into prose.
- `distorted/missing-requirement-ids.spec.md`: requirement headings lost their IDs.
- `distorted/leftover-guidance.spec.md`: a skeleton guidance comment survived authoring.
- `autofix/trivial-whitespace.input.spec.md`: extra heading spaces and list indentation.
- `autofix/trivial-whitespace.expected.spec.md`: normalized document expected after auto-fix.

