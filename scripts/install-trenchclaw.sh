#!/usr/bin/env sh
set -eu

# Configurable environment variables:
# - TRENCHCLAW_VERSION (default: latest)
# - TRENCHCLAW_REPO (default: henryoman/trenchclaw)
# - TRENCHCLAW_DOWNLOAD_BASE_URL (optional override; expected form: <base>/<version>/<artifact>)
# - TRENCHCLAW_ARTIFACT_NAME (default: trenchclaw-$TRENCHCLAW_VERSION-$platform.tar.gz)
# - TRENCHCLAW_APP_HOME (default: $HOME/.local/share/trenchclaw)
# - TRENCHCLAW_BIN_DIR (default: $HOME/.local/bin)
# - TRENCHCLAW_INSTALL_REQUIRED_TOOLS (default: 0)
# - TRENCHCLAW_UPDATE_EXISTING_TOOLS (default: 1)
# - TRENCHCLAW_RELOAD_SHELL (default: 0; set to 1 to exec a login shell at end)

TRENCHCLAW_VERSION="${TRENCHCLAW_VERSION:-latest}"
TRENCHCLAW_REPO="${TRENCHCLAW_REPO:-henryoman/trenchclaw}"
TRENCHCLAW_DOWNLOAD_BASE_URL="${TRENCHCLAW_DOWNLOAD_BASE_URL:-}"
TRENCHCLAW_ARTIFACT_NAME="${TRENCHCLAW_ARTIFACT_NAME:-}"
TRENCHCLAW_APP_HOME="${TRENCHCLAW_APP_HOME:-$HOME/.local/share/trenchclaw}"
TRENCHCLAW_BIN_DIR="${TRENCHCLAW_BIN_DIR:-$HOME/.local/bin}"
TRENCHCLAW_INSTALL_REQUIRED_TOOLS="${TRENCHCLAW_INSTALL_REQUIRED_TOOLS:-0}"
TRENCHCLAW_UPDATE_EXISTING_TOOLS="${TRENCHCLAW_UPDATE_EXISTING_TOOLS:-1}"
TRENCHCLAW_RELOAD_SHELL="${TRENCHCLAW_RELOAD_SHELL:-0}"
TRENCHCLAW_INSTALLED_VERSION=""

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

resolve_sha256_command() {
  if need_cmd sha256sum; then
    printf '%s\n' "sha256sum"
    return 0
  fi
  if need_cmd shasum; then
    printf '%s\n' "shasum -a 256"
    return 0
  fi
  if need_cmd openssl; then
    printf '%s\n' "openssl dgst -sha256"
    return 0
  fi
  fail "Need sha256sum, shasum, or openssl to verify downloads"
}

compute_sha256() {
  file_path="$1"
  command_name="$(resolve_sha256_command)"
  case "$command_name" in
    "sha256sum")
      sha256sum "$file_path" | awk '{print $1}'
      ;;
    "shasum -a 256")
      shasum -a 256 "$file_path" | awk '{print $1}'
      ;;
    "openssl dgst -sha256")
      openssl dgst -sha256 "$file_path" | awk '{print $NF}'
      ;;
    *)
      fail "Unsupported checksum command: $command_name"
      ;;
  esac
}

read_expected_sha256() {
  checksum_file="$1"
  awk 'NF { print $1; exit }' "$checksum_file"
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
    *) fail "Unsupported OS: $os" ;;
  esac
}

install_trenchclaw_bundle() {
  detect_platform
  require_cmd curl
  require_cmd tar
  require_cmd mktemp
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
  TRENCHCLAW_INSTALLED_VERSION="$resolved_version"

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
  checksum_url="${bundle_url}.sha256"
  version_root="$TRENCHCLAW_APP_HOME/$resolved_version"
  current_link="$TRENCHCLAW_APP_HOME/current"
  tmp_dir="$(mktemp -d "$TRENCHCLAW_APP_HOME/.install-$resolved_version-$platform-XXXXXX")"
  tmp_bundle="$tmp_dir/$artifact_name"
  tmp_checksum="$tmp_dir/$artifact_name.sha256"
  extract_root="$tmp_dir/extracted"

  cleanup_install_tmp() {
    rm -rf "$tmp_dir"
  }
  trap cleanup_install_tmp EXIT INT TERM HUP

  info "Downloading TrenchClaw standalone release from:"
  info "$bundle_url"

  curl -fsSL "$bundle_url" -o "$tmp_bundle" || fail "Failed to download TrenchClaw release"
  curl -fsSL "$checksum_url" -o "$tmp_checksum" || fail "Failed to download TrenchClaw checksum"

  expected_sha="$(read_expected_sha256 "$tmp_checksum")"
  [ -n "$expected_sha" ] || fail "Checksum file did not include a sha256 value"
  actual_sha="$(compute_sha256 "$tmp_bundle")"
  [ -n "$actual_sha" ] || fail "Could not compute sha256 checksum"
  if [ "$actual_sha" != "$expected_sha" ]; then
    fail "Checksum mismatch for $artifact_name (expected $expected_sha, got $actual_sha)"
  fi

  mkdir -p "$extract_root"
  tar -xzf "$tmp_bundle" -C "$extract_root" || fail "Failed to extract TrenchClaw release"
  [ -x "$extract_root/trenchclaw" ] || fail "Release archive did not contain executable trenchclaw"
  [ -d "$extract_root/gui" ] || fail "Release archive did not contain gui/"
  [ -d "$extract_root/core" ] || fail "Release archive did not contain core/"
  [ -f "$extract_root/release-metadata.json" ] || fail "Release archive did not contain release-metadata.json"

  rm -rf "$version_root"
  mkdir -p "$version_root"
  cp -R "$extract_root/." "$version_root/"

  rm -f "$current_link"
  ln -s "$version_root" "$current_link"

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
  info "Installed TrenchClaw $resolved_version at $version_root"
  trap - EXIT INT TERM HUP
  cleanup_install_tmp
}

print_summary() {
  installed_version="${1:-$TRENCHCLAW_VERSION}"
  info "Install complete."
  info "Installed version: $installed_version"
  info "Launcher: $(command -v trenchclaw)"
  info "Readonly app root: $TRENCHCLAW_APP_HOME/current"
  info "Writable state root: ${TRENCHCLAW_RUNTIME_STATE_ROOT:-$HOME/.trenchclaw}"
  info "Next steps:"
  info "  trenchclaw"
  info "If your current shell still cannot find trenchclaw, run:"
  info "  exec \$SHELL -l"
}

main() {
  install_trenchclaw_bundle
  if [ "$TRENCHCLAW_INSTALL_REQUIRED_TOOLS" = "1" ]; then
    info "Skipping automatic external tool installation in the public install flow."
    info "Install optional tools separately if you need features that require them."
  fi
  print_summary "$TRENCHCLAW_INSTALLED_VERSION"

  if [ "$TRENCHCLAW_RELOAD_SHELL" = "1" ]; then
    info "Reloading shell..."
    exec "${SHELL:-/bin/sh}" -l
  fi
}

main "$@"
