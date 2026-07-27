#!/usr/bin/env bash
set -euo pipefail

main() {
  cd "$(dirname "$0")/../.."

  doctoc --title '# Contributing' docs/CONTRIBUTING.md > /dev/null
  doctoc --title '# Maintaining' docs/MAINTAINING.md > /dev/null
  doctoc --title '# Install' docs/install.md > /dev/null
  doctoc --title '# Contributor Covenant Code of Conduct' docs/CODE_OF_CONDUCT.md > /dev/null

  if [[ ${CI-} && $(git ls-files --other --modified --exclude-standard) ]]; then
    echo "Files need generation or are formatted incorrectly:"
    git -c color.ui=always status | grep --color=no '\[31m'
    echo "Please run the following locally:"
    echo "  ./ci/dev/doctoc.sh"
    exit 1
  fi
}

main "$@"
