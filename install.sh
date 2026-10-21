#!/usr/bin/env bash
# ==============================================================================
# Vexlyx — One-Line Server Installer (F5.1)
# Usage: curl -fsSL https://vexlyx.atlantiqs.org/install.sh | bash
#
# This is the thin, public entrypoint: it only figures out where the Vexlyx
# checkout lives (cloning/updating it if needed) and hands off to the real
# orchestrator at system/scripts/install/run.sh, which is versioned inside
# the repo itself so every actual install step can be reviewed, tested, and
# changed without touching this file.
#
# Which code gets installed (VEXLYX_REPO_REF):
#   unset / "latest"  the newest stable release tag (vMAJOR.MINOR.PATCH);
#                     prerelease tags such as v1.0.0-rc.1 are never chosen
#   v1.2.3            that exact release
#   main (or any branch)  the tip of that branch, for development
# An existing install that follows a branch keeps following it unless
# VEXLYX_REPO_REF is set, so re-running the installer never silently
# changes channel.
# ==============================================================================
set -euo pipefail

# Only stable releases: vMAJOR.MINOR.PATCH, no prerelease or build suffix.
RELEASE_TAG_PATTERN='^v[0-9]+\.[0-9]+\.[0-9]+$'

log() { echo "[install.sh] $*"; }
warn() { echo "[install.sh] WARNING: $*" >&2; }

# Prints the newest stable release tag on the remote, or nothing if there is
# none (or the remote cannot be reached). `sort -V` compares version numbers
# numerically, so v0.10.0 is newer than v0.9.0.
latest_release_tag() {
  { git ls-remote --tags --refs "${VEXLYX_REPO_URL}" 'v*' 2>/dev/null || true; } \
    | awk '{ sub("^refs/tags/", "", $2); print $2 }' \
    | { grep -E "${RELEASE_TAG_PATTERN}" || true; } \
    | sort -V \
    | tail -n 1
}

remote_has_tag() {
  git ls-remote --exit-code --tags --refs "${VEXLYX_REPO_URL}" "refs/tags/$1" >/dev/null 2>&1
}

# Sets TARGET_KIND ("tag" or "branch") and TARGET_NAME from VEXLYX_REPO_REF.
resolve_target() {
  local requested="${VEXLYX_REPO_REF:-latest}"

  if [[ "${requested}" == "latest" ]]; then
    local tag
    tag="$(latest_release_tag)"
    if [[ -n "${tag}" ]]; then
      TARGET_KIND="tag"
      TARGET_NAME="${tag}"
    else
      warn "No release tag found on ${VEXLYX_REPO_URL}; falling back to the main branch."
      TARGET_KIND="branch"
      TARGET_NAME="main"
    fi
  elif remote_has_tag "${requested}"; then
    TARGET_KIND="tag"
    TARGET_NAME="${requested}"
  else
    TARGET_KIND="branch"
    TARGET_NAME="${requested}"
  fi
}

describe_target() {
  if [[ "${TARGET_KIND}" == "tag" ]]; then
    echo "release ${TARGET_NAME}"
  else
    echo "branch ${TARGET_NAME} (development, not a tagged release)"
  fi
}

is_vexlyx_checkout() {
  [[ -f "$1/CLAUDE.md" && -f "$1/system/scripts/install/run.sh" ]]
}

ensure_git() {
  if ! command -v git >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y --no-install-recommends git ca-certificates
  fi
}

# Fresh install: clone the chosen tag or branch into VEXLYX_HOME.
fresh_checkout() {
  resolve_target
  log "Cloning Vexlyx $(describe_target) into ${VEXLYX_HOME}..."
  install -d -m 0755 "$(dirname "${VEXLYX_HOME}")"
  git -c advice.detachedHead=false clone --quiet --branch "${TARGET_NAME}" --depth 1 \
    "${VEXLYX_REPO_URL}" "${VEXLYX_HOME}"
}

# --- Runtime mail state that older releases tracked in git ---------------------
# Up to v0.3.0 the panel rewrote these tracked files at runtime, so every
# install was "dirty" and could never be updated. From the next release they
# are untracked runtime state. When they are the ONLY local changes, the update
# backs them up, lets git move on, and puts them back, so nothing is lost and no
# manual step is needed.
MAIL_STATE_DIRS=(docker/postfix/config docker/postfix/opendkim)
MAIL_STATE_DEV_DOMAINS=(vexlyx-test.com wp-blogs.vexlyx.localhost api.wp-blogs.vexlyx.localhost test-postfix-mailer.org test-auth.localhost)
MAIL_STATE_BACKUP=""

# Succeeds when every local change is inside the mail state directories.
mail_state_only_dirty() {
  local line path
  while IFS= read -r line; do
    path="${line:3}"
    case "${path}" in
      docker/postfix/config/* | docker/postfix/opendkim/*) ;;
      *) return 1 ;;
    esac
  done < <(git status --porcelain 2>/dev/null)
  return 0
}

# The .gitkeep placeholders stay tracked in releases that no longer track state.
mail_state_tracked_files() {
  { git ls-files -- "${MAIL_STATE_DIRS[@]}" | grep -v '/\.gitkeep$' || true; }
}

# Copies both state directories (including private DKIM keys) to a new 0700
# directory and checks the copy before anything else happens.
mail_state_backup() {
  local base="${VEXLYX_MAIL_BACKUP_DIR:-/etc/vexlyx/mail-backups}" dir
  install -d -m 0700 "${base}"
  dir="$(mktemp -d "${base}/pre-upgrade-$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")"
  chmod 0700 "${dir}"
  local d
  for d in "${MAIL_STATE_DIRS[@]}"; do
    [[ -d "${d}" ]] || continue
    mkdir -p "${dir}/${d}"
    cp -a "${d}/." "${dir}/${d}/"
    if ! diff -r -q "${d}" "${dir}/${d}" >/dev/null; then
      warn "The backup of ${d} does not match the original; not touching the checkout."
      return 1
    fi
  done
  MAIL_STATE_BACKUP="${dir}"
  log "Backed up the mail state to ${dir}."
}

# Makes the tree clean by returning the tracked state files to the committed
# version; the backup holds the live content.
mail_state_prepare() {
  mail_state_backup || return 1
  # The API is the writer; stop it so nothing is written between backup and
  # restore. The installer starts it again in a later step.
  # Only an API container that mounts THIS checkout is stopped.
  if command -v docker >/dev/null 2>&1 \
    && docker inspect -f '{{range .Mounts}}{{println .Source}}{{end}}' vexlyx-api 2>/dev/null | grep -q -F -- "$(pwd)"; then
    log "Stopping the API while the mail state is swapped."
    docker stop vexlyx-api >/dev/null 2>&1 || warn "Could not stop vexlyx-api; mail changes made now may be lost."
  fi
  local tracked
  tracked="$(mail_state_tracked_files)"
  if [[ -n "${tracked}" ]]; then
    # shellcheck disable=SC2086
    git checkout --quiet HEAD -- ${tracked}
  fi
  if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
    warn "The checkout is still not clean after setting the mail state aside; restoring it."
    mail_state_restore || true
    return 1
  fi
}

# Removes the development entries that older releases shipped (a developer's
# Windows key path and test domains). A domain is only dropped when no private
# key exists for it and no mailbox uses it, so real data is never touched.
mail_state_drop_dev_entries() {
  local opendkim=docker/postfix/opendkim config=docker/postfix/config domain file tmp
  for domain in "${MAIL_STATE_DEV_DOMAINS[@]}"; do
    compgen -G "${opendkim}/keys/${domain}/*.private" >/dev/null && continue
    if [[ -f "${config}/virtual_mailbox_maps" ]] && grep -q -F "@${domain} " "${config}/virtual_mailbox_maps"; then
      continue
    fi
    for file in KeyTable SigningTable TrustedHosts; do
      [[ -f "${opendkim}/${file}" ]] || continue
      tmp="$(mktemp)"
      # The first field names the domain exactly: "<domain>" (TrustedHosts),
      # "*@<domain>" (SigningTable) or "<selector>._domainkey.<domain>" (KeyTable).
      awk -v d="${domain}" '{
        suffix = "._domainkey." d
        if ($1 == d || $1 == "*@" d) next
        if (length($1) > length(suffix) && substr($1, length($1) - length(suffix) + 1) == suffix) next
        print
      }' "${opendkim}/${file}" >"${tmp}"
      cat "${tmp}" >"${opendkim}/${file}"
      rm -f "${tmp}"
    done
    if [[ -f "${config}/virtual_domains" ]]; then
      tmp="$(mktemp)"
      grep -v -x -F "${domain}" "${config}/virtual_domains" >"${tmp}" || true
      cat "${tmp}" >"${config}/virtual_domains"
      rm -f "${tmp}"
    fi
  done
}

# Puts the backed-up state back in place after the checkout moved on (or failed).
mail_state_restore() {
  [[ -n "${MAIL_STATE_BACKUP}" ]] || return 0
  local d
  for d in "${MAIL_STATE_DIRS[@]}"; do
    [[ -d "${MAIL_STATE_BACKUP}/${d}" ]] || continue
    mkdir -p "${d}"
    cp -a "${MAIL_STATE_BACKUP}/${d}/." "${d}/"
  done
  # Only a release that no longer tracks the files may drop the dev entries
  # and must leave a clean tree; an older commit is legitimately dirty again.
  if [[ -z "$(mail_state_tracked_files)" ]]; then
    mail_state_drop_dev_entries
    if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
      warn "The checkout is not clean after restoring the mail state. The backup is in ${MAIL_STATE_BACKUP}."
      return 1
    fi
  fi
  log "Restored the mail state (backup kept in ${MAIL_STATE_BACKUP})."
}

# Moves an existing checkout to the chosen tag or branch. Never touches a
# checkout with local changes, except runtime mail state that older releases
# tracked in git (see above). Runs from inside VEXLYX_HOME.
update_checkout() {
  if [[ ! -d .git ]]; then
    log "${VEXLYX_HOME} is not a git checkout — leaving it untouched, not updating."
    return 0
  fi
  local migrating=0 status=0
  if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
    if mail_state_only_dirty; then
      log "Only runtime mail state differs from the release; keeping it across the update."
      mail_state_prepare || return 1
      migrating=1
    else
      log "Local changes detected in ${VEXLYX_HOME} — leaving them as-is, not pulling."
      if git status --porcelain -- docker/dovecot/config/users 2>/dev/null | grep -q .; then
        log "docker/dovecot/config/users is a tracked file in this older version. To upgrade, follow"
        log "docs/dev/email/mail-credential-remediation.md (it removes publicly known mailbox credentials)."
      fi
      return 0
    fi
  fi

  move_checkout || status=$?
  if [[ "${migrating}" == 1 ]]; then
    mail_state_restore || status=1
  fi
  return "${status}"
}

# Fetches and checks out the chosen tag or branch in a clean checkout. Every
# step returns on failure itself: the caller runs this inside `||`, where
# `set -e` is switched off.
move_checkout() {
  local current_branch
  current_branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"

  if [[ -z "${VEXLYX_REPO_REF:-}" && -n "${current_branch}" ]]; then
    # An install that follows a branch keeps following it; switching to
    # releases is an explicit choice (VEXLYX_REPO_REF=latest).
    log "Following branch ${current_branch}. Set VEXLYX_REPO_REF=latest to switch to tagged releases."
    TARGET_KIND="branch"
    TARGET_NAME="${current_branch}"
  else
    resolve_target || return 1
  fi

  if [[ "${TARGET_KIND}" == "tag" ]]; then
    local current_tag
    current_tag="$(git describe --tags --exact-match 2>/dev/null || true)"
    if [[ "${current_tag}" == "${TARGET_NAME}" ]]; then
      log "Already on release ${TARGET_NAME}."
      return 0
    fi
    log "Updating to release ${TARGET_NAME}..."
    git fetch --quiet --depth 1 origin "refs/tags/${TARGET_NAME}:refs/tags/${TARGET_NAME}" || return 1
    git -c advice.detachedHead=false checkout --quiet "refs/tags/${TARGET_NAME}" || return 1
  else
    log "Updating to the latest ${TARGET_NAME} (development branch)..."
    git fetch origin "${TARGET_NAME}" || return 1
    git checkout "${TARGET_NAME}" || return 1
    git pull --ff-only origin "${TARGET_NAME}" || return 1
  fi
}

main() {
  VEXLYX_HOME="${VEXLYX_HOME:-/opt/vexlyx}"
  VEXLYX_REPO_URL="${VEXLYX_REPO_URL:-https://github.com/atlantiqs-org/vexlyx.git}"

  if [[ ${EUID} -ne 0 ]]; then
    echo "[ERROR] This installer must be run as root (or with sudo)." >&2
    exit 1
  fi

  if is_vexlyx_checkout "$(pwd)"; then
    # Already running from inside a Vexlyx checkout — use it as-is.
    VEXLYX_HOME="$(pwd)"
  elif is_vexlyx_checkout "${VEXLYX_HOME}"; then
    log "Found existing Vexlyx checkout at ${VEXLYX_HOME}."
    cd "${VEXLYX_HOME}"
    update_checkout
  elif [[ -e "${VEXLYX_HOME}" ]]; then
    echo "[ERROR] ${VEXLYX_HOME} already exists but is not a Vexlyx checkout." >&2
    echo "        Refusing to overwrite it. Set VEXLYX_HOME to a different path and re-run." >&2
    exit 1
  else
    ensure_git
    fresh_checkout
    cd "${VEXLYX_HOME}"
  fi

  export VEXLYX_HOME VEXLYX_REPO_URL
  if [[ -n "${TARGET_NAME:-}" ]]; then
    export VEXLYX_REPO_REF="${TARGET_NAME}"
  fi
  cd "${VEXLYX_HOME}"
  exec bash system/scripts/install/run.sh "$@"
}

# Run main when executed (`bash install.sh`) or piped (`curl ... | bash`, where
# BASH_SOURCE is empty); do nothing when sourced, so the functions above can be
# tested in isolation.
if [[ -z "${BASH_SOURCE[0]:-}" || "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
