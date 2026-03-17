#!/usr/bin/env sh
set -eu

# Ensures latest Bun + Solana CLI + Helius CLI are installed.

BUN_BIN_DIR="$HOME/.bun/bin"
SOLANA_BIN_DIR="$HOME/.local/share/solana/install/active_release/bin"
SOLANA_STABLE_INSTALL_URL="https://release.anza.xyz/stable/install"
HELIUS_PACKAGE_NAME="helius-cli"

info() {
  printf '%s\n' "[runner-deps] $1"
}

fail() {
  printf '%s\n' "[runner-deps] ERROR: $1" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

require_curl() {
  need_cmd curl || fail "curl is required but not installed"
}

append_path_if_missing() {
  profile_file="$1"
  path_entry="$2"
  line="export PATH=\"$path_entry:\$PATH\""

  [ -f "$profile_file" ] || touch "$profile_file"
  if ! grep -F "$line" "$profile_file" >/dev/null 2>&1; then
    printf '\n%s\n' "$line" >>"$profile_file"
    info "Added PATH update to $profile_file"
  fi
}

ensure_path_in_shell_profiles() {
  entry="$1"
  append_path_if_missing "$HOME/.zshrc" "$entry"
  append_path_if_missing "$HOME/.bashrc" "$entry"
  append_path_if_missing "$HOME/.profile" "$entry"
}

add_path_for_current_process() {
  entry="$1"
  case ":$PATH:" in
    *":$entry:"*) ;;
    *) PATH="$entry:$PATH"; export PATH ;;
  esac
}

install_or_upgrade_bun() {
  require_curl

  if need_cmd bun; then
    info "Bun detected: $(bun --version)"
    info "Upgrading Bun to latest..."
    bun upgrade || fail "bun upgrade failed"
  else
    info "Bun not found. Installing latest Bun..."
    curl -fsSL https://bun.sh/install | bash
  fi

  add_path_for_current_process "$BUN_BIN_DIR"
  ensure_path_in_shell_profiles "$BUN_BIN_DIR"
  need_cmd bun || fail "Bun is still unavailable after install/upgrade"
  info "Bun ready: $(bun --version)"
}

install_or_upgrade_solana() {
  require_curl
  add_path_for_current_process "$SOLANA_BIN_DIR"
  ensure_path_in_shell_profiles "$SOLANA_BIN_DIR"

  if need_cmd solana; then
    info "Solana CLI detected: $(solana --version)"
    if need_cmd agave-install; then
      info "Updating Solana CLI to latest stable..."
      agave-install update || fail "agave-install update failed"
    else
      info "agave-install not found; reinstalling latest stable Solana CLI..."
      sh -c "$(curl -sSfL "$SOLANA_STABLE_INSTALL_URL")"
    fi
  else
    info "Solana CLI not found. Installing latest stable..."
    sh -c "$(curl -sSfL "$SOLANA_STABLE_INSTALL_URL")"
  fi

  add_path_for_current_process "$SOLANA_BIN_DIR"
  need_cmd solana || fail "Solana CLI is still unavailable after install/upgrade"
  info "Solana CLI ready: $(solana --version)"
}

install_or_upgrade_helius() {
  add_path_for_current_process "$BUN_BIN_DIR"
  ensure_path_in_shell_profiles "$BUN_BIN_DIR"

  if need_cmd helius; then
    info "Helius CLI detected: $(helius --version 2>/dev/null || printf '%s' 'version unavailable')"
    info "Upgrading Helius CLI to latest..."
  else
    info "Helius CLI not found. Installing latest..."
  fi

  bun add -g "${HELIUS_PACKAGE_NAME}@latest" || fail "bun failed to install ${HELIUS_PACKAGE_NAME}"

  add_path_for_current_process "$BUN_BIN_DIR"
  need_cmd helius || fail "Helius CLI is still unavailable after install/upgrade"
  info "Helius CLI ready: $(helius --version 2>/dev/null || printf '%s' 'version unavailable')"
}

main() {
  install_or_upgrade_bun
  install_or_upgrade_solana
  install_or_upgrade_helius
  info "Dependency bootstrap complete."
  info "If your current shell cannot find commands yet, run: exec \$SHELL -l"
}

main "$@"
