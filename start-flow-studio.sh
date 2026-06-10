#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if command -v powershell.exe >/dev/null 2>&1; then
  powershell.exe -NoProfile -ExecutionPolicy Bypass \
    -File "$SCRIPT_DIR/start-flow-studio.ps1"
elif command -v pwsh >/dev/null 2>&1; then
  pwsh -NoProfile -File "$SCRIPT_DIR/start-flow-studio.ps1"
else
  echo "This launcher requires PowerShell because Edge CDP startup is Windows-specific." >&2
  exit 1
fi
