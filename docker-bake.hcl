# Build target for the orca-server AppImage.
#
# Docker is only a hermetic build sandbox — the `export` stage is written out
# via `buildx --output type=local`, never pushed as an image. Do not add
# registry or push logic here.
#
# VERSION and PNPM_VERSION are NOT pinned in this file. They are read off the
# pinned submodule by ci/build/build-appimage.sh, which is the only supported
# entry point:
#
#   ./ci/build/build-appimage.sh        -> ./dist/orca-server-<tag>-x86_64.AppImage
#
# Keeping them out of here is the point: the submodule commit is the single
# source of truth for which Orca this is. A version literal in this file would
# be a second pin, free to drift.

variable "VERSION" {
  default = ""
}

variable "PNPM_VERSION" {
  default = ""
}

variable "SOURCE" {
  default = "https://github.com/mrkhachaturov/orca-server"
}

group "default" {
  targets = ["appimage"]
}

target "appimage" {
  context   = "."
  target    = "export"
  platforms = ["linux/amd64"]
  output    = ["type=local,dest=./dist"]
  args = {
    VERSION      = "${VERSION}"
    PNPM_VERSION = "${PNPM_VERSION}"
  }
  labels = {
    "org.opencontainers.image.source" = "${SOURCE}"
  }
}
