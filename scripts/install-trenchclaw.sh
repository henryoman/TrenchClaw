#!/usr/bin/env bash
set -euo pipefail

APP_NAME="trenchclaw"
DEFAULT_REPO="henryoman/trenchclaw"
DEFAULT_DOCS_URL="https://trenchclaw.vercel.app/docs"

requested_version="${TRENCHCLAW_VERSION:-${VERSION:-latest}}"
repo="${TRENCHCLAW_REPO:-$DEFAULT_REPO}"
download_base_url="${TRENCHCLAW_DOWNLOAD_BASE_URL:-}"
artifact_name_override="${TRENCHCLAW_ARTIFACT_NAME:-}"
install_dir_override="${TRENCHCLAW_INSTALL_DIR:-${TRENCHCLAW_BIN_DIR:-}}"
app_home_override="${TRENCHCLAW_APP_HOME:-}"
reload_shell="${TRENCHCLAW_RELOAD_SHELL:-0}"
install_required_tools="${TRENCHCLAW_INSTALL_REQUIRED_TOOLS:-0}"
no_modify_path=false

resolved_install_dir=""
resolved_app_home=""
resolved_version=""
installed_version_before=""

info() {
  printf '%s\n' "[trenchclaw-install] $1"
}

warn() {
  printf '%s\n' "[trenchclaw-install] WARNING: $1" >&2
}

fail() {
  printf '%s\n' "[trenchclaw-install] ERROR: $1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
TrenchClaw Installer

Usage: install [options]

Options:
  -h, --help              Display this help message
  -v, --version <tag>     Install a specific release tag (for example: v0.1.0)
      --no-modify-path    Do not update shell config files
  -y, --yes               Accepted for compatibility; install is already non-interactive

Environment:
  TRENCHCLAW_INSTALL_DIR  Override launcher install directory
  TRENCHCLAW_BIN_DIR      Legacy alias for launcher install directory
  XDG_BIN_DIR             Preferred user bin directory when set
  TRENCHCLAW_APP_HOME     Override readonly app bundle root
  TRENCHCLAW_VERSION      Requested release tag (default: latest)
  TRENCHCLAW_REPO         GitHub repo slug (default: henryoman/trenchclaw)

Examples:
  curl -fsSL https://trenchclaw.vercel.app/install | bash
  curl -fsSL https://trenchclaw.vercel.app/install | bash -s -- --version v0.1.0
  TRENCHCLAW_INSTALL_DIR=$HOME/bin curl -fsSL https://trenchclaw.vercel.app/install | bash
EOF
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

require_cmd() {
  need_cmd "$1" || fail "$1 is required but not installed"
}

normalize_version_tag() {
  local value="$1"
  if [[ -z "$value" || "$value" == "latest" ]]; then
    printf '%s\n' "latest"
    return 0
  fi

  case "$value" in
    v*) printf '%s\n' "$value" ;;
    *) printf 'v%s\n' "$value" ;;
  esac
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -h|--help)
        usage
        exit 0
        ;;
      -v|--version)
        [[ -n "${2:-}" ]] || fail "--version requires a value"
        requested_version="$2"
        shift 2
        ;;
      --no-modify-path)
        no_modify_path=true
        shift
        ;;
      -y|--yes)
        shift
        ;;
      *)
        warn "Ignoring unknown option: $1"
        shift
        ;;
    esac
  done

  requested_version="$(normalize_version_tag "$requested_version")"
}

parent_dir() {
  dirname -- "$1"
}

assert_writable_path() {
  local target_path="$1"
  local label="$2"
  local existing_path="$target_path"

  while [[ ! -e "$existing_path" ]]; do
    local next_path
    next_path="$(parent_dir "$existing_path")"
    [[ "$next_path" != "$existing_path" ]] || break
    existing_path="$next_path"
  done

  [[ -w "$existing_path" ]] || fail "$label is not writable: $target_path. Check ownership and permissions for $existing_path."
}

choose_install_dir() {
  if [[ -n "$install_dir_override" ]]; then
    printf '%s\n' "$install_dir_override"
    return 0
  fi

  if [[ -n "${XDG_BIN_DIR:-}" ]]; then
    printf '%s\n' "$XDG_BIN_DIR"
    return 0
  fi

  if [[ -d "$HOME/.local/bin" ]] || mkdir -p "$HOME/.local/bin" 2>/dev/null; then
    printf '%s\n' "$HOME/.local/bin"
    return 0
  fi

  if [[ -d "$HOME/bin" ]] || mkdir -p "$HOME/bin" 2>/dev/null; then
    printf '%s\n' "$HOME/bin"
    return 0
  fi

  printf '%s\n' "$HOME/.trenchclaw/bin"
}

choose_app_home() {
  if [[ -n "$app_home_override" ]]; then
    printf '%s\n' "$app_home_override"
    return 0
  fi

  if [[ -n "${XDG_DATA_HOME:-}" ]]; then
    printf '%s\n' "$XDG_DATA_HOME/trenchclaw"
    return 0
  fi

  printf '%s\n' "$HOME/.local/share/trenchclaw"
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
  local file_path="$1"
  local command_name
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
  awk 'NF { print $1; exit }' "$1"
}

read_installed_version() {
  local metadata_path="$1/current/release-metadata.json"

  if [[ ! -f "$metadata_path" ]]; then
    return 0
  fi

  sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$metadata_path" | sed -n '1p'
}

detect_platform() {
  local raw_os
  local os
  local arch

  raw_os="$(uname -s)"
  os="$(printf '%s' "$raw_os" | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"

  case "$raw_os" in
    Darwin*) os="darwin" ;;
    Linux*) os="linux" ;;
    *) fail "Unsupported OS: $raw_os" ;;
  esac

  case "$arch" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) fail "Unsupported architecture: $arch" ;;
  esac

  if [[ "$os" == "darwin" && "$arch" == "x64" ]]; then
    local rosetta_flag
    rosetta_flag="$(sysctl -n sysctl.proc_translated 2>/dev/null || printf '0')"
    if [[ "$rosetta_flag" == "1" ]]; then
      arch="arm64"
    fi
  fi

  printf '%s-%s\n' "$os" "$arch"
}

resolve_latest_release_tag() {
  local release_json
  release_json="$(curl -fsSL "https://api.github.com/repos/$repo/releases/latest")" || fail "Failed to resolve latest release tag"

  local tag_name
  tag_name="$(printf '%s' "$release_json" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | sed -n '1p')"
  [[ -n "$tag_name" ]] || fail "Could not parse latest release tag for $repo"
  printf '%s\n' "$tag_name"
}

resolve_release_tag() {
  if [[ "$requested_version" == "latest" ]]; then
    resolve_latest_release_tag
  else
    printf '%s\n' "$requested_version"
  fi
}

add_path_for_current_process() {
  local entry="$1"
  case ":$PATH:" in
    *":$entry:"*) ;;
    *) export PATH="$entry:$PATH" ;;
  esac
}

shell_config_candidates() {
  local current_shell
  current_shell="$(basename "${SHELL:-sh}")"

  case "$current_shell" in
    fish)
      printf '%s\n' "$HOME/.config/fish/config.fish"
      ;;
    zsh)
      printf '%s\n' "${ZDOTDIR:-$HOME}/.zshrc"
      printf '%s\n' "${ZDOTDIR:-$HOME}/.zprofile"
      printf '%s\n' "$HOME/.profile"
      ;;
    bash)
      printf '%s\n' "$HOME/.bashrc"
      printf '%s\n' "$HOME/.bash_profile"
      printf '%s\n' "$HOME/.profile"
      ;;
    ash|sh)
      printf '%s\n' "$HOME/.profile"
      ;;
    *)
      printf '%s\n' "$HOME/.profile"
      printf '%s\n' "$HOME/.bashrc"
      ;;
  esac
}

pick_shell_config_file() {
  local candidate
  local fallback=""

  while IFS= read -r candidate; do
    [[ -n "$candidate" ]] || continue
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
    if [[ -z "$fallback" ]]; then
      fallback="$candidate"
    fi
  done < <(shell_config_candidates)

  [[ -n "$fallback" ]] && printf '%s\n' "$fallback"
}

build_path_command() {
  local shell_name
  local entry="$1"
  shell_name="$(basename "${SHELL:-sh}")"

  case "$shell_name" in
    fish) printf '%s\n' "fish_add_path $entry" ;;
    *) printf '%s\n' "export PATH=$entry:\$PATH" ;;
  esac
}

ensure_path_config() {
  local entry="$1"
  local config_file
  local command_text

  [[ "$no_modify_path" == "true" ]] && return 0

  case ":$PATH:" in
    *":$entry:"*) return 0 ;;
  esac

  config_file="$(pick_shell_config_file)"
  command_text="$(build_path_command "$entry")"

  if [[ -z "$config_file" ]]; then
    warn "Could not determine a shell config file. Add this manually: $command_text"
    return 0
  fi

  mkdir -p "$(parent_dir "$config_file")"
  [[ -f "$config_file" ]] || touch "$config_file"

  if grep -Fxq "$command_text" "$config_file"; then
    return 0
  fi

  if [[ ! -w "$config_file" ]]; then
    warn "$config_file is not writable. Add this manually: $command_text"
    return 0
  fi

  {
    printf '\n# trenchclaw\n'
    printf '%s\n' "$command_text"
  } >>"$config_file"
  info "Added $entry to PATH in $config_file"
}

write_launcher() {
  local launcher_path="$1"
  local app_home_path="$2"

  {
    printf '%s\n' '#!/usr/bin/env sh'
    printf '%s\n' 'set -eu'
    printf 'APP_HOME="${TRENCHCLAW_HOME:-${TRENCHCLAW_APP_HOME:-%s/current}}"\n' "$app_home_path"
    printf '%s\n' 'if [ ! -x "$APP_HOME/trenchclaw" ]; then'
    printf '%s\n' '  echo "[trenchclaw] invalid app install at $APP_HOME" >&2'
    printf '%s\n' '  exit 1'
    printf '%s\n' 'fi'
    printf '%s\n' 'exec "$APP_HOME/trenchclaw" "$@"'
  } >"$launcher_path"
  chmod 755 "$launcher_path"
}

install_bundle() {
  local platform
  local artifact_name
  local bundle_url
  local checksum_url
  local version_root
  local current_link
  local tmp_dir
  local tmp_bundle
  local tmp_checksum
  local extract_root
  local expected_sha
  local actual_sha
  local launcher_path

  platform="$(detect_platform)"
  resolved_install_dir="$(choose_install_dir)"
  resolved_app_home="$(choose_app_home)"
  resolved_version="$(resolve_release_tag)"

  require_cmd curl
  require_cmd tar
  require_cmd mktemp

  assert_writable_path "$resolved_install_dir" "Install directory"
  assert_writable_path "$resolved_app_home" "App directory"

  mkdir -p "$resolved_install_dir" "$resolved_app_home"
  add_path_for_current_process "$resolved_install_dir"
  ensure_path_config "$resolved_install_dir"
  installed_version_before="$(read_installed_version "$resolved_app_home")"

  if [[ -n "$installed_version_before" && "$installed_version_before" == "$resolved_version" && -x "$resolved_install_dir/$APP_NAME" ]]; then
    info "TrenchClaw $resolved_version is already installed at $resolved_app_home/current"
    return 0
  fi

  if [[ -n "$artifact_name_override" ]]; then
    artifact_name="$artifact_name_override"
  else
    artifact_name="trenchclaw-$resolved_version-$platform.tar.gz"
  fi

  if [[ -n "$download_base_url" ]]; then
    bundle_url="$download_base_url/$resolved_version/$artifact_name"
  else
    bundle_url="https://github.com/$repo/releases/download/$resolved_version/$artifact_name"
  fi
  checksum_url="${bundle_url}.sha256"
  version_root="$resolved_app_home/$resolved_version"
  current_link="$resolved_app_home/current"
  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/trenchclaw-install-$resolved_version-$platform-XXXXXX")"
  tmp_bundle="$tmp_dir/$artifact_name"
  tmp_checksum="$tmp_dir/$artifact_name.sha256"
  extract_root="$tmp_dir/extracted"

  cleanup_install_tmp() {
    rm -rf "$tmp_dir"
  }
  trap cleanup_install_tmp EXIT INT TERM HUP

  info "Installing TrenchClaw $resolved_version"
  info "Download: $bundle_url"

  curl -fsSL "$bundle_url" -o "$tmp_bundle" || fail "Failed to download TrenchClaw release"
  curl -fsSL "$checksum_url" -o "$tmp_checksum" || fail "Failed to download TrenchClaw checksum"

  expected_sha="$(read_expected_sha256 "$tmp_checksum")"
  [[ -n "$expected_sha" ]] || fail "Checksum file did not include a sha256 value"

  actual_sha="$(compute_sha256 "$tmp_bundle")"
  [[ -n "$actual_sha" ]] || fail "Could not compute sha256 checksum"

  if [[ "$actual_sha" != "$expected_sha" ]]; then
    fail "Checksum mismatch for $artifact_name (expected $expected_sha, got $actual_sha)"
  fi

  mkdir -p "$extract_root"
  tar -xzf "$tmp_bundle" -C "$extract_root" || fail "Failed to extract TrenchClaw release"

  [[ -x "$extract_root/trenchclaw" ]] || fail "Release archive did not contain executable trenchclaw"
  [[ -d "$extract_root/gui" ]] || fail "Release archive did not contain gui/"
  [[ -d "$extract_root/core" ]] || fail "Release archive did not contain core/"
  [[ -f "$extract_root/release-metadata.json" ]] || fail "Release archive did not contain release-metadata.json"

  rm -rf "$version_root"
  mkdir -p "$version_root"
  cp -R "$extract_root/." "$version_root/"

  rm -f "$current_link"
  ln -s "$version_root" "$current_link"

  launcher_path="$resolved_install_dir/$APP_NAME"
  write_launcher "$launcher_path" "$resolved_app_home"
  [[ -x "$launcher_path" ]] || fail "Failed to create TrenchClaw launcher"

  trap - EXIT INT TERM HUP
  cleanup_install_tmp
}

print_summary() {
  local launcher_path="$resolved_install_dir/$APP_NAME"

  echo
  if [[ -n "$installed_version_before" && "$installed_version_before" != "$resolved_version" ]]; then
    info "Update complete."
    info "Updated: $installed_version_before -> $resolved_version"
  else
    info "Install complete."
    info "Version: $resolved_version"
  fi
  info "Launcher: $launcher_path"
  info "Readonly app root: $resolved_app_home/current"
  info "Writable state root: ${TRENCHCLAW_RUNTIME_STATE_ROOT:-$HOME/.trenchclaw}"

  if [[ "$no_modify_path" == "true" ]]; then
    info "PATH was not modified. Add this if needed: export PATH=$resolved_install_dir:\$PATH"
  elif ! command -v "$APP_NAME" >/dev/null 2>&1; then
    info "If your current shell still cannot find trenchclaw, run: exec \$SHELL -l"
  fi

  info "Next steps:"
  info "  trenchclaw"
  info "  trenchclaw doctor"
  info "  docs: $DEFAULT_DOCS_URL/getting-started"

  if [[ "$install_required_tools" == "1" ]]; then
    info "Optional CLI helper: curl -fsSL https://trenchclaw.vercel.app/install-tools | sh"
  fi

  if [[ -n "${GITHUB_ACTIONS:-}" && "${GITHUB_ACTIONS}" == "true" && -n "${GITHUB_PATH:-}" ]]; then
    printf '%s\n' "$resolved_install_dir" >>"$GITHUB_PATH"
    info "Added $resolved_install_dir to GITHUB_PATH"
  fi
}

main() {
  parse_args "$@"
  install_bundle
  print_summary

  if [[ "$reload_shell" == "1" ]]; then
    info "Reloading shell..."
    exec "${SHELL:-/bin/sh}" -l
  fi
}

main "$@"
