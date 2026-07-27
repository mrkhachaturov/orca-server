# Docker is only a build sandbox here: never add registry or push logic.
#
# The versions below stay empty. `mise run build` reads them off the pinned
# submodule; a literal here would be a second pin, free to drift.

variable "VERSION" {
  default = ""
}

variable "PNPM_VERSION" {
  default = ""
}

variable "NODE_VERSION" {
  default = ""
}

variable "SOURCE" {
  default = "https://github.com/mrkhachaturov/orca-server"
}

# The build task overrides this with the host's architecture. Setting it
# explicitly cross-builds under qemu, which is slow enough to be impractical.
variable "PLATFORMS" {
  default = "linux/amd64"
}

group "default" {
  targets = ["appimage"]
}

target "appimage" {
  context   = "."
  target    = "export"
  platforms = split(",", PLATFORMS)
  output    = ["type=local,dest=./dist"]
  args = {
    VERSION      = "${VERSION}"
    PNPM_VERSION = "${PNPM_VERSION}"
    NODE_VERSION = "${NODE_VERSION}"
  }
  labels = {
    "org.opencontainers.image.source" = "${SOURCE}"
  }
}
