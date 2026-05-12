#!/bin/bash
# @purpose Обнаружение среды выполнения AI-агента, проверка доступности CLI и генерация XML-снимка окружения для инициализации фреймворка

# START_RUNTIME_DETECTION
FW_AGENT_NAME="unknown"

if [ -n "$CURSOR_AGENT" ]; then
    FW_AGENT_NAME="cursor"
    echo "[INFO] [RUNTIME_DETECTION] AGENT_NAME=cursor"
elif [ -n "$CLAUDE_CODE" ]; then
    FW_AGENT_NAME="claude_code"
    echo "[INFO] [RUNTIME_DETECTION] AGENT_NAME=claude_code"
elif [ -n "$WINDSURF_CASCADE_TERMINAL_KIND" ]; then
    FW_AGENT_NAME="windsurf"
    echo "[INFO] [RUNTIME_DETECTION] AGENT_NAME=windsurf"
elif [ -n "$OPENHANDS_AGENT" ]; then
    FW_AGENT_NAME="open_code"
    echo "[INFO] [RUNTIME_DETECTION] AGENT_NAME=open_code"
else
    echo "[WARN] [RUNTIME_DETECTION] AGENT_NAME=unknown"
fi
# END_RUNTIME_DETECTION

# START_CLI_CHECK
FW_AGENT_CLI_SUPPORT="false"
FW_AGENT_CLI_PATH=""

case $FW_AGENT_NAME in
    # START_CLI_CHECK_CURSOR
    "cursor")
        if command -v agent >/dev/null 2>&1; then
            FW_AGENT_CLI_SUPPORT="true"
            FW_AGENT_CLI_PATH=$(command -v agent)
            echo "[INFO] [CLI_CHECK] CLI_AGENT_SUPPORT=true CLI_AGENT_PATH=$FW_AGENT_CLI_PATH"
        else
            echo "[WARN] [CLI_CHECK] CLI_AGENT_SUPPORT=false CLI_AGENT_PATH=none"
        fi
        ;;
    # END_CLI_CHECK_CURSOR

    # START_CLI_CHECK_CLAUDE_CODE
    "claude_code")
        if command -v claude >/dev/null 2>&1; then
            FW_AGENT_CLI_SUPPORT="true"
            FW_AGENT_CLI_PATH=$(command -v claude)
            echo "[INFO] [CLI_CHECK] CLI_AGENT_SUPPORT=true CLI_AGENT_PATH=$FW_AGENT_CLI_PATH"
        else
            echo "[WARN] [CLI_CHECK] CLI_AGENT_SUPPORT=false CLI_AGENT_PATH=none"
        fi
        ;;
    # END_CLI_CHECK_CLAUDE_CODE

    # START_CLI_CHECK_DEFAULT
    *)
        echo "[DEBUG] [CLI_CHECK] CLI check skipped for agent=$FW_AGENT_NAME"
        ;;
    # END_CLI_CHECK_DEFAULT
esac
# END_CLI_CHECK

# START_ANCHOR_GENERATION
INIT_ANCHOR_ID="INIT_$(date +%s)"
echo "[INFO] [ANCHOR_GENERATION] ANCHOR_ID=$INIT_ANCHOR_ID"
# END_ANCHOR_GENERATION

# START_SESSION_GATHER
PROJECT_ROOT=$(pwd)
CURRENT_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date +%Y-%m-%d)
NODE_VERSION=$(command -v node >/dev/null 2>&1 && node -v 2>/dev/null | sed 's/^v//' || echo "")
SESSION_SHELL="${SHELL:-unknown}"
SESSION_USER="${USER:-${LOGNAME:-unknown}}"
SESSION_LANG="${LANG:-unknown}"
SESSION_PLATFORM=$(uname -s 2>/dev/null || echo "unknown")
if [ -n "$CI" ] || [ -n "$GITHUB_ACTIONS" ] || [ -n "$GITLAB_CI" ] || [ -n "$CIRCLECI" ]; then
    IS_CI="true"
else
    IS_CI="false"
fi
if [ -f "package-lock.json" ]; then
    LOCKFILE_KIND="npm"
elif [ -f "yarn.lock" ]; then
    LOCKFILE_KIND="yarn"
elif [ -f "pnpm-lock.yaml" ]; then
    LOCKFILE_KIND="pnpm"
else
    LOCKFILE_KIND="none"
fi
GIT_BRANCH=""
GIT_COMMIT=""
GIT_DIRTY="false"
GIT_REMOTE_ORIGIN=""
GIT_ROOT=""
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
    GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "")
    [ -n "$(git status --porcelain 2>/dev/null)" ] && GIT_DIRTY="true"
    GIT_REMOTE_ORIGIN=$(git config --get remote.origin.url 2>/dev/null || echo "")
    GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
fi
# END_SESSION_GATHER

# START_XML_OUTPUT
echo "<SESSION_ENV id=\"$INIT_ANCHOR_ID\" user=\"$SESSION_LANG\" shell=\"$SESSION_SHELL\" ci=\"$IS_CI\" platform=\"$SESSION_PLATFORM\">"
echo "  <FW_AGENT_NAME>$FW_AGENT_NAME</FW_AGENT_NAME>"
echo "  <FW_AGENT_CLI_SUPPORT>$FW_AGENT_CLI_SUPPORT</FW_AGENT_CLI_SUPPORT>"
echo "  <FW_AGENT_CLI_PATH>$FW_AGENT_CLI_PATH</FW_AGENT_CLI_PATH>"
echo "  <PROJECT_ROOT>$PROJECT_ROOT</PROJECT_ROOT>"
echo "  <GIT_BRANCH>$GIT_BRANCH</GIT_BRANCH>"
echo "  <GIT_COMMIT>$GIT_COMMIT</GIT_COMMIT>"
echo "  <GIT_DIRTY>$GIT_DIRTY</GIT_DIRTY>"
echo "  <GIT_REMOTE_ORIGIN>$GIT_REMOTE_ORIGIN</GIT_REMOTE_ORIGIN>"
echo "  <GIT_ROOT>$GIT_ROOT</GIT_ROOT>"
echo "  <CURRENT_DATE>$CURRENT_DATE</CURRENT_DATE>"
echo "  <NODE_VERSION>$NODE_VERSION</NODE_VERSION>"
echo "</SESSION_ENV>"
# END_XML_OUTPUT
