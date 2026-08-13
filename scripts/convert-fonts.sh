#!/usr/bin/env bash
# convert-fonts.sh — Converts TTF sources to WOFF2 for self-hosting
# Requires: npx ttf2woff2 (or system woff2_compress)
# Sources are NEVER modified — output goes to apps/web/public/fonts/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
SOURCES="$ROOT/references/fonts"
OUTPUT="$ROOT/apps/web/public/fonts"

mkdir -p "$OUTPUT"

echo "=== Converting Cormorant Garamond (used weights: 400, 400i, 500, 600) ==="
CG="$SOURCES/cormorant-garamond"

convert_font() {
  local src="$1"
  local dest="$2"
  if command -v woff2_compress &>/dev/null; then
    woff2_compress "$src"
    local woff2="${src%.ttf}.woff2"
    mv "$woff2" "$dest"
  else
    npx --yes ttf2woff2 < "$src" > "$dest"
  fi
  echo "  ✓ $(basename $dest)"
}

convert_font "$CG/CormorantGaramond-Regular.ttf"       "$OUTPUT/CormorantGaramond-Regular.woff2"
convert_font "$CG/CormorantGaramond-Italic.ttf"        "$OUTPUT/CormorantGaramond-Italic.woff2"
convert_font "$CG/CormorantGaramond-Medium.ttf"        "$OUTPUT/CormorantGaramond-Medium.woff2"
convert_font "$CG/CormorantGaramond-MediumItalic.ttf"  "$OUTPUT/CormorantGaramond-MediumItalic.woff2"
convert_font "$CG/CormorantGaramond-SemiBold.ttf"      "$OUTPUT/CormorantGaramond-SemiBold.woff2"
convert_font "$CG/CormorantGaramond-SemiBoldItalic.ttf" "$OUTPUT/CormorantGaramond-SemiBoldItalic.woff2"

echo ""
echo "=== Converting Hanken Grotesk (used weights: 400, 500) ==="
HG="$SOURCES/hanken-grotesk"

convert_font "$HG/HankenGrotesk-Regular.ttf"  "$OUTPUT/HankenGrotesk-Regular.woff2"
convert_font "$HG/HankenGrotesk-Italic.ttf"   "$OUTPUT/HankenGrotesk-Italic.woff2"
convert_font "$HG/HankenGrotesk-Medium.ttf"   "$OUTPUT/HankenGrotesk-Medium.woff2"

echo ""
echo "=== Done — WOFF2 files in $OUTPUT ==="
ls -lh "$OUTPUT/"*.woff2
