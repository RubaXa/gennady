#!/usr/bin/env bash
# @file: eval:live — единый воспроизводимый вход для live-эвала reviewer-пайплайна agent-inbox.
#   Инкапсулирует весь рецепт (поднять opencode serve при необходимости → свежий temp state-dir
#   под ~/.gennady/scratch → Playwright EVAL_LIVE-прогон на реальном MR → скриншоты + eval-report)
#   за ОДНОЙ командой. Оператор (и Claude) запускают одну allowlisted-команду вместо широкого
#   набора форм, каждая из которых иначе триггерит запрос прав.
# @consumers: `npm run eval:live -- --mr <url>`
# @tasks: TSK-123
set -euo pipefail

# ── args ─────────────────────────────────────────────────────────────────────
MR_URL="https://gitlab.corp.mail.ru/vk-workspace/superapp/-/merge_requests/571"
OPENCODE_PORT="${OPENCODE_PORT:-4096}"
while [ $# -gt 0 ]; do
  case "$1" in
    --mr) MR_URL="$2"; shift 2 ;;
    --mr=*) MR_URL="${1#--mr=}"; shift ;;
    --port) OPENCODE_PORT="$2"; shift 2 ;;
    --port=*) OPENCODE_PORT="${1#--port=}"; shift ;;
    *) echo "eval:live: unknown arg: $1" >&2; exit 2 ;;
  esac
done

# ── preconditions ────────────────────────────────────────────────────────────
if [ -z "${GITLAB_PERSONAL_TOKEN:-}" ]; then
  echo "eval:live: GITLAB_PERSONAL_TOKEN не задан — экспортируйте его (реальный fetch MR требует токен)." >&2
  exit 3
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

# opencode ходит к провайдеру напрямую; корпоративный squid его режет (см. память opencode-run-env).
unset HTTPS_PROXY HTTP_PROXY https_proxy http_proxy || true

SCRATCH="$HOME/.gennady/scratch"
mkdir -p "$SCRATCH"
MR_SLUG="$(printf '%s' "$MR_URL" | sed 's#[^a-zA-Z0-9]#_#g' | tail -c 40)"
STATE_DIR="$SCRATCH/live-${MR_SLUG}-$$"
mkdir -p "$STATE_DIR/agent-inbox"

# Сеем конфиг в свежий temp state-dir: bootstrap в production-режиме (mocks:false) требует
# сконфигурированный dir, иначе падает "agent-inbox не настроен". Копируем host-конфиг оператора
# (host/reposBase — без токена, он живёт в GITLAB_PERSONAL_TOKEN). Делает прогон воспроизводимым:
# любой чистый state-dir становится рабочим без ручной подготовки.
HOST_CONFIG="$HOME/.gennady/agent-inbox/config.json"
if [ ! -f "$HOST_CONFIG" ]; then
  echo "eval:live: нет $HOST_CONFIG — сначала настройте: gennady inbox config --init" >&2
  exit 5
fi
cp "$HOST_CONFIG" "$STATE_DIR/agent-inbox/config.json"

# ── ensure opencode serve ────────────────────────────────────────────────────
OPENCODE_STARTED=""
if curl -s -m 3 "http://localhost:${OPENCODE_PORT}/doc" >/dev/null 2>&1; then
  echo "eval:live: переиспользую opencode serve на :${OPENCODE_PORT}"
else
  echo "eval:live: поднимаю opencode serve на :${OPENCODE_PORT}"
  opencode serve --port "$OPENCODE_PORT" >"$SCRATCH/opencode-serve.log" 2>&1 &
  OPENCODE_STARTED=$!
  READY=""
  for _ in $(seq 1 30); do
    if curl -s -m 3 "http://localhost:${OPENCODE_PORT}/doc" >/dev/null 2>&1; then READY=1; break; fi
    sleep 1
  done
  if [ -z "$READY" ]; then
    echo "eval:live: opencode serve не поднялся за 30с — см. $SCRATCH/opencode-serve.log" >&2
    exit 4
  fi
fi

cleanup() {
  [ -n "$OPENCODE_STARTED" ] && kill "$OPENCODE_STARTED" 2>/dev/null || true
}
trap cleanup EXIT

# ── run the live eval ────────────────────────────────────────────────────────
echo "eval:live: MR=$MR_URL stateDir=$STATE_DIR port=$OPENCODE_PORT"
EVAL_LIVE=1 \
EVAL_MR_URL="$MR_URL" \
GENNADY_STATE_DIR="$STATE_DIR" \
OPENCODE_PORT="$OPENCODE_PORT" \
  npx playwright test --config=e2e/inbox-serve/playwright.config.ts reviewer-eval.spec.ts

echo
echo "eval:live: скриншоты → e2e/inbox-serve/test-results/screenshots/"
ls -1 e2e/inbox-serve/test-results/screenshots/eval-real-*.png 2>/dev/null || true
