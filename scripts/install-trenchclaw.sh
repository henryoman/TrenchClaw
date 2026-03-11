#!/usr/bin/env sh
set -eu

# Configurable environment variables:
# - TRENCHCLAW_VERSION (default: latest)
# - TRENCHCLAW_REPO (default: henryoman/trenchclaw)
# - TRENCHCLAW_DOWNLOAD_BASE_URL (optional override; expected form: <base>/<version>/<artifact>)
# - TRENCHCLAW_ARTIFACT_NAME (default: trenchclaw-$TRENCHCLAW_VERSION-$platform.tar.gz)
# - TRENCHCLAW_APP_HOME (default: $HOME/.local/share/trenchclaw)
# - TRENCHCLAW_BIN_DIR (default: $HOME/.local/bin)
# - TRENCHCLAW_INSTALL_REQUIRED_TOOLS (default: 1)
# - TRENCHCLAW_UPDATE_EXISTING_TOOLS (default: 1)
# - TRENCHCLAW_RELOAD_SHELL (default: 0; set to 1 to exec a login shell at end)

TRENCHCLAW_VERSION="${TRENCHCLAW_VERSION:-latest}"
TRENCHCLAW_REPO="${TRENCHCLAW_REPO:-henryoman/trenchclaw}"
TRENCHCLAW_DOWNLOAD_BASE_URL="${TRENCHCLAW_DOWNLOAD_BASE_URL:-}"
TRENCHCLAW_ARTIFACT_NAME="${TRENCHCLAW_ARTIFACT_NAME:-}"
TRENCHCLAW_APP_HOME="${TRENCHCLAW_APP_HOME:-$HOME/.local/share/trenchclaw}"
TRENCHCLAW_BIN_DIR="${TRENCHCLAW_BIN_DIR:-$HOME/.local/bin}"
TRENCHCLAW_INSTALL_REQUIRED_TOOLS="${TRENCHCLAW_INSTALL_REQUIRED_TOOLS:-1}"
TRENCHCLAW_UPDATE_EXISTING_TOOLS="${TRENCHCLAW_UPDATE_EXISTING_TOOLS:-1}"
TRENCHCLAW_RELOAD_SHELL="${TRENCHCLAW_RELOAD_SHELL:-0}"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

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

require_cmd() {
  need_cmd "$1" || fail "$1 is required but not installed"
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

install_trenchclaw_bundle() {
  detect_platform
  require_cmd curl
  require_cmd tar
  mkdir -p "$TRENCHCLAW_APP_HOME" "$TRENCHCLAW_BIN_DIR"
  add_path_for_current_process "$TRENCHCLAW_BIN_DIR"
  ensure_path_in_shell_profiles "$TRENCHCLAW_BIN_DIR"

  resolved_version="$TRENCHCLAW_VERSION"
  if [ "$resolved_version" = "latest" ] && [ -z "$TRENCHCLAW_DOWNLOAD_BASE_URL" ]; then
    info "Resolving latest release tag from GitHub..."
    release_json="$(curl -fsSL "https://api.github.com/repos/$TRENCHCLAW_REPO/releases/latest")" || fail "Failed to resolve latest release tag"
    resolved_version="$(printf '%s' "$release_json" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | sed -n '1p')"
    [ -n "$resolved_version" ] || fail "Could not parse latest release tag for $TRENCHCLAW_REPO"
  fi

  if [ -n "$TRENCHCLAW_ARTIFACT_NAME" ]; then
    artifact_name="$TRENCHCLAW_ARTIFACT_NAME"
  else
    artifact_name="trenchclaw-$resolved_version-$platform.tar.gz"
  fi

  if [ -n "$TRENCHCLAW_DOWNLOAD_BASE_URL" ]; then
    bundle_url="$TRENCHCLAW_DOWNLOAD_BASE_URL/$resolved_version/$artifact_name"
  else
    bundle_url="https://github.com/$TRENCHCLAW_REPO/releases/download/$resolved_version/$artifact_name"
  fi
  version_root="$TRENCHCLAW_APP_HOME/$resolved_version"
  current_link="$TRENCHCLAW_APP_HOME/current"
  tmp_bundle="$TRENCHCLAW_APP_HOME/$artifact_name.tmp.$$"
  extract_root="$version_root/$platform"
  install_root="$extract_root/trenchclaw-$platform"

  info "Downloading TrenchClaw standalone release from:"
  info "$bundle_url"

  curl -fsSL "$bundle_url" -o "$tmp_bundle" || fail "Failed to download TrenchClaw release"

  rm -rf "$extract_root"
  mkdir -p "$extract_root"
  tar -xzf "$tmp_bundle" -C "$extract_root" || fail "Failed to extract TrenchClaw release"
  rm -f "$tmp_bundle"

  rm -f "$current_link"
  ln -s "$install_root" "$current_link"

  launcher="$TRENCHCLAW_BIN_DIR/trenchclaw"
  cat >"$launcher" <<'EOF'
#!/usr/bin/env sh
set -eu
APP_HOME="${TRENCHCLAW_HOME:-$HOME/.local/share/trenchclaw/current}"
if [ ! -x "$APP_HOME/trenchclaw" ]; then
  echo "[trenchclaw] invalid app install at $APP_HOME" >&2
  exit 1
fi
exec "$APP_HOME/trenchclaw" "$@"
EOF
  chmod +x "$launcher"

  need_cmd trenchclaw || fail "TrenchClaw launcher installed but command is not on PATH"
  info "TrenchClaw installed at $current_link"
}

install_required_tools() {
  [ "$TRENCHCLAW_INSTALL_REQUIRED_TOOLS" = "1" ] || return 0

  info "Installing required external tools..."
  TRENCHCLAW_UPDATE_EXISTING_TOOLS="$TRENCHCLAW_UPDATE_EXISTING_TOOLS" \
    sh "$SCRIPT_DIR/install-required-tools.sh"
}

print_summary() {
  info "Install complete."
  info "Verified:"
  info " - trenchclaw launcher: $(command -v trenchclaw)"
  if command -v solana >/dev/null 2>&1; then
    info " - solana cli: $(command -v solana)"
  fi
  info "TrenchClaw creates fresh writable runtime state locally on first launch."
  info "If your current shell still cannot find these commands, run:"
  info "  exec \$SHELL -l"
}

main() {
  install_trenchclaw_bundle
  install_required_tools
  print_summary

  if [ "$TRENCHCLAW_RELOAD_SHELL" = "1" ]; then
    info "Reloading shell..."
    exec "${SHELL:-/bin/sh}" -l
  fi
}

main "$@"
