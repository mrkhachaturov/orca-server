# syntax=docker/dockerfile:1
# Entry point is `mise run build`: `COPY lib/orca/` takes the tree as it finds
# it, so a tree missing the series or the overlay builds and succeeds anyway.

# ── builder ────────────────────────────────────────────────────────────────
# Ubuntu 24.04 is what upstream builds Linux on (release-cut.yml).
FROM ubuntu:24.04@sha256:4fbb8e6a8395de5a7550b33509421a2bafbc0aab6c06ba2cef9ebffbc7092d90 AS builder

ARG VERSION
ARG PNPM_VERSION=10.24.0
ARG NODE_VERSION=24.18.0
ARG TARGETARCH

ENV DEBIAN_FRONTEND=noninteractive

# pipefail, so a bad checksum below cannot be masked by the pipe succeeding.
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# unzip: upstream's install-electron-package-binary.mjs shells out to it.
# libasound2 is virtual on noble — the real package carries the t64 suffix, and
# `apt-cache show` succeeds for either, so only a dry-run install tells you.
#
# Ubuntu's archive drops superseded versions, so a version pin here breaks at
# the next point release; the FROM digest is the pin.
# hadolint ignore=DL3008
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    xz-utils \
    unzip \
    build-essential \
    git \
    libasound2t64 \
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

RUN case "${TARGETARCH}" in \
    amd64) narch=x64 ;; \
    arm64) narch=arm64 ;; \
    *) echo >&2 "unsupported TARGETARCH: ${TARGETARCH}" && exit 1 ;; \
  esac \
  && tarball="node-v${NODE_VERSION}-linux-${narch}.tar.xz" \
  && base="https://nodejs.org/dist/v${NODE_VERSION}" \
  && curl -fsSLO "${base}/${tarball}" \
  && curl -fsSL "${base}/SHASUMS256.txt" -o SHASUMS256.txt \
  && grep " ${tarball}\$" SHASUMS256.txt | sha256sum -c - \
  && tar -xJf "${tarball}" -C /usr/local --strip-components=1 --no-same-owner \
  && rm "${tarball}" SHASUMS256.txt \
  && node --version && npm --version

RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate

WORKDIR /src
COPY lib/orca/ /src/

# Product identity, kept out of the series so a bump has nothing to restack.
COPY build/electron-builder.overlay.cjs /src/electron-builder.orca-server.cjs

RUN pnpm install --frozen-lockfile

# build:desktop typechecks, which is what validates the series.
RUN pnpm build:desktop \
  && pnpm ensure:electron-runtime \
  && pnpm exec electron-builder --config electron-builder.orca-server.cjs --linux AppImage

# The suffix is `uname -m`, not Docker's name, hence the translation.
ARG TARGETARCH
RUN mkdir -p /out \
  && case "${TARGETARCH}" in \
    amd64) arch=x86_64 ;; \
    arm64) arch=aarch64 ;; \
    *) echo >&2 "unsupported TARGETARCH: ${TARGETARCH}" && exit 1 ;; \
  esac \
  && f="$(find dist -maxdepth 1 -name '*.AppImage' -print -quit)" \
  && test -n "$f" \
  && cp "$f" "/out/orca-server-${VERSION}-${arch}.AppImage" \
  && find /out -type f -exec ls -l {} +

# ── export ─────────────────────────────────────────────────────────────────
# `buildx --output type=local` writes this stage's filesystem out. Nothing here
# is ever pushed as an image.
FROM scratch AS export
COPY --from=builder /out/ /
