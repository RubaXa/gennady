---
name: sdd-hooks-install
description: Install Claude Code hooks for live SDD subagent progress streaming. Adds PreToolUse / PostToolUse / SubagentStop entries to project's .claude/settings.json (merging with existing config), ensures .claude/sdd-progress.ndjson is gitignored, prints the operator's tail command. Use once per project before running /sdd-execute or /sdd-execute-batch when live progress visibility is wanted. Idempotent — safe to re-run.
compatibility: opencode
---

<SDDHooksInstaller role="config-bootstrapper">
You install hooks into the CURRENT project to enable live SDD progress tailing. You do NOT install global hooks (those would fire on every project). Idempotent — re-running detects existing entries and skips duplicates.

<Protocol>
1. **Verify project context:**
   - cwd has `.git/` OR a `.claude/` directory OR an `.ai/` directory → proceed.
   - Otherwise → halt: "Not a project root. Run from project's working directory."

2. **Ensure `.claude/` exists:**
   - `mkdir -p .claude`

3. **Patch `.claude/settings.json`:**
   - File missing → write a fresh one with the hooks block below.
   - File exists → parse JSON. Merge: under `.hooks`, add `PreToolUse`, `PostToolUse`, `SubagentStop` entries. If a matcher with same `command` already exists, skip. Preserve existing hooks.
   - Write back with 2-space indent.

   Hooks block to add:
   ```jsonc
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "*",
           "hooks": [
             {
               "type": "command",
               "command": "jq -nc --arg ts \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\" --arg tool \"$CLAUDE_HOOK_TOOL_NAME\" --arg agent \"${CLAUDE_HOOK_PARENT_TOOL_USE_ID:-}\" '{ts:$ts, kind:\"pre\", tool:$tool, agent:$agent}' >> .claude/sdd-progress.ndjson"
             }
           ]
         }
       ],
       "PostToolUse": [
         {
           "matcher": "*",
           "hooks": [
             {
               "type": "command",
               "command": "jq -nc --arg ts \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\" --arg tool \"$CLAUDE_HOOK_TOOL_NAME\" --arg agent \"${CLAUDE_HOOK_PARENT_TOOL_USE_ID:-}\" '{ts:$ts, kind:\"post\", tool:$tool, agent:$agent}' >> .claude/sdd-progress.ndjson"
             }
           ]
         }
       ],
       "SubagentStop": [
         {
           "hooks": [
             {
               "type": "command",
               "command": "jq -nc --arg ts \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\" --arg sess \"${CLAUDE_HOOK_SESSION_ID:-}\" '{ts:$ts, kind:\"subagent_stop\", session:$sess}' >> .claude/sdd-progress.ndjson"
             }
           ]
         }
       ]
     }
   }
   ```

4. **Patch `.gitignore`:**
   - Append `.claude/sdd-progress.ndjson` if not already listed.
   - Create `.gitignore` with that single line if missing.

5. **Verify `jq` is available** (Bash `command -v jq`). If missing → emit warning: "jq not found — install via `brew install jq` or `apt install jq` for hook scripts to work."

6. **Print to operator** (final message):
   ```
   ✅ SDD hooks installed in <project-root>/.claude/settings.json
   ✅ .gitignore updated to exclude sdd-progress.ndjson

   To watch live progress in a second terminal:
       tail -f .claude/sdd-progress.ndjson | jq -r '"\(.ts) | \(.kind) | \(.tool // .session) | agent=\(.agent // "-")"'

   Now run /sdd-execute <TSK-NN> or /sdd-execute-batch in this terminal.

   To uninstall: edit .claude/settings.json and remove the SDD entries.
   ```
</Protocol>

<HardForbidden>
- Modifying global `~/.claude/settings.json` (this is per-project setup).
- Overwriting existing settings.json — must merge, preserving operator's other hooks.
- Adding the file outside .gitignore (would commit operator activity logs).
- Running the install if jq is unavailable without the warning (hooks would silently fail).
</HardForbidden>
</SDDHooksInstaller>
