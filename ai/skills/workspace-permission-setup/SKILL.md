---
name: workspace-permission-setup
description: Configure .claude/settings.json so the agent works autonomously inside the current repository while being auto-denied access to anything outside it (home directory, system paths, network, secrets). Use when the user wants to enable AI-first development with minimal permission prompts, scope the agent to a workspace, set up safe autonomy for a project, stop the agent from leaving the repo, reduce repetitive approval requests, or harden permissions for a codebase.
---

# Workspace Permission Setup

Set up `.claude/settings.json` so the agent operates fully autonomously **inside** the current repository, and is **auto-denied** (not prompted) for anything **outside** it. Goal: enable AI-first development without sacrificing safety.

## Core principle

- **Wide allow inside repo** — file edits, project tooling, git, common shell utilities.
- **Hard deny outside repo** — `~/`, `/etc`, `/var`, `.ssh`, `.aws`, network commands, `WebFetch`/`WebSearch`, secrets.
- `deny` always wins over `allow` — the agent gets a refusal, not a prompt, so the user is not interrupted.

## Workflow

Always run all six steps in order. Never write to disk before Step 5 user approval.

### Step 1 — Detect project context

Determine repo root and stack so allow-list is tailored, not generic.

```bash
git rev-parse --show-toplevel 2>/dev/null || pwd
ls -la package.json pyproject.toml Cargo.toml go.mod Gemfile pom.xml build.gradle Makefile Dockerfile docker-compose.yml mise.toml .tool-versions 2>/dev/null
ls -la .claude/ 2>/dev/null
```

Map detection → allow additions:

| Detected | Add to allow |
|---|---|
| `package.json` | `Bash(npm:*)`, `Bash(npx:*)`, `Bash(pnpm:*)`, `Bash(yarn:*)`, `Bash(node:*)` |
| `pyproject.toml` / `requirements.txt` | `Bash(python:*)`, `Bash(python3:*)`, `Bash(pip:*)`, `Bash(uv:*)`, `Bash(poetry:*)`, `Bash(pytest:*)` |
| `Cargo.toml` | `Bash(cargo:*)`, `Bash(rustc:*)` |
| `go.mod` | `Bash(go:*)`, `Bash(gofmt:*)` |
| `Gemfile` | `Bash(bundle:*)`, `Bash(rake:*)`, `Bash(rspec:*)` |
| `Makefile` | `Bash(make:*)` |
| `Dockerfile` / `docker-compose.yml` | (do **not** auto-allow `docker` — ask in Step 4) |
| `mise.toml` / `.tool-versions` | `Bash(mise:*)` |

Also read existing `.claude/settings.json` and `.claude/settings.local.json`. **Preserve** other sections — only the `permissions` block is replaced.

### Step 2 — Harvest from transcript history

Invoke the `fewer-permission-prompts` skill via the Skill tool. It scans recent transcripts and extracts safe read-only commands the user has been approving repeatedly. Capture its proposal but **do not** let it write — we will merge into our config in Step 3.

If the skill is not available or returns nothing useful, skip — Steps 1 and 3 give a working baseline.

### Step 3 — Build the proposed config

Three sources merged into one block:

1. **Universal scoping** (deny + baseline allow — always present).
2. **Project-specific allow** (from Step 1).
3. **Transcript-derived allow** (from Step 2).

#### Universal scoping deny — always include

```json
"deny": [
  "WebFetch",
  "WebSearch",

  "Read(~/**)",
  "Edit(~/**)",
  "Write(~/**)",
  "Read(/etc/**)",
  "Read(/var/**)",
  "Read(/private/**)",
  "Read(/tmp/**)",

  "Read(./.env*)",
  "Read(./**/.env*)",
  "Read(./.git/config)",

  "Bash(curl:*)",
  "Bash(wget:*)",
  "Bash(ssh:*)",
  "Bash(scp:*)",
  "Bash(rsync:*)",
  "Bash(nc:*)",
  "Bash(cd ..*)",
  "Bash(cd /*)",
  "Bash(cd ~*)",
  "Bash(rm -rf:*)",
  "Bash(sudo:*)"
]
```

If sensitive directories exist on the machine (`~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config`, `~/Library`), add explicit absolute-path denies — `~` patterns may not always expand, so be belt-and-suspenders:

```json
"Read(/Users/<user>/.ssh/**)",
"Read(/Users/<user>/.aws/**)",
"Read(/Users/<user>/.gnupg/**)",
"Read(/Users/<user>/.config/**)",
"Read(/Users/<user>/Library/**)"
```

Use `$HOME` or detect actual user from `whoami` / `echo $HOME`.

#### Universal allow baseline — always include

```json
"allow": [
  "Read",
  "Grep",
  "Glob",
  "Edit",
  "Write",
  "Bash(git:*)",
  "Bash(ls:*)",
  "Bash(cat:*)",
  "Bash(head:*)",
  "Bash(tail:*)",
  "Bash(grep:*)",
  "Bash(rg:*)",
  "Bash(find . *)",
  "Bash(sed:*)",
  "Bash(awk:*)",
  "Bash(jq:*)",
  "Bash(diff:*)",
  "Bash(wc:*)",
  "Bash(echo:*)",
  "Bash(pwd)",
  "Bash(mkdir:*)",
  "Bash(touch:*)",
  "Bash(mv:*)",
  "Bash(cp:*)"
]
```

#### Default mode

```json
"defaultMode": "acceptEdits"
```

File edits inside the repo no longer prompt.

### Step 4 — Interactive review with the user

Present the **full proposed JSON** to the user, then ask 3–5 targeted questions tied to what was detected. Do not write yet.

Standard questions (skip those that don't apply):

1. **`git push`** — allow autonomously, or keep asking? Default recommendation: **ask** (irreversible, affects remote).
2. **Package install** (`npm install`, `pip install`, `cargo add`, etc.) — allow autonomously, or ask? Default recommendation: **ask** (mutates lockfile, pulls supply chain).
3. **`docker:*`** (if Dockerfile detected) — allow, ask, or deny?
4. **`WebFetch`** — currently denied. Need it for fetching external docs? Default recommendation: **keep denied**, agent should ask explicitly when needed.
5. **Anything project-specific** — extra CLIs (`terraform`, `kubectl`, `aws`, `gcloud`, custom scripts in `./bin/`)?

Apply answers to the config and show the final version once more.

### Step 5 — Write the config (only after explicit approval)

Wait for unambiguous user approval ("yes", "ok, write", "go").

Then merge with any existing `.claude/settings.json`:

- **Preserve** all top-level keys other than `permissions` (e.g., `env`, `hooks`, `model`, `statusLine`).
- **Replace** the `permissions` block with the new merged result.
- Use Edit (if file exists) or Write (if not) — never shell redirection.

**Do not touch `.claude/settings.local.json`** — that is the user's personal, gitignored layer.

### Step 6 — Verify and explain

Show the final file content and explain in 4–5 lines:

1. Default mode is `acceptEdits` → file edits in the repo run without prompting.
2. Off-workspace paths (`~`, `/etc`, `.ssh`, etc.) are now **auto-denied** — the agent will not interrupt to ask.
3. `WebFetch`/`WebSearch` are denied → agent won't try to leave the repo for info unless user explicitly relaxes the rule.
4. Suggest one quick smoke test: ask the agent to read `~/.ssh/known_hosts`, confirm it gets denied without prompting.
5. Mention `Shift+Tab` switches modes if user wants to temporarily relax for one task.

## Honest limits

Bash cannot be perfectly sandboxed via deny patterns alone — an agent can use `bash -c "..."`, `eval`, command substitution, environment manipulation. The patterns block the obvious, common escape paths (`curl`, `cd ..`, `sudo`), which is enough for ~95% of real-world risk. For genuine sandbox guarantees, mention these as follow-ups (do not implement here):

- Run Claude Code inside a **devcontainer** (https://code.claude.com/docs/en/devcontainer).
- Add a **PreToolUse hook** that parses every Bash command and rejects cwd escapes.

## Anti-patterns — never do these

- Do not overwrite `.claude/settings.json` — always merge other sections.
- Do not write before explicit user approval in Step 5.
- Do not allow-list `Bash(curl:*)`, `Bash(wget:*)`, broad `Bash(*)`, or `Bash(sudo:*)`.
- Do not put deny rules in `.claude/settings.local.json` — security policy belongs in the committed `settings.json` so the whole team inherits it.
- Do not delete the user's existing `settings.local.json` allow rules — they may have been hand-tuned for personal workflows.
- Do not skip Step 4 questions — the difference between "agent can `git push` at 3am" and "agent asks first" matters and is project-specific.
