#!/usr/bin/env bash
set -euo pipefail

# Remove project-local React Native, Metro, Gradle, Android and test build
# leftovers without deleting source files, bundled assets or node_modules.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

paths=(
  ".cache"
  ".gradle"
  ".kotlin"
  ".eslintcache"
  ".jest-cache"
  ".metro-cache"
  ".react-native"
  "build"
  "coverage"
  "dist"
  "temp"
  "tmp"
  "android/.gradle"
  "android/.kotlin"
  "android/build"
  "android/app/.cxx"
  "android/app/.externalNativeBuild"
  "android/app/build"
  "ios/build"
  "node_modules/.cache"
)

for path in "${paths[@]}"; do
  if [[ -e "$path" ]]; then
    rm -rf -- "$path"
    printf 'Removed %s\n' "$path"
  fi
done

# Remove common generated logs and temporary bundle/map artifacts.
find "$ROOT_DIR" -type f \( \
    -name '*.log' -o \
    -name '*.tmp' -o \
    -name '*.temp' -o \
    -name '*.bundle' -o \
    -name '*.bundle.map' \
  \) \
  ! -path "$ROOT_DIR/.git/*" \
  ! -path "$ROOT_DIR/node_modules/*" \
  -print -delete

# Clear only React Native/Metro-related entries in the system temp directory.
TMP_ROOT="${TMPDIR:-/tmp}"
find "$TMP_ROOT" -maxdepth 1 -mindepth 1 -type d \( \
  -name 'metro-*' -o \
  -name 'haste-map-*' -o \
  -name 'react-native-packager-cache-*' \
\) -print -exec rm -rf -- {} + 2>/dev/null || true

if command -v watchman >/dev/null 2>&1; then
  watchman watch-del-all >/dev/null 2>&1 || true
  printf 'Cleared Watchman watches\n'
fi

printf 'Build caches and generated leftovers removed.\n'
