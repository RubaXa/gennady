#!/usr/bin/env bash
# @file: Guard — an external repository used by an eval script must live under $HOME/Developer/.
# @usage: require-developer-repo.sh <path-to-repo>
#   Exit 0 (silent) when <path-to-repo> resolves under $HOME/Developer/.
#   Exit non-zero with a Russian explanation (why / what stopped / how to fix) otherwise.
# @consumers: roundtrip-eval.sh, migration-eval.sh — called at the start of every subcommand that
#   touches an external repo (prep/run/execute), so a misplaced repo fails BEFORE anything is created
#   or modified. See ai/flow-eval/docs/RUNBOOK.md ("Правило ~/Developer/ для внешних репозиториев") for the full rationale.
set -euo pipefail

repo="${1:-}"
if [ -z "$repo" ]; then
  echo "require-developer-repo.sh: usage: require-developer-repo.sh <path-to-repo>" >&2
  exit 2
fi

# Resolve to an absolute, symlink-following path when possible; fall back to the raw value so a
# not-yet-existing path still gets a useful message instead of a crash.
if command -v realpath >/dev/null 2>&1; then
  resolved="$(realpath -m "$repo" 2>/dev/null || echo "$repo")"
else
  resolved="$repo"
fi

developer_root="$HOME/Developer"

case "$resolved" in
  "$developer_root"/*|"$developer_root")
    exit 0
    ;;
esac

repo_name="$(basename -- "$resolved")"
{
  echo "ОШИБКА: репозиторий вне ~/Developer/ — прогон прерван."
  echo
  echo "  Путь:     $repo"
  echo "  Разрешён: $resolved"
  echo "  Ожидался путь под: $developer_root"
  echo
  echo "Почему это важно: eval-скрипты (roundtrip-eval.sh, migration-eval.sh) и вспомогательные"
  echo "инструменты (session-metrics.py, session-telemetry.py) используют фиксированные абсолютные"
  echo "пути и предполагают единое расположение репозиториев на машине оператора. Репозиторий вне"
  echo "~/Developer/ ведёт к конфликту путей и настроек eval (рассинхрон REPO/GEN_ROOT, поломанные"
  echo "non-regression-сравнения) — это касается и человека-оператора, и запускающего агента."
  echo
  echo "Как починить (выбери один вариант):"
  echo "  1) Создать репозиторий под ~/Developer/ (клон или git worktree):"
  echo "       git clone <url> \"$developer_root/$repo_name\""
  echo "     или"
  echo "       git worktree add \"$developer_root/$repo_name\" <ревизия>"
  echo "  2) Если репозиторий уже существует по актуальному пути — симлинкнуть его и наполнить нужным:"
  echo "       ln -s \"$resolved\" \"$developer_root/$repo_name\""
  echo
  echo "После этого повтори прогон, указав REPO=\"$developer_root/$repo_name\" (или так, чтобы"
  echo "переменная REPO в скрипте резолвилась под ~/Developer/)."
} >&2

exit 1
