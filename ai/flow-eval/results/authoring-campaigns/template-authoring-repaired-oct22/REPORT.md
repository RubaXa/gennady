# Observer-censored diagnostic (retained, not pooled)

Source: clean `a681444f17e1199857a13b60bb3763b125dd8436`, exact [plan.json](./plan.json).
Fixture repairs from the first campaign were active. Five cases started; portal/library completed,
product/infrastructure were aborted by the observer, interface was interrupted when the owner
stopped the batch. Remaining five cases were not started. Original summaries, artifacts, trajectories
and judge outputs are preserved in the sibling per-case result directories.

The observer was configured with `stuckAfter=12`, `observeEveryMs=2500`: only 30 s without a new
observable tool call. Long model generation could trip it before the independent 180 s worker
deadline. This is **observer censoring**, not proof that the agent was hung. The next diagnostic
uses an idle bound longer than the hard worker deadline and all ten cases complete.

No performance conclusion, improvement claim or qualified baseline is drawn from this cohort.
Do not merge its timing data with the wall180 cohort: environment/config identities differ.
Data was recovered from the exact owner stash `300f711f71076d6bf645039059c8d3b759a1ec82`;
the new wall180 journal entries were retained as well, without dropping unrelated stashes.
