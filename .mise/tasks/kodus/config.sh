#!/usr/bin/env bash
#MISE description="Validate kodus-config.yml against the vendored Kodus schema"
#MISE dir="{{config_root}}"

# The schema sets additionalProperties false and requires eleven keys, so one wrong
# name invalidates the file rather than the line — and Kodus reports that only in
# its own logs, after a review has already been skipped.
#
# .kody/codereview.schema.json is vendored from kodustech/kodus-ai at the tag this
# instance runs. Re-vendor it when Kodus is upgraded:
#   jq -S . <kodus-ai>/libs/common/schemas/codereview.json > .kody/codereview.schema.json

set -Eeuo pipefail

SCHEMA=.kody/codereview.schema.json
CONFIG=kodus-config.yml
MODULES=lib/orca/node_modules

function main() {
  [ -d "$MODULES/ajv" ] && [ -d "$MODULES/js-yaml" ] || {
    echo "ajv and js-yaml come from the submodule's install — run pnpm install in lib/orca" >&2
    return 1
  }

  # shellcheck disable=SC2016  # the ${} inside are JS template literals; the shell
  # must not expand them — the paths arrive as argv.
  node -e '
    const fs = require("fs")
    const [modules, schemaPath, configPath] = process.argv.slice(1)
    const Ajv = require(`${process.cwd()}/${modules}/ajv`)
    const yaml = require(`${process.cwd()}/${modules}/js-yaml`)
    const validate = new Ajv({ allErrors: true, strictTypes: false })
      .compile(JSON.parse(fs.readFileSync(schemaPath, "utf8")))
    if (validate(yaml.load(fs.readFileSync(configPath, "utf8")))) {
      console.log(`${configPath} is valid`)
      process.exit(0)
    }
    for (const e of validate.errors) {
      console.error(`${e.instancePath || "/"} ${e.message}`, e.params ?? "")
    }
    process.exit(1)
  ' "$MODULES" "$SCHEMA" "$CONFIG"
}

main "$@"
