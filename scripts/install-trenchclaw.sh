#!/usr/bin/env sh
set -eu

# TrenchClaw bootstrap installer
# Installs/checks:
# 1) Bun
# 2) Solana CLI
# 3) TrenchClaw binary
#
# Configurable environment variables:
# - TRENCHCLAW_CHANNEL (default: stable)
# - TRENCHCLAW_VERSION (default: latest)
# - TRENCHCLAW_DOWNLOAD_BASE_URL (default: https://downloads.trenchclaw.dev)
# - TRENCHCLAW_BINARY_NAME (default: trenchclaw)
# - TRENCHCLAW_BIN_DIR (default: $HOME/.local/bin)
# - TRENCHCLAW_RELOAD_SHELL (default: 0; set to 1 to exec a login shell at end)

TRENCHCLAW_CHANNEL="${TRENCHCLAW_CHANNEL:-stable}"
TRENCHCLAW_VERSION="${TRENCHCLAW_VERSION:-latest}"
TRENCHCLAW_DOWNLOAD_BASE_URL="${TRENCHCLAW_DOWNLOAD_BASE_URL:-https://downloads.trenchclaw.dev}"
TRENCHCLAW_BINARY_NAME="${TRENCHCLAW_BINARY_NAME:-trenchclaw}"
TRENCHCLAW_BIN_DIR="${TRENCHCLAW_BIN_DIR:-$HOME/.local/bin}"
TRENCHCLAW_RELOAD_SHELL="${TRENCHCLAW_RELOAD_SHELL:-0}"

SOLANA_INSTALL_URL="https://release.anza.xyz/v3.1.9/install"
SOLANA_PATH="$HOME/.local/share/solana/install/active_release/bin"
BUN_PATH="$HOME/.bun/bin"

info() {
  printf '%s\n' "[trenchclaw-install] $1"
}

fail() {
  printf '%s\n' "[trenchclaw-install] ERROR: $1" >&2
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

detect_platform() {
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"

  case "$arch" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) fail "Unsupported architecture: $arch" ;;
  esac

  case "$os" in
    darwin) platform="darwin-$arch" ;;
    linux) platform="linux-$arch" ;;
    mingw*|msys*|cygwin*) platform="windows-$arch" ;;
    *) fail "Unsupported OS: $os" ;;
  esac
}

install_bun_if_needed() {
  if need_cmd bun; then
    info "Bun found: $(bun --version)"
    return
  fi

  info "Bun not found. Installing Bun..."
  if ! need_cmd curl; then
    fail "curl is required to install Bun"
  fi
  curl -fsSL https://bun.sh/install | bash
  add_path_for_current_process "$BUN_PATH"
  ensure_path_in_shell_profiles "$BUN_PATH"

  need_cmd bun || fail "Bun installation completed but bun is still not on PATH"
  info "Bun installed: $(bun --version)"
}

install_solana_if_needed() {
  if need_cmd solana; then
    info "Solana CLI found: $(solana --version)"
    return
  fi

  info "Solana CLI not found. Installing Solana CLI..."
  if ! need_cmd curl; then
    fail "curl is required to install Solana CLI"
  fi
  sh -c "$(curl -sSfL "$SOLANA_INSTALL_URL")"

  add_path_for_current_process "$SOLANA_PATH"
  ensure_path_in_shell_profiles "$SOLANA_PATH"

  need_cmd solana || fail "Solana installation completed but solana is still not on PATH"
  info "Solana CLI installed: $(solana --version)"
}

install_trenchclaw_binary() {
  detect_platform
  mkdir -p "$TRENCHCLAW_BIN_DIR"
  add_path_for_current_process "$TRENCHCLAW_BIN_DIR"
  ensure_path_in_shell_profiles "$TRENCHCLAW_BIN_DIR"

  binary_url="$TRENCHCLAW_DOWNLOAD_BASE_URL/$TRENCHCLAW_CHANNEL/$TRENCHCLAW_VERSION/$TRENCHCLAW_BINARY_NAME-$platform"
  target="$TRENCHCLAW_BIN_DIR/$TRENCHCLAW_BINARY_NAME"
  tmp_target="$target.tmp.$$"

  info "Downloading TrenchClaw binary from:"
  info "$binary_url"

  curl -fsSL "$binary_url" -o "$tmp_target" || fail "Failed to download TrenchClaw binary"
  chmod +x "$tmp_target"
  mv "$tmp_target" "$target"

  need_cmd "$TRENCHCLAW_BINARY_NAME" || fail "TrenchClaw binary installed but command is not on PATH"
  info "TrenchClaw installed: $($TRENCHCLAW_BINARY_NAME --version)"
}

print_summary() {
  info "Install complete."
  info "Verified:"
  info " - bun: $(bun --version)"
  info " - solana: $(solana --version)"
  info " - $TRENCHCLAW_BINARY_NAME: $($TRENCHCLAW_BINARY_NAME --version)"
  info "If your current shell still cannot find these commands, run:"
  info "  exec \$SHELL -l"
}

main() {
  install_bun_if_needed
  install_solana_if_needed
  install_trenchclaw_binary
  print_summary

  if [ "$TRENCHCLAW_RELOAD_SHELL" = "1" ]; then
    info "Reloading shell..."
    exec "${SHELL:-/bin/sh}" -l
  fi
}

main "$@"
