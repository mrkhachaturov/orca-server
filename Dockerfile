# syntax=docker/dockerfile:1
# Builds the patched Orca and EXPORTS a .AppImage. Nothing ships as an image —
# the final `export` stage is copied out with `buildx --output type=local`.
#
# Docker is only a hermetic build sandbox. The base is Debian bookworm
# (glibc 2.36), a floor at or below the Debian hosts this runs on; building on
# whatever the CI runner happens to be would tie the AppImage's glibc to it.
#
# The build consumes `lib/orca` WITH THE SERIES APPLIED AND THE OVERLAY COPIED
# IN — run `quilt push -a && ./ci/build/overlay.sh` (or
# ./ci/build/build-appimage.sh, which does both) first. `COPY lib/orca/` takes
# the working tree as it finds it, so a missing overlay builds an image without
# our own source and reports success. It deliberately does NOT clone upstream
# itself: the submodule commit is the single pin for which Orca this is, and a
# second clone inside the build could disagree with it.
#
# electron-builder 26's default AppImage toolset is a STATIC runtime (bundled
# mksquashfs + a prepended runtime binary) — so the build needs no FUSE and no
# appimagetool, and runs unprivileged in CI.

# ── builder ────────────────────────────────────────────────────────────────
# Mirrors Orca's own build env: node + the toolchain electron-builder and the
# single native dep (node-pty) need. node and pnpm are pinned to what upstream
# declares (`engines.node`, `packageManager`) — a newer pnpm breaks the frozen
# lockfile, a newer node is not what upstream builds against.
FROM node:24-bookworm AS builder

ARG VERSION
ARG PNPM_VERSION=10.24.0

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    libasound2 \
    libatk-bridge2.0-0 \
    libatspi2.0-0 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libsecret-1-dev \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxss1 \
    pkg-config \
    python3 \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate

WORKDIR /src
COPY lib/orca/ /src/

# Product identity. Kept out of the patch series on purpose: electron-builder's
# `extends` deep-merges this over upstream's config, so the rename costs nothing
# to restack on an upstream bump. See the file for what is and is not renamed.
COPY ci/build/electron-builder.overlay.cjs /src/electron-builder.orca-server.cjs

# Frozen lockfile keeps the build reproducible against upstream's committed lock.
RUN pnpm install --frozen-lockfile

# build:desktop = typecheck (which is what validates the series) + relay + cli +
# electron-vite + web. Then rebuild node-pty against Electron's ABI and package a
# Linux AppImage.
RUN pnpm build:desktop \
  && pnpm ensure:electron-runtime \
  && pnpm exec electron-builder --config electron-builder.orca-server.cjs --linux AppImage

# Stage the single .AppImage under a predictable, versioned name for release.
RUN mkdir -p /out \
  && f="$(ls dist/*.AppImage | head -1)" \
  && test -n "$f" \
  && cp "$f" "/out/orca-server-${VERSION}-x86_64.AppImage" \
  && ls -l /out

# ── export ─────────────────────────────────────────────────────────────────
# `buildx --output type=local,dest=./dist` writes THIS stage's filesystem to
# ./dist — i.e. just the .AppImage (mode 0755 preserved). No runtime image.
FROM scratch AS export
COPY --from=builder /out/ /
