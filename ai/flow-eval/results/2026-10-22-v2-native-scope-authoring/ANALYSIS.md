# Native scope authoring — first live failure

This is an actual model run, not a replay or harness test. Model and source/config/scenario
fingerprints are in `summary.json`. Original summary and trajectory are preserved unchanged.

## Observed path

- Complete capture: 32 tool actions, one session, no child reviewer. No Write/Edit/task call occurred.
- `sdd-new library --scope fibonacci` succeeded. The scope directive's exact spec-path
  `sdd-orient specs/fibonacci/fibonacci.spec.md` also succeeded: this repair reached runtime.
- Later `sdd-orient --scope fibonacci` exited 4, before module creation. The module directive still
  contained this incompatible call; the agent also violated its create-before-orient order.
- `sdd-check --help 2>&1 | head -40` was the only command mentioning `sdd-check`.
  It is help, not a verification attempt. The pre-existing observer stopped the forbidden probe.
- Both generated specs remained skeletons. R1 found six errors; only three of four terminal
  checkpoints passed. No approval or successful independent review is established.

The original failed tool response was independently read from the same OpenCode session after the
run, without another model request:

```text
[sdd-orient] error: cannot read "fibonacci" as a spec file, and it does not match a --scope name in
specs/README.md's Scopes table. Known scopes: (таблица Scopes пуста). Pass a real .spec.md path,
or one of the scope names above with --scope.
```

## Corrective hypotheses

1. Module orientation must consume its own `moduleManifest` spec path, not require a portal entry
   which has not yet been authored. Verify the generated command on a real CLI before retrying.
2. A help/version command must never satisfy required verification or command-order assertions.
   The old trajectory grade did not detect that distinction; do not retroactively label it proven.
3. Preserve authored specs and bounded failure diagnostics permanently, not only in seven-day
   transient storage. The `specs/` copies beside this report were copied byte-for-byte from the
   original compact artifacts before expiration; the old absolute summary paths are historical.

These changes do not prove that the agent will author the documents: excessive reading and the
absence of writes remain observations to compare in the next same-scenario/model/budget run.
Do not remove checks, approve skeletons or rewrite this failure to manufacture a green result.
