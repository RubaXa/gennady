# Operational facts — CONTRACTCUE1

- First build attempt ran inside the restricted sandbox. Vite could not write its
  temporary config through shared node_modules (EPERM). Repeated outside sandbox;
  no source/config/dependency change and no model dispatch in either attempt.
- The model-free lifecycle smoke succeeded: create, remove fixture, abort, delete.
  The adjacent controller-test invocation accidentally used inherited Node26 after
  a shell-local PATH assignment ended. Its Node22 precondition rejected execution.
  Re-run with exact absolute Node22: 3/3. No model call, no changed test logic.
- All live roles are pinned Flash AI Proxy; private server credentials/config are
  not copied to the portable archive. No personal server or state is modified.
- Prior TOOLFACT1 grades remain immutable. calibrated-v6 is already frozen in both
  fresh arms: no post-hoc recalibration is planned for this series.
