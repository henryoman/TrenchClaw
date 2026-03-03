#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec bun apps/runner/dist/index.js "$@"
