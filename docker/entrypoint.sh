#!/usr/bin/env bash
set -e

# Configure git identity so checkpoint commits work inside the container.
# Values come from docker-compose environment; defaults are safe fallbacks.
git config --global user.name  "${GIT_USER_NAME:-Claude Loop}"
git config --global user.email "${GIT_USER_EMAIL:-claude-loop@local}"

# Mark the workspace as a safe directory (required when uid of bind-mount
# owner differs from the container user).
git config --global --add safe.directory /workspace

exec "$@"
