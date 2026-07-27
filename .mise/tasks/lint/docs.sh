#!/usr/bin/env bash
#MISE description="Regenerate the tables of contents in docs/"
#MISE dir="{{config_root}}"
set -euo pipefail

main() {

  doctoc --title '# Contributing' docs/CONTRIBUTING.md > /dev/null
  doctoc --title '# Maintaining' docs/MAINTAINING.md > /dev/null
  doctoc --title '# Install' docs/install.md > /dev/null
  doctoc --title '# Contributor Covenant Code of Conduct' docs/CODE_OF_CONDUCT.md > /dev/null

  # Scoped to docs/ so this is runnable locally with CI=1, which is how you catch
  # the failure before pushing. Unscoped it also reports lib/orca, which is dirty
  # on any machine that has the patch series applied.
  if [[ ${CI-} && $(git ls-files --other --modified --exclude-standard -- docs) ]]; then
    echo "Files need generation or are formatted incorrectly:"
    git -c color.ui=always status -- docs | grep --color=no '\[31m'
    echo "Please run the following locally:"
    echo "  mise run lint:docs"
    exit 1
  fi
}

main "$@"
