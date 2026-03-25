#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "[trenchclaw-bootstrap] ERROR: this installer is Linux-only." >&2
  exit 1
fi

DEFAULT_INSTALL_DIR="$HOME/.local/bin"
TRENCHCLAW_INSTALLER_URL="${TRENCHCLAW_INSTALLER_URL:-https://raw.githubusercontent.com/henryoman/trenchclaw/main/scripts/install-trenchclaw.sh}"
TRENCHCLAW_VERSION="${TRENCHCLAW_VERSION:-latest}"
TRENCHCLAW_INSTALL_DIR="${TRENCHCLAW_INSTALL_DIR:-${TRENCHCLAW_BIN_DIR:-$DEFAULT_INSTALL_DIR}}"

info() {
  printf '%s\n' "[trenchclaw-bootstrap] $1"
}

fail() {
  printf '%s\n' "[trenchclaw-bootstrap] ERROR: $1" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

require_cmd() {
  need_cmd "$1" || fail "$1 is required but not installed"
}

curl_secure() {
  curl --proto '=https' --tlsv1.2 -fsSL "$@"
}

append_path_if_missing() {
  local profile_file="$1"
  local path_entry="$2"
  local line="export PATH=\"$path_entry:\$PATH\""

  [[ -f "$profile_file" ]] || touch "$profile_file"
  if ! grep -F "$line" "$profile_file" >/dev/null 2>&1; then
    printf '\n%s\n' "$line" >>"$profile_file"
    info "Added PATH update to $profile_file"
  fi
}

ensure_path_in_shell_profiles() {
  local entry="$1"
  append_path_if_missing "$HOME/.zshrc" "$entry"
  append_path_if_missing "$HOME/.bashrc" "$entry"
  append_path_if_missing "$HOME/.profile" "$entry"
}

add_path_for_current_process() {
  local entry="$1"
  case ":$PATH:" in
    *":$entry:"*) ;;
    *) export PATH="$entry:$PATH" ;;
  esac
}

install_or_upgrade_trenchclaw() {
  require_cmd curl

  info "Installing/upgrading TrenchClaw..."
  installer_tmp="$(mktemp)"
  trap 'rm -f "$installer_tmp"' EXIT INT TERM HUP
  curl_secure "$TRENCHCLAW_INSTALLER_URL" -o "$installer_tmp"
  TRENCHCLAW_VERSION="$TRENCHCLAW_VERSION" TRENCHCLAW_INSTALL_DIR="$TRENCHCLAW_INSTALL_DIR" bash "$installer_tmp"

  add_path_for_current_process "$TRENCHCLAW_INSTALL_DIR"
  ensure_path_in_shell_profiles "$TRENCHCLAW_INSTALL_DIR"
  need_cmd trenchclaw || fail "TrenchClaw launcher is unavailable after install/upgrade"
  trap - EXIT INT TERM HUP
  rm -f "$installer_tmp"
}

print_summary() {
  info "TrenchClaw is ready."
  info " - launcher: $(command -v trenchclaw)"
  info " - app root: $HOME/.local/share/trenchclaw/current"
  info " - state root: $HOME/.trenchclaw"
  info "If your shell still cannot find commands, run: exec \$SHELL -l"
}

main() {
  install_or_upgrade_trenchclaw
  print_summary
}

main "$@"
