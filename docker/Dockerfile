# syntax=docker/dockerfile:1

# ─── Stage: dev ───────────────────────────────────────────────────────────────
# Lean environment for compile, test, typecheck, and running the Claude agent.
# No GUI/WebView deps — cannot run `tauri build` for Linux bundles here.
FROM ubuntu:22.04 AS dev

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=UTC \
    LANG=C.UTF-8 \
    # Rust toolchain
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/root/.cargo \
    PATH=/root/.cargo/bin:$PATH

# System packages:
#   build-essential, cmake, pkg-config — C toolchain + CMake for libgit2-sys
#   libssl-dev, zlib1g-dev            — git2 crate (libgit2) build deps
#   git, curl, jq, ripgrep            — agent workflow utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    pkg-config \
    libssl-dev \
    zlib1g-dev \
    git \
    curl \
    jq \
    ripgrep \
    ca-certificates \
    tmux \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22 (via NodeSource)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Rust stable (minimal profile — no docs)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y \
        --no-modify-path \
        --profile minimal \
        --default-toolchain stable \
    && rustup component add clippy rustfmt

# Claude Code CLI (coding agent) + Ralph loop runner
RUN npm install -g @anthropic-ai/claude-code @iannuttall/ralph

WORKDIR /workspace

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["bash"]

# ─── Stage: linux-bundle ──────────────────────────────────────────────────────
# Extends dev with WebKit2GTK + GTK so `tauri build` can produce Linux AppImage
# / .deb / .rpm artifacts inside the container (useful for CI).
FROM dev AS linux-bundle

RUN apt-get update && apt-get install -y --no-install-recommends \
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    && rm -rf /var/lib/apt/lists/*
