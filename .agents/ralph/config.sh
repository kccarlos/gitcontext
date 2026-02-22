#!/usr/bin/env bash

export DEFAULT_AGENT="claude"
export ACTIVITY_CMD=".agents/ralph/log-activity.sh"

# Model for all loop iterations and PRD generation.
# Options: claude-opus-4-6 | claude-sonnet-4-6 | claude-haiku-4-5-20251001
# Prompt is piped via stdin — no {prompt} placeholder needed.
export AGENT_CLAUDE_CMD='claude -p --model claude-opus-4-6 --dangerously-skip-permissions'
