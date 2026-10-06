#!/usr/bin/env bash
# Render the Homebrew cask for a released version.
#
#   render-cask.sh <version> <sha256> <out.rb>
#
# The template (gitcontext.rb next to this script) is the whole cask; the
# release workflow renders it into kccarlos/homebrew-tap/Casks/gitcontext.rb.
set -euo pipefail

version="${1:?version}"
sha="${2:?sha256}"
out="${3:?output path}"

[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "render-cask: '$version' is not MAJOR.MINOR.PATCH" >&2; exit 2; }
[[ "$sha" =~ ^[0-9a-f]{64}$ ]] || { echo "render-cask: the checksum is not 64 lowercase hex digits" >&2; exit 2; }

template="$(dirname "$0")/gitcontext.rb"
mkdir -p "$(dirname "$out")"
sed -e "s/@VERSION@/$version/" -e "s/@SHA256@/$sha/" "$template" > "$out"
echo "render-cask: $out at $version"
