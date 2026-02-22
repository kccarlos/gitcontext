#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PRD_PATH="$ROOT_DIR/.agents/tasks/prd-gitcontext.json"
LOG_DIR="$ROOT_DIR/.codex/ralph-gitcontext/logs"
VERIFY_DIR="$ROOT_DIR/.codex/ralph-gitcontext/verify"

mkdir -p "$LOG_DIR" "$VERIFY_DIR"
cd "$ROOT_DIR"

if ! command -v ralph >/dev/null 2>&1; then
  echo "Error: ralph is not installed or not in PATH" >&2
  echo "Install: npm i -g @iannuttall/ralph" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is not installed or not in PATH" >&2
  exit 1
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "Error: claude is not installed or not in PATH" >&2
  echo "Install: npm i -g @anthropic-ai/claude-code" >&2
  exit 1
fi

if [ ! -f "$PRD_PATH" ]; then
  echo "Error: PRD file not found at $PRD_PATH" >&2
  echo "Create one with: ./.agents/ralph/loop.sh prd \"<feature request>\"" >&2
  exit 1
fi

if ! git -c user.useConfigOnly=true var GIT_AUTHOR_IDENT >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Error: git author identity is not configured in this container.
Loop checkpoint commits run after each iteration and require identity.

Configure once (persists in repo .git/config):
  git config user.name "Claude Loop"
  git config user.email "claude-loop@local"

Or export environment variables for this shell:
  export GIT_AUTHOR_NAME="Claude Loop"
  export GIT_AUTHOR_EMAIL="claude-loop@local"
  export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
  export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
EOF
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: working tree is not clean. Commit or stash existing changes before starting loop." >&2
  git status --short >&2
  exit 1
fi

while true; do
  integrity_count="$(jq '[.stories[] | select((((.status // "open") | ascii_downcase) == "done") and (.passes != true))] | length' "$PRD_PATH")"
  if [ "$integrity_count" -ne 0 ]; then
    echo "Error: PRD integrity violation (status=done with passes=false)." >&2
    jq -r '.stories[] | select((((.status // "open") | ascii_downcase) == "done") and (.passes != true)) | "- \(.id // "(unknown)")"' "$PRD_PATH" >&2
    exit 1
  fi

  remaining="$(jq '[.stories[] | select(.passes != true)] | length' "$PRD_PATH")"
  if [ "$remaining" -eq 0 ]; then
    echo "No remaining stories with passes=false. Stopping loop."
    break
  fi

  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  log_file="$LOG_DIR/loop-${ts//:/-}.log"

  echo "Running Ralph iteration (remaining stories: $remaining)"
  if ! ralph build 1 --prd .agents/tasks/prd-gitcontext.json --agent=claude --no-commit 2>&1 | tee "$log_file"; then
    echo "Ralph iteration failed. See $log_file" >&2
    exit 1
  fi

  git add -A
  if git diff --cached --quiet; then
    echo "No changes detected; skipping commit."
  else
    if ! git commit -m "chore(loop): checkpoint $ts"; then
      echo "Checkpoint commit failed; fix git identity/hook errors, then rerun loop." >&2
      exit 1
    fi
  fi
done
