#!/usr/bin/env bash
# @file: Controlled runner + telemetry for the cloud-ios v1→v2 migration eval — replaces ad-hoc inline
#   commands with one script that resets the fixture, captures the pre-run baseline, launches the
#   flow-eval worker, and prints a deterministic SUMMARY (FLOW_VERSION + migration-introduced findings).
# @usage:
#   migration-eval.sh run     [runid]   — reset fixture, run the eval to completion, print SUMMARY
#   migration-eval.sh status  [runid]   — one-line progress of a run in flight (obs count, last activity)
#   migration-eval.sh grade   [runid]   — re-grade the current fixture on demand (state + sdd-check delta)
# Deterministic: every path is fixed; safe to re-run (idempotent fixture reset). No hidden globals.
set -euo pipefail

REPO="${REPO:-/Users/k.lebedev/Developer/cloud-ios}"
GEN_ROOT="${GEN_ROOT:-/Users/k.lebedev/Developer/gennady/.claude/worktrees/sdd-v2-rc52-followup}"
GEN="$GEN_ROOT/dist/gennady.js"
BASE="${BASE:-9c04a878b0}"                                   # pre-IB-005 commit (v1)
SCENARIO="${SCENARIO:-/private/tmp/claude-503/-Users-k-lebedev-Developer-gennady/03fc426d-e383-4254-ac40-6ef94427dfa4/scratchpad/mig-cloud-ios.json}"
BASEURL="${BASEURL:-http://127.0.0.1:4098}"
MODEL="${MODEL:-llm-proxy/deepseek-v4-flash}"
MAX_OBS="${MAX_OBS:-40}"
RUNID="${2:-r$(date +%s)}"
FX="/Users/k.lebedev/.gennady/eval/cloud-ios/fixture-mig-run"
LOG="$GEN_ROOT/ai/flow-eval/.results/migration-$RUNID.log"
BR="eval/run/migration/$RUNID"

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
hist() { node "$GEN" sdd-check --all "$1" 2>&1 | grep -oE "error: [A-Z_]+|warn: [A-Z_]+" | sort | uniq -c | sort -rn || true; }
flow() { node "$GEN" sdd-state "$1" 2>&1 | grep -E "^FLOW_VERSION" || echo "FLOW_VERSION=?"; }

# Enforce the ~/Developer/ rule BEFORE touching anything (run/prep/execute) — see
# ai/flow-eval/docs/03-SETUP.md. Fails fast and loud, not mid-operation.
"$GEN_ROOT/ai/flow-eval/scripts/require-developer-repo.sh" "$REPO"

reset_fixture() {
  log "reset fixture → base $BASE"
  git -C "$REPO" worktree remove --force "$FX" 2>/dev/null || true
  git -C "$REPO" worktree prune
  git -C "$REPO" branch -D "$BR" 2>/dev/null || true
  git -C "$REPO" worktree add -q -b "$BR" "$FX" "$BASE"
  cp -R "$GEN_ROOT/ai/directives/sdd-v2" "$FX/ai/directives/sdd-v2"
}

case "${1:-run}" in
  run)
    mkdir -p "$(dirname "$LOG")"
    reset_fixture
    log "v1 baseline (pre-worker):"; flow "$FX"; hist "$FX" | sed 's/^/    /'
    local_root="$(node --import tsx "$GEN_ROOT/ai/flow-eval/scripts/sandbox.ts" prepare)"
    # Budget: harness aborts the worker at WALLCLOCK ms (scenario.budgetMs also enforces per-scenario);
    # the OS `timeout` is a hard backstop that SIGKILLs the whole tree if the harness itself hangs.
    WALLCLOCK="${WALLCLOCK:-300000}"                       # 5 min harness wall-clock
    TIMEOUT_S="${TIMEOUT_S:-390}"                          # OS hard kill = budget + cleanup margin
    TO=""; command -v gtimeout >/dev/null 2>&1 && TO="gtimeout -k 15 ${TIMEOUT_S}s"
    [ -z "$TO" ] && command -v timeout >/dev/null 2>&1 && TO="timeout -k 15 ${TIMEOUT_S}s"
    log "launch worker (model=$MODEL, max-obs=$MAX_OBS, wall-clock=${WALLCLOCK}ms, os-timeout=${TO:-none}) → $LOG"
    $TO npm --prefix "$GEN_ROOT" run sdd-flow-eval -- \
      --scenario-file "$SCENARIO" --directory "$local_root" --gennady-root "$GEN_ROOT" \
      --base-url "$BASEURL" --model "$MODEL" --judge-model "$MODEL" --concurrency 1 \
      --observe-every-ms 45000 --stuck-after 4 --max-observations "$MAX_OBS" \
      --max-wall-clock-ms "$WALLCLOCK" > "$LOG" 2>&1 || true
    node -e "require('fs').rmSync('$local_root',{recursive:true,force:true})" 2>/dev/null || true
    echo "──────── SUMMARY ($RUNID) ────────"
    grep -E "migration: (PASS|FAIL)" "$LOG" | tail -1 || echo "no grade line (worker did not finish)"
    grep -E "usage: total=" "$LOG" | tail -1 || true
    log "post-run FLOW_VERSION + findings:"; flow "$FX"; hist "$FX" | sed 's/^/    /'
    ;;
  status)
    [ -f "$LOG" ] || { echo "no log for $RUNID"; exit 0; }
    obs=$(grep -c "MIG-cloud-ios-infra: status=" "$LOG" 2>/dev/null || echo 0)
    last=$(grep -oE "status=[a-z]+ .*stuck=[a-z]+|tail=assistant: .{0,90}" "$LOG" | tail -2 | tr '\n' ' ')
    printf 'run=%s obs=%s/%s | %s\n' "$RUNID" "$obs" "$MAX_OBS" "$last"
    ;;
  grade)
    flow "$FX"; hist "$FX"
    ;;
  *) echo "usage: migration-eval.sh <run|status|grade> [runid]"; exit 2 ;;
esac
