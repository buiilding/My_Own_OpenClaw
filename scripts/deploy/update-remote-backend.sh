#!/usr/bin/env bash
# Runs the update remote backend workflow for the developer CLI and automation tooling.

set -euo pipefail

usage() {
  cat <<'EOF'
Update a remote WindieOS backend checkout and restart its backend service.

This script is intended to run on the backend host, usually from GitHub Actions
over SSH. It fetches the configured branch, updates the local checkout, restarts
the systemd service, then checks service and HTTP health.

Usage:
  scripts/deploy/update-remote-backend.sh [options]

Options:
  --repo-root PATH              Remote WindieOS checkout (default: /opt/windieos-live)
  --branch NAME                 Branch to deploy (default: main)
  --remote NAME                 Git remote to fetch (default: origin)
  --strategy rebase|ff-only     Update strategy (default: rebase)
  --service NAME                systemd service name (default: windieos-backend.service)
  --scope system|user           systemd scope (default: system)
  --restart-when changed|always Restart only on code change or every run (default: changed)
  --health-url URL              HTTP health URL (default: http://127.0.0.1:8765/api/embeddings/health)
  --health-timeout SECONDS      Max seconds to wait for health (default: 60)
  --success-statuses LIST       Space-separated accepted HTTP statuses (default: "200 204 401 403")
  --skip-health-check           Skip HTTP health check after restart
  -h, --help                    Show this help

Examples:
  scripts/deploy/update-remote-backend.sh --repo-root /opt/windieos-live
  scripts/deploy/update-remote-backend.sh --scope user --strategy ff-only
EOF
}

REPO_ROOT="/opt/windieos-live"
BRANCH="main"
REMOTE="origin"
STRATEGY="rebase"
SERVICE_NAME="windieos-backend.service"
SYSTEMD_SCOPE="system"
RESTART_WHEN="changed"
HEALTH_URL="http://127.0.0.1:8765/api/embeddings/health"
HEALTH_TIMEOUT_SECONDS=60
SUCCESS_STATUSES="200 204 401 403"
SKIP_HEALTH_CHECK=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root)
      REPO_ROOT="${2:-}"
      shift 2
      ;;
    --branch)
      BRANCH="${2:-}"
      shift 2
      ;;
    --remote)
      REMOTE="${2:-}"
      shift 2
      ;;
    --strategy)
      STRATEGY="${2:-}"
      shift 2
      ;;
    --service)
      SERVICE_NAME="${2:-}"
      shift 2
      ;;
    --scope)
      SYSTEMD_SCOPE="${2:-}"
      shift 2
      ;;
    --restart-when)
      RESTART_WHEN="${2:-}"
      shift 2
      ;;
    --health-url)
      HEALTH_URL="${2:-}"
      shift 2
      ;;
    --health-timeout)
      HEALTH_TIMEOUT_SECONDS="${2:-}"
      shift 2
      ;;
    --success-statuses)
      SUCCESS_STATUSES="${2:-}"
      shift 2
      ;;
    --skip-health-check)
      SKIP_HEALTH_CHECK=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

log() {
  printf '[windieos-deploy] %s\n' "$*"
}

fail() {
  printf '[windieos-deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

require_non_empty() {
  local name="$1"
  local value="$2"
  [[ -n "$value" ]] || fail "$name cannot be empty"
}

require_non_empty "--repo-root" "$REPO_ROOT"
require_non_empty "--branch" "$BRANCH"
require_non_empty "--remote" "$REMOTE"
require_non_empty "--strategy" "$STRATEGY"
require_non_empty "--service" "$SERVICE_NAME"
require_non_empty "--scope" "$SYSTEMD_SCOPE"
require_non_empty "--restart-when" "$RESTART_WHEN"

case "$STRATEGY" in
  rebase|ff-only) ;;
  *) fail "--strategy must be rebase or ff-only" ;;
esac

case "$SYSTEMD_SCOPE" in
  system|user) ;;
  *) fail "--scope must be system or user" ;;
esac

case "$RESTART_WHEN" in
  changed|always) ;;
  *) fail "--restart-when must be changed or always" ;;
esac

if [[ "$SERVICE_NAME" != *.service ]]; then
  SERVICE_NAME="${SERVICE_NAME}.service"
fi

[[ -d "$REPO_ROOT" ]] || fail "Repo root does not exist: $REPO_ROOT"
command -v git >/dev/null 2>&1 || fail "git is required"
command -v systemctl >/dev/null 2>&1 || fail "systemctl is required"

cd "$REPO_ROOT"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Not a git checkout: $REPO_ROOT"

if ! git diff --quiet --ignore-submodules --; then
  fail "Tracked worktree changes exist in $REPO_ROOT; refusing automatic deploy"
fi

if ! git diff --cached --quiet --ignore-submodules --; then
  fail "Staged changes exist in $REPO_ROOT; refusing automatic deploy"
fi

current_branch="$(git symbolic-ref --quiet --short HEAD || true)"
[[ -n "$current_branch" ]] || fail "Checkout is detached; refusing automatic deploy"

if [[ "$current_branch" != "$BRANCH" ]]; then
  log "Switching from $current_branch to $BRANCH"
  git switch "$BRANCH"
fi

old_rev="$(git rev-parse HEAD)"
log "Current revision: $old_rev"
log "Fetching $REMOTE/$BRANCH"
git fetch --prune "$REMOTE" "+refs/heads/${BRANCH}:refs/remotes/${REMOTE}/${BRANCH}"

remote_ref="${REMOTE}/${BRANCH}"
remote_rev="$(git rev-parse "$remote_ref")"
log "Remote revision:  $remote_rev"

if [[ "$STRATEGY" == "rebase" ]]; then
  log "Rebasing local $BRANCH on $remote_ref"
  if ! git rebase "$remote_ref"; then
    git rebase --abort >/dev/null 2>&1 || true
    fail "Rebase failed; checkout restored to the pre-deploy state"
  fi
else
  log "Fast-forwarding local $BRANCH to $remote_ref"
  git merge --ff-only "$remote_ref"
fi

new_rev="$(git rev-parse HEAD)"
if [[ "$old_rev" == "$new_rev" ]]; then
  log "Checkout already up to date at $new_rev"
else
  log "Updated checkout: $old_rev -> $new_rev"
fi

SYSTEMCTL=(systemctl)
if [[ "$SYSTEMD_SCOPE" == "user" ]]; then
  SYSTEMCTL=(systemctl --user)
elif [[ "${EUID}" -ne 0 ]]; then
  command -v sudo >/dev/null 2>&1 || fail "sudo is required to restart system service as non-root"
  SYSTEMCTL=(sudo -n systemctl)
fi

should_restart=0
if [[ "$RESTART_WHEN" == "always" || "$old_rev" != "$new_rev" ]]; then
  should_restart=1
fi

if ((should_restart)); then
  log "Restarting $SYSTEMD_SCOPE service $SERVICE_NAME"
  "${SYSTEMCTL[@]}" restart "$SERVICE_NAME"
else
  log "Skipping restart because no checkout change was applied"
fi

log "Checking $SERVICE_NAME state"
"${SYSTEMCTL[@]}" is-active --quiet "$SERVICE_NAME"

if ((SKIP_HEALTH_CHECK)); then
  log "Skipping HTTP health check"
  exit 0
fi

command -v curl >/dev/null 2>&1 || fail "curl is required for health checks"

deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
last_status=""
while ((SECONDS <= deadline)); do
  last_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" || true)"
  for status in $SUCCESS_STATUSES; do
    if [[ "$last_status" == "$status" ]]; then
      log "Health check passed: $HEALTH_URL returned $last_status"
      exit 0
    fi
  done
  sleep 2
done

fail "Health check did not return one of [$SUCCESS_STATUSES] within ${HEALTH_TIMEOUT_SECONDS}s; last status: ${last_status:-none}"
