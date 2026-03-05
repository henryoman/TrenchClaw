#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[trenchclaw-bootstrap] ERROR: this installer is macOS-only." >&2
  exit 1
fi

BUN_BIN_DIR="$HOME/.bun/bin"
SOLANA_BIN_DIR="$HOME/.local/share/solana/install/active_release/bin"
LOCAL_BIN_DIR="$HOME/.local/bin"

SOLANA_INSTALL_URL="${SOLANA_INSTALL_URL:-https://release.anza.xyz/stable/install}"
TRENCHCLAW_INSTALLER_URL="${TRENCHCLAW_INSTALLER_URL:-https://raw.githubusercontent.com/trenchclaw/trenchclaw/main/scripts/install-trenchclaw.sh}"
TRENCHCLAW_VERSION="${TRENCHCLAW_VERSION:-latest}"

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
  append_path_if_missing "$HOME/.zprofile" "$entry"
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

install_or_upgrade_bun() {
  require_cmd curl

  if need_cmd bun; then
    info "Bun detected: $(bun --version)"
    info "Upgrading Bun..."
    bun upgrade
  else
    info "Installing Bun..."
    curl_secure https://bun.sh/install | bash
  fi

  add_path_for_current_process "$BUN_BIN_DIR"
  ensure_path_in_shell_profiles "$BUN_BIN_DIR"
  need_cmd bun || fail "Bun is unavailable after install/upgrade"
  info "Bun ready: $(bun --version)"
}

install_or_upgrade_solana() {
  require_cmd curl

  add_path_for_current_process "$SOLANA_BIN_DIR"
  ensure_path_in_shell_profiles "$SOLANA_BIN_DIR"

  if need_cmd solana; then
    info "Solana CLI detected: $(solana --version)"
    if need_cmd agave-install; then
      info "Updating Solana CLI..."
      agave-install update || true
    else
      info "agave-install missing; reinstalling stable Solana CLI..."
      sh -c "$(curl_secure "$SOLANA_INSTALL_URL")"
    fi
  else
    info "Installing Solana CLI..."
    sh -c "$(curl_secure "$SOLANA_INSTALL_URL")"
  fi

  add_path_for_current_process "$SOLANA_BIN_DIR"
  need_cmd solana || fail "Solana CLI is unavailable after install/upgrade"
  info "Solana CLI ready: $(solana --version)"
}

install_or_upgrade_helius() {
  info "Installing/upgrading Helius CLI with Bun..."
  bun add -g helius-cli@latest
  add_path_for_current_process "$BUN_BIN_DIR"
  need_cmd helius || fail "Helius CLI is unavailable after install/upgrade"
  info "Helius CLI ready: $(helius --version)"
}

install_or_upgrade_trenchclaw() {
  require_cmd curl

  info "Installing/upgrading TrenchClaw..."
  curl_secure "$TRENCHCLAW_INSTALLER_URL" | TRENCHCLAW_VERSION="$TRENCHCLAW_VERSION" sh

  add_path_for_current_process "$LOCAL_BIN_DIR"
  ensure_path_in_shell_profiles "$LOCAL_BIN_DIR"
  need_cmd trenchclaw || fail "TrenchClaw launcher is unavailable after install/upgrade"
}

print_summary() {
  info "All dependencies are ready."
  info "Versions:"
  info " - bun: $(bun --version)"
  info " - solana: $(solana --version)"
  info " - helius: $(helius --version)"
  info " - trenchclaw: $(trenchclaw --version)"
  info "If your shell still cannot find commands, run: exec \$SHELL -l"
}

main() {
  install_or_upgrade_bun
  install_or_upgrade_solana
  install_or_upgrade_helius
  install_or_upgrade_trenchclaw
  print_summary
}

main "$@"
