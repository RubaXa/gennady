<!-- @file: SO-5 golden manifest — what each golden file observes and who owns intentional drift.
     Kept OUT of the golden files themselves (a header would break the exact-line-list comparison
     `deployed-surface.test.ts` does against them). See `shared/sdd/__tests__/GOLDEN-MANIFEST.md`
     for the sibling convention this one follows (`UPDATE_VERIFY_GOLDEN=1` there, `UPDATE_SURFACE_GOLDEN=1`
     here — same pattern, different surface). -->

# Golden manifest — `shared/common/sync/__tests__`

Regenerate ONLY inside a named owning task, via `UPDATE_SURFACE_GOLDEN=1 npm test`.

| Golden file                              | Produced by                                           | Owner of intentional drift                                                               |
| ---------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `deployed-surface.directives.golden.txt` | `scanDirectives(ai/directives)` — what `sync` mirrors | any task that adds/removes/renames a file under `ai/directives/`                         |
| `deployed-surface.skills.golden.txt`     | `scanSkills(ai/skills)` — what `sync-skills` mirrors  | any task that adds/removes/renames a file under `ai/skills/`                             |
| `deployed-surface.tarball.golden.txt`    | `npm pack --dry-run --json` file list                 | any task that changes `package.json` `files`/`.npmignore` or adds/removes a shipped file |

A drift in any of these three is expected and healthy when a task deliberately changes what ships —
regenerate the golden as part of that task, not as an unrelated fix. A drift with no such task is the
signal this golden exists to catch: an accidental addition (e.g. a stray fixture) or removal on the
surface a consumer actually receives.

The fourth `it` in `deployed-surface.test.ts` ("ships no file … with a developer home-directory path
leak") is not a golden comparison — it is an unconditional invariant with no owner-of-drift column: it
must always pass, on every run, forever.
