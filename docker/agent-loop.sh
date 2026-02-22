#!/usr/bin/env bash
# agent-loop.sh — run Claude Code iteratively until verification passes or
# max iterations are exhausted.
#
# Usage:
#   ./docker/agent-loop.sh <prompt_file> [max_iterations]
#
# Environment variables:
#   VERIFY_CMD   — override the default verification command
#                  (must exit 0 on success, non-zero on failure)
#   ANTHROPIC_API_KEY — required by Claude Code

set -euo pipefail

PROMPT_FILE="${1:?Usage: $0 <prompt_file> [max_iterations]}"
MAX_ITERATIONS="${2:-5}"

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Error: prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

# ─── Verification ────────────────────────────────────────────────────────────
# Default checks: frontend typecheck + build, Rust fmt + clippy + check.
# Override via VERIFY_CMD env var for custom workflows.
default_verify() {
  echo "--- [verify] npm install ---"
  npm install --silent 2>&1 | tail -5

  echo "--- [verify] web build ---"
  npm run web:build

  echo "--- [verify] cargo fmt check ---"
  cargo fmt --check --manifest-path apps/desktop/src-tauri/Cargo.toml

  echo "--- [verify] cargo clippy ---"
  cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings

  echo "--- [verify] cargo check ---"
  cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
}

run_verify() {
  if [[ -n "${VERIFY_CMD:-}" ]]; then
    eval "$VERIFY_CMD"
  else
    default_verify
  fi
}

# ─── Loop ────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Claude Code Agent Loop                      ║"
echo "║  Prompt : $PROMPT_FILE"
echo "║  Max    : $MAX_ITERATIONS iterations         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

for i in $(seq 1 "$MAX_ITERATIONS"); do
  echo "┌─ Iteration $i / $MAX_ITERATIONS ─────────────────────────────"
  echo ""

  # Run Claude Code non-interactively with the full prompt
  claude --dangerously-skip-permissions -p "$(cat "$PROMPT_FILE")"

  echo ""
  echo "├─ Verification ─────────────────────────────────────────────"
  if run_verify; then
    echo ""
    echo "└─ ✓ VERIFIED — all checks passed on iteration $i"
    echo ""

    # Commit whatever the agent changed as a checkpoint
    if git diff --quiet && git diff --staged --quiet; then
      echo "No file changes to commit."
    else
      git add -A
      git commit -m "chore: agent checkpoint (iteration $i/$MAX_ITERATIONS)"
      echo "Checkpoint committed."
    fi

    exit 0
  else
    echo ""
    echo "└─ ✗ Verification failed on iteration $i — retrying..."
  fi
  echo ""
done

echo "✗ Max iterations ($MAX_ITERATIONS) reached without passing verification."
exit 1
