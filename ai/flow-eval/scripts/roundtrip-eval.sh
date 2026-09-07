#!/usr/bin/env bash
# @file: Controlled runner + telemetry for the cloud-ios SDD round-trip eval — proves the code half of
#   the SDD guarantee: delete the guard-script artifact, regenerate it from the migrated v2 spec + ticket
#   via the installed sdd-execute flow, then grade the regenerated script against Artur's ORIGINAL by the
#   sum of factors (the 82-probe behavioural bench + requirements coverage + format + repo rules), NOT
#   byte-for-byte. Mirrors migration-eval.sh: fixed paths, idempotent prep, deterministic SUMMARY.
# @usage:
#   roundtrip-eval.sh prep              — build the regen worktree, stash golden, delete guard, reset ticket
#   roundtrip-eval.sh execute [runid]   — run the sdd-execute worker to regenerate the guard script
#   roundtrip-eval.sh grade   [runid]   — run the frozen 82-probe bench on the regenerated guard + factors
#   roundtrip-eval.sh status  [runid]   — one-line progress of a run in flight
# The bench + Artur's guard are kept in $RT/golden (agent must never read/edit golden per the phase prompt).
# TMPDIR is normalised WITHOUT a trailing slash — see ai/flow-eval/docs/swiftlint-toolchain-setup.md.
set -euo pipefail

export PATH="/opt/homebrew/bin:$PATH"
export TMPDIR=/tmp                                            # no trailing slash: SwiftLint SIGBUS guard

REPO="${REPO:-/Users/k.lebedev/Developer/cloud-ios}"
GEN_ROOT="${GEN_ROOT:-/Users/k.lebedev/Developer/gennady/.claude/worktrees/sdd-v2-rc52-followup}"
GEN="$GEN_ROOT/dist/gennady.js"
RTBASE="${RTBASE:-d9de0f7c16}"                               # migrated v2 base (spec+tickets+guard+bench)
BASEURL="${BASEURL:-http://127.0.0.1:4098}"
MODEL="${MODEL:-llm-proxy/deepseek-v4-flash}"
MAX_OBS="${MAX_OBS:-60}"
RUNID="${2:-r$(date +%s)}"
RT="/Users/k.lebedev/.gennady/eval/cloud-ios/rt-regen"
BR="eval/run/roundtrip/regen"
GUARD="Tools/check-swiftlint-exceptions.sh"
TICKET="specs/infra-base/infra-base.task.IB-script.md"
LOG="$GEN_ROOT/ai/flow-eval/.results/roundtrip-$RUNID.log"
SCENARIO="${SCENARIO:-$GEN_ROOT/ai/flow-eval/.results/rt-execute.scenario.json}"

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

# Enforce the ~/Developer/ rule BEFORE touching anything (prep/execute) — see
# ai/flow-eval/docs/PREREQUISITES.ru.md. Fails fast and loud, not mid-operation.
"$GEN_ROOT/ai/flow-eval/scripts/require-developer-repo.sh" "$REPO"

prep() {
  log "prep regen worktree from base $RTBASE"
  git -C "$REPO" worktree remove --force "$RT" 2>/dev/null || true
  git -C "$REPO" worktree prune
  git -C "$REPO" branch -D "$BR" 2>/dev/null || true
  git -C "$REPO" worktree add -q -b "$BR" "$RT" "$RTBASE"

  log "stash golden (Artur's guard + bench + original ticket) → $RT/golden"
  mkdir -p "$RT/golden/tests"
  cp "$RT/$GUARD"            "$RT/golden/check-swiftlint-exceptions.sh"
  cp -R "$RT/Tools/tests/."  "$RT/golden/tests/"
  cp "$RT/$TICKET"           "$RT/golden/infra-base.task.IB-script.ORIGINAL.md"

  log "remove the artifact to regenerate + hide the golden bench from the worker"
  rm -f "$RT/$GUARD"
  # The golden 82-probe stand stays in golden/ (the grading instrument the worker must not read). The
  # worker rebuilds its OWN Tools/tests stand from the ticket §6 scenario list — that stand is part of the
  # IB-script deliverable, not a fixture given. So Tools/tests is removed and the scenario tells the worker
  # to (re)build it; the ticket's §5 probes.sh reference then resolves to what the worker itself creates.
  rm -rf "$RT/Tools/tests"

  # origin/master so the guard's base resolution (git merge-base HEAD origin/master) and the worker's
  # grounding of it work — the pre-guard parent commit stands in for the protected branch.
  git -C "$RT" update-ref refs/remotes/origin/master "$(git -C "$RT" rev-parse HEAD~0)" 2>/dev/null || \
    git -C "$RT" update-ref refs/remotes/origin/master "$RTBASE" 2>/dev/null || true

  log "reset ticket IB-script → TODO, clear execution log (fresh forward spec, sections 1-6 kept)"
  python3 "$GEN_ROOT/ai/flow-eval/scripts/reset-ticket.py" "$RT/$TICKET"

  # Wall 1 — upgrade every migrated ticket's §5 table to the 3-column v2 schema (sdd-task rejects the
  # old 2-column form). Wall 3 — readiness shim so this node-hardcoded branch lets a Swift repo reach
  # EXECUTION_READY (see docs/roundtrip-wall3-assessment.md; the adaptive verify lives unmerged on main).
  log "wall-1: upgrade verification tables to v2 3-column schema"
  python3 "$GEN_ROOT/ai/flow-eval/scripts/upgrade-verification-tables.py" "$RT/specs" | sed 's/^/    /'
  log "wall-3: write readiness shim package.json"
  cp "$GEN_ROOT/ai/flow-eval/scripts/roundtrip-readiness-shim.package.json" "$RT/package.json"

  git -C "$RT" add -A
  git -C "$RT" -c user.email=eval@local -c user.name=eval commit -q \
    -m "eval(roundtrip): delete guard artifact, stash golden, reopen IB-script"
  log "prep done. FLOW_VERSION:"; node "$GEN" sdd-state "$RT" 2>&1 | grep -E "^FLOW_VERSION" || true
  log "guard present? $([ -f "$RT/$GUARD" ] && echo YES-BUG || echo no-good)"
  log "golden bench present? $([ -f "$RT/golden/tests/probes.sh" ] && echo yes-good || echo NO-BUG)"
  log "ticket status: $(grep -m1 'Status:' "$RT/$TICKET")"
}

write_scenario() {
  mkdir -p "$(dirname "$SCENARIO")"
  cat > "$SCENARIO" <<JSON
[
  {
    "id": "RT-cloud-ios-IB-script",
    "phase": "execute",
    "mode": "canonical-execute",
    "directory": "$RT",
    "intent": "Execute ticket IB-script (specs/infra-base) with the installed sdd-execute flow to REBUILD its deliverables from scratch. This is a fresh regeneration: BOTH Tools/check-swiftlint-exceptions.sh AND its probe stand Tools/tests/ (probes.sh + harness.sh, the ticket §6 'permanent property') were removed and DO NOT exist yet — you create them. The ticket's §5 reference to ./Tools/tests/probes.sh means the stand you build, not a pre-existing file; build the guard first, then the stand. The spec (specs/infra-base/infra-base.spec.md, decisions D-010/D-013/D-015/D-016/D-017/D-018a) and the ticket's BDD + Test Scenario Coverage fully define the eight checks the guard must enforce. origin/master is set as the diff base. The golden/ directory is off-limits — never read it. Start writing the guard early; do not spend the budget only orienting. Environment facts (do not re-probe them): SwiftLint runs as mise exec -- swiftlint lint (from the MRCloudApp dir); the pin lives in .mise.toml; jq, git and python3 are on PATH; the GNU timeout command is NOT available on this macOS host (do not call it). Read the spec/ticket once, then WRITE Tools/check-swiftlint-exceptions.sh — orientation beyond ~10 tool calls is wasted budget.",
    "acceptance": "Tools/check-swiftlint-exceptions.sh exists, is executable, aggregates all checks (does not stop at the first), compares the baseline as a JSON set (not byte-for-byte), and honours the exit-code contract 0=clean / 1=findings / 2=environment. A rebuilt Tools/tests/ stand demonstrates both the red and green side of the ticket's scenarios.",
    "completion": {
      "artifact": "Tools/check-swiftlint-exceptions.sh",
      "ticket": "specs/infra-base/infra-base.task.IB-script.md",
      "spec": "specs/infra-base/infra-base.spec.md"
    }
  }
]
JSON
  log "scenario → $SCENARIO"
}

case "${1:-prep}" in
  prep) prep ;;
  execute)
    mkdir -p "$(dirname "$LOG")"
    [ -f "$RT/$TICKET" ] || { echo "run prep first"; exit 2; }
    # Rebuild the source dist so the worker's sandbox gets the CURRENT gennady (new sdd-log audit-receipt
    # command, group-receipt checks). Provisioning (materializeLocalCli) then refreshes the fixture's
    # node_modules/gennady/dist from this fresh dist — no stale CLI in a reused fixture.
    log "rebuild gennady dist (fresh CLI for the sandbox)"
    npm --prefix "$GEN_ROOT" run build >/dev/null 2>&1 || { echo "npm run build failed"; exit 2; }
    write_scenario
    local_root="$(node --import tsx "$GEN_ROOT/ai/flow-eval/scripts/sandbox.ts" prepare)"
    log "launch execute worker (model=$MODEL, max-obs=$MAX_OBS) → $LOG"
    npm --prefix "$GEN_ROOT" run sdd-flow-eval -- \
      --scenario-file "$SCENARIO" --directory "$local_root" --gennady-root "$GEN_ROOT" \
      --base-url "$BASEURL" --model "$MODEL" --judge-model "$MODEL" --concurrency 1 \
      --observe-every-ms 90000 --stuck-after 5 --max-observations "$MAX_OBS" > "$LOG" 2>&1 || true
    node -e "require('fs').rmSync('$local_root',{recursive:true,force:true})" 2>/dev/null || true
    echo "──────── EXECUTE SUMMARY ($RUNID) ────────"
    log "guard regenerated? $([ -f "$RT/$GUARD" ] && echo YES || echo NO)"
    [ -f "$RT/$GUARD" ] && wc -l "$RT/$GUARD"
    # Deterministic COMPLETION GATE (H4 fix): artifact-exists is NOT success. A built guard with the
    # ticket still TODO / no closed round / no audit receipt is the abandoned-artifact defect — fail it.
    metrics="$GEN_ROOT/ai/flow-eval/scripts/session-metrics.py"
    python3 "$metrics" record --run "$RUNID" \
      --session "sdd-eval:RT-cloud-ios-IB-script" --fixture "$RT" \
      --bench-out "$RT/golden/bench-regen.out" >/dev/null 2>&1 || true
    if python3 "$metrics" gate --fixture "$RT" 2>&1 | tail -6; then
      log "COMPLETION: green"
    else
      log "COMPLETION: RED — the run produced an artifact but did not complete the ticket (see reasons above)"
    fi
    ;;
  grade)
    "$GEN_ROOT/ai/flow-eval/scripts/roundtrip-grade.sh" "$RT"
    ;;
  status)
    [ -f "$LOG" ] || { echo "no log for $RUNID"; exit 0; }
    printf 'run=%s tail: %s\n' "$RUNID" "$(grep -oE 'tail=assistant: .{0,120}|status=[a-z]+' "$LOG" | tail -2 | tr '\n' ' ')"
    ;;
  *) echo "usage: roundtrip-eval.sh <prep|execute|grade|status> [runid]"; exit 2 ;;
esac
