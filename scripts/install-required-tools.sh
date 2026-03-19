#!/usr/bin/env sh
set -eu

# Configurable environment variables:
# - TRENCHCLAW_INSTALL_SOLANA (default: 1)
# - TRENCHCLAW_INSTALL_HELIUS (default: 1)
# - TRENCHCLAW_UPDATE_EXISTING_TOOLS (default: 1)

TRENCHCLAW_INSTALL_SOLANA="${TRENCHCLAW_INSTALL_SOLANA:-1}"
TRENCHCLAW_INSTALL_HELIUS="${TRENCHCLAW_INSTALL_HELIUS:-1}"
TRENCHCLAW_UPDATE_EXISTING_TOOLS="${TRENCHCLAW_UPDATE_EXISTING_TOOLS:-1}"

SOLANA_BIN_DIR="${HOME}/.local/share/solana/install/active_release/bin"
SOLANA_STABLE_INSTALL_URL="https://release.anza.xyz/stable/install"
BUN_BIN_DIR="${HOME}/.bun/bin"
HELIUS_PACKAGE_NAME="helius-cli"

info() {
  printf '%s\n' "[trenchclaw-tools] $1"
}

fail() {
  printf '%s\n' "[trenchclaw-tools] ERROR: $1" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1
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

require_cmd() {
  need_cmd "$1" || fail "$1 is required but not installed"
}

print_manual_helius_install_help() {
  info "Install one of these package managers, then rerun this helper or install Helius CLI manually:"
  info "  bun add -g ${HELIUS_PACKAGE_NAME}@latest"
  info "  pnpm add -g ${HELIUS_PACKAGE_NAME}@latest"
}

install_or_update_solana() {
  [ "$TRENCHCLAW_INSTALL_SOLANA" = "1" ] || return 0

  require_cmd curl
  require_cmd sh

  add_path_for_current_process "$SOLANA_BIN_DIR"
  ensure_path_in_shell_profiles "$SOLANA_BIN_DIR"

  if need_cmd solana; then
    info "Solana CLI detected: $(solana --version)"
    if [ "$TRENCHCLAW_UPDATE_EXISTING_TOOLS" != "1" ]; then
      info "Skipping Solana CLI update because TRENCHCLAW_UPDATE_EXISTING_TOOLS=0"
      return 0
    fi

    if need_cmd agave-install; then
      info "Updating Solana CLI to latest stable..."
      agave-install update || fail "agave-install update failed"
    else
      info "agave-install not found; reinstalling latest stable Solana CLI..."
      sh -c "$(curl -sSfL "$SOLANA_STABLE_INSTALL_URL")"
    fi
  else
    info "Installing Solana CLI (stable)..."
    sh -c "$(curl -sSfL "$SOLANA_STABLE_INSTALL_URL")"
  fi

  add_path_for_current_process "$SOLANA_BIN_DIR"
  need_cmd solana || fail "Solana CLI is still unavailable after install/update"
  info "Solana CLI tools ready: $(solana --version)"
}

install_or_update_helius() {
  installer=""

  [ "$TRENCHCLAW_INSTALL_HELIUS" = "1" ] || return 0

  if need_cmd bun; then
    installer="bun"
    add_path_for_current_process "$BUN_BIN_DIR"
    ensure_path_in_shell_profiles "$BUN_BIN_DIR"
  elif need_cmd pnpm; then
    installer="pnpm"
  fi

  if [ -z "$installer" ]; then
    info "Skipping Helius CLI install/update because Bun and pnpm are unavailable."
    print_manual_helius_install_help
    return 0
  fi

  if need_cmd helius; then
    info "Helius CLI detected: $(helius --version 2>/dev/null || printf '%s' 'version unavailable')"
    if [ "$TRENCHCLAW_UPDATE_EXISTING_TOOLS" != "1" ]; then
      info "Skipping Helius CLI update because TRENCHCLAW_UPDATE_EXISTING_TOOLS=0"
      return 0
    fi
  else
    info "Installing Helius CLI with ${installer}..."
  fi

  case "$installer" in
    bun)
      bun add -g "${HELIUS_PACKAGE_NAME}@latest" || fail "bun failed to install ${HELIUS_PACKAGE_NAME}"
      ;;
    pnpm)
      pnpm add -g "${HELIUS_PACKAGE_NAME}@latest" || fail "pnpm failed to install ${HELIUS_PACKAGE_NAME}"
      ;;
  esac

  add_path_for_current_process "$BUN_BIN_DIR"
  need_cmd helius || fail "Helius CLI is still unavailable after install/update"
  info "Helius CLI ready: $(helius --version 2>/dev/null || printf '%s' 'version unavailable')"
}

main() {
  install_or_update_solana
  install_or_update_helius
}

main "$@"
