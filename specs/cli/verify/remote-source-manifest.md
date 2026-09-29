# U5 Remote Source Manifest

This manifest records the line-by-line ownership decision used by UV-15..17. It is an audit aid,
not runtime input. The implementation was rewritten against the target Verify contracts; no dirty
source file was copied or cherry-picked as a unit.

| Source area                             | Classification     | Target owner                                | Preserved contract                                                 |
| --------------------------------------- | ------------------ | ------------------------------------------- | ------------------------------------------------------------------ |
| Provider pipeline identity/query shapes | A — copy idea      | `services/vcs-client/**`                    | Required id/full SHA/raw status; exact-SHA search; pinned-id reads |
| Provider jobs and failed-job log reads  | A — copy idea      | `services/vcs-client/**`                    | Read-only jobs/log evidence for one pinned pipeline                |
| Poll/search loop                        | B — rewrite        | `shared/verify/execution/remote-watcher.ts` | Search only exact SHA until pin, then poll only immutable id       |
| Empty-string provider normalization     | B — reject/rewrite | provider adapters                           | Missing id/SHA/status fails closed instead of becoming `''`        |
| Provider status mapping                 | B — rewrite        | remote watcher/executor                     | Typed pending/terminal/error states; no implicit exit-zero success |
| Pagination                              | B — rewrite        | provider adapters                           | Bounded complete pagination, deterministic result order            |
| Session/inbox/help/output glue          | C — exclude        | none                                        | Unrelated to the Verify runner/report boundary                     |
| Remote mutation operations              | C — exclude        | none                                        | No push, rollback, force-push, retry, play, cancel or ref mutation |

The public remote executor receives a capability-reduced `RemotePipelineObserver`, so mutation
methods present on older VCS service classes are not part of its type or runtime dependency. Tests
freeze exact query parameters, immutable id polling, typed terminal behavior, bounded/redacted logs,
timeout/cancellation and the absence of provider mutation calls.
