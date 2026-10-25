# Operational limits recorded during FACTLINK1

- Workers use only clean frozen 09c2329b / 67326bc5 source trees, original v4 oracle,
  same dist/dependencies, same Flash route. No worker source/config was edited in flight.
- After two completed attempts revealed the SECTION-reference evaluator inconsistency,
  v5 was implemented ONLY in the separate PR/review checkout. A bounded unit probe
  (42 tests, about eight seconds) and a short type-check in that checkout overlapped
  the live series. They did not modify the live worktrees or provider configuration.
  This was not a dedicated idle host; elapsed-time differences are descriptive and
  cannot certify a causal latency gain. Tools/tokens are retained independently.
- Primary v4 grades and semantic judge responses must remain immutable. Post-series
  v4/v5 replay is a separately versioned artifact calibration, never a semantic PASS.
- Initial preparation caught an undeclared contract reference. A trial lazy-load edge
  changed the generated inheritance graph, so it was not retained. The final candidate
  instead contains a self-contained example plus an ordinary owner-file pointer.
  Only two owner files changed. Full ordinary pre-commit was rerun and passed before
  the first model call; neither hook failure was bypassed or counted as a live attempt.
