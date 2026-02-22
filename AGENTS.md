# GitContext Agent Instructions

Purpose: execute one PRD story per loop iteration with high signal, low risk changes.

## Scope
- Complete only the selected PRD story. Do not expand scope.
- Read `CLAUDE.md` before acting — it is the source of truth for architecture.
- Read relevant code before editing; do not assume missing behavior.
- Keep changes small, deterministic, and reversible.

## Required Quality Gates
- Every behavior change must include tests (new tests or updates to existing tests).
- Run all available checks before committing:
  - Frontend lint: `npm run web:lint`
  - Frontend build: `npm run web:build`
  - Rust fmt: `cargo fmt --check --manifest-path apps/desktop/src-tauri/Cargo.toml`
  - Rust lint: `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings`
  - Rust check: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
  - Rust tests: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
- If any required check fails, do not commit. Fix or report the exact failure.

## Project Commands
- Install deps: `npm install`
- Web dev server: `npm run web:dev`
- Web build: `npm run web:build`
- Web lint: `npm run web:lint`
- Web unit tests: `npm --workspace apps/web run test:unit`
- Web e2e tests: `npm --workspace apps/web run test:e2e`
- Desktop dev: `npm run desktop:dev` (requires macOS host — not available in Docker)
- Desktop build: `npm run desktop:build` (requires macOS host — not available in Docker)
- Rust cargo check: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
- Rust cargo clippy: `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings`
- Rust cargo fmt check: `cargo fmt --check --manifest-path apps/desktop/src-tauri/Cargo.toml`
- Rust cargo test: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`

## Architecture Notes
- This is a Tauri 2.0 + React/Vite monorepo. See `CLAUDE.md` for full details.
- Never call `isomorphic-git` or Tauri commands directly from React components — always go through `GitEngine` in `apps/web/src/platform/gitFactory.ts`.
- Web mode uses isomorphic-git + LightningFS via Web Worker. Desktop mode uses native Rust/libgit2.
- `npm run desktop:*` commands require a real macOS environment (GUI + Xcode toolchain). In Docker, only run `npm run web:*` and `cargo *`.

## Verification Reporting
- For each story, write a verification report at:
  - `.codex/ralph-gitcontext/verify/<story-id>.md`
- Report must include:
  - story id/title
  - commands run with pass/fail per command
  - files changed
  - unresolved risks or follow-ups
  - standalone line: `VERIFIED: YES`

## Commits
- Use semantic commit messages (Conventional Commits): `<type>(<scope>): <subject>`
- Allowed types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `build`, `perf`, `style`, `revert`
- Only commit when all required checks pass.
- Do NOT include `Co-Authored-By` or authorship lines in commit messages.

## Safety Rules
- Never commit secrets, credentials, tokens, cookies, or private keys.
- Do not weaken tests or skip checks to make CI pass.
- Do not use destructive git commands (`reset --hard`, forced checkout, history rewrite).
- If requirements conflict or are unclear, stop and document the blocker in the verification report.
