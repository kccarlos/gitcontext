# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

GitContext is a privacy-first, browser-based tool for analyzing Git repositories and packaging code/diffs into LLM-friendly format. It runs as both a web app (React + Vite) and desktop app (Tauri 2.0), using isomorphic-git for in-browser Git operations.

**Key architectural principle**: Zero server dependency. All Git operations run client-side using isomorphic-git + LightningFS (in browser) or native Rust git operations via libgit2 (in Tauri desktop).

## Build and Development Commands

### Web App
```bash
# Development
npm run web:dev              # Start dev server on localhost:5173

# Build
npm run web:build           # Production build
npm run web:preview         # Preview production build

# Testing
npm --workspace apps/web run test:e2e    # Run Playwright e2e tests
npm --workspace apps/web run test:unit   # Run Vitest unit tests
npm --workspace apps/web run test        # Run all tests
```

### Tauri Desktop App
```bash
# Development
npm run desktop:dev         # Start Tauri with hot reload

# Build
npm run desktop:build       # Package desktop app for current platform

# Rust development
cd apps/desktop/src-tauri
cargo build                 # Build Rust backend
cargo test                  # Run Rust tests
```

### Linting
```bash
npm run lint               # Lint all workspaces
npm run web:lint           # Lint web workspace only
```

## Architecture

### Dual Runtime Strategy

GitContext supports two execution modes determined at runtime:

1. **Web Mode** (Browser): Uses `isomorphic-git` + `LightningFS` for in-memory file system, all Git operations via Web Worker (`apps/web/src/workers/gitWorker.ts`)
2. **Desktop Mode** (Tauri): Uses native Rust Git operations via Tauri commands (`apps/desktop/src-tauri/src/git.rs` using libgit2)

The mode is abstracted via `apps/web/src/platform/gitFactory.ts` which returns a `GitEngine` interface. The app code doesn't distinguish between modes.

### Core Flow

1. **Repository Loading** (`apps/web/src/hooks/useGitRepository.ts`):
   - User selects directory via File System Access API (web) or native dialog (desktop)
   - For web: snapshots `.git` directory contents and passes to worker
   - Worker initializes LightningFS, seeds with Git objects, lists branches
   - Desktop: Tauri commands directly use native filesystem and libgit2

2. **Diff Computation** (`apps/web/src/hooks/useFileTree.ts`):
   - Computes name-status diff between two branches via `GitEngine.diff()`
   - Builds file tree with status markers (add/modify/remove/unchanged/rename/copy)
   - Supports filtering to changed files only
   - Race condition prevention with request ID tracking

3. **File Reading** (`apps/web/src/utils/diff.ts`):
   - Reads file content at specific refs via `GitEngine.readFile()`
   - Binary detection via extension patterns (`@gitcontext/core` package)
   - Generates unified diffs using `diff` library
   - Handles non-UTF8 files with lossy conversion (Rust backend)

4. **Token Counting** (`apps/web/src/hooks/useTokenCounts.ts`):
   - Uses `@dqbd/tiktoken` (cl100k_base encoding) for GPT-4/3.5 token estimation
   - Debounced counting on selection changes with cancelation support
   - Bounded concurrency for efficient batch processing
   - Matches exact output format for accuracy

5. **Output Generation** (`apps/web/src/App.tsx`):
   - Aggregates selected files/diffs into single text blob
   - Includes file tree structure, model context windows
   - One-click copy to clipboard
   - Template system for custom instructions

### Key Directories

- `apps/web/` - Web application
  - `src/components/` - UI components (file tree, preview modal, status bar, etc.)
  - `src/hooks/` - Core business logic hooks (useGitRepository, useFileTree, useWorkspaces, useTokenCounts)
  - `src/utils/` - Pure utility functions (diff, tokenizer, binary detection, gitWorkerClient)
  - `src/platform/` - Abstraction layer for web vs desktop (`gitFactory.ts`, `tokenizerFactory.ts`)
  - `src/workers/` - Web Worker for Git operations (`gitWorker.ts`)
  - `src/types/` - TypeScript type definitions
  - `src/context/` - React Context providers

- `apps/desktop/` - Tauri desktop application
  - `src/` - Frontend code (shares UI with web app)
  - `src-tauri/src/` - Rust backend
    - `git.rs` - Git operations using libgit2
    - `main.rs` - Tauri main entry point
    - `lib.rs` - Tauri command registration

- `packages/core/` - Shared utilities
  - Binary file detection
  - Constants and types

### Worker Communication Pattern

Web Worker API (`apps/web/src/utils/gitWorkerClient.ts`):
```typescript
type RequestMessage = { id: number; type: 'loadRepo' | 'diff' | 'readFile' | ... }
type ResponseMessage =
  | { id: number; type: 'ok'; data: any }
  | { id: number; type: 'error'; error: string }
  | { id: number; type: 'progress'; message: string }
```

Messages are request-response paired by `id`. Progress messages stream without resolving the request.

### File System Access

**Web**: Uses File System Access API (`apps/web/src/utils/fs.ts`):
- `pickDirectory()` - Prompts user for directory handle
- `ensurePermission()` - Requests read permission
- `snapshotGitFiles()` - Recursively reads `.git` directory into memory
- `snapshotWorktreeFiles()` - Reads working tree for WORKDIR support

**Desktop**: Native filesystem via Tauri commands, no snapshots needed. Uses Rust file I/O with libgit2.

### Persistence

- **Workspace History** (`src/web/src/hooks/useWorkspaces.ts`): Stores FileSystemDirectoryHandle references in IndexedDB for quick repo reopening (web only, requires File System Access API)
- **Branch Selection**: Persisted per-repo in localStorage
- **Theme Preference**: Stored in localStorage

## Important Patterns

### Binary File Handling

Binary files are detected by extension patterns (`packages/core/src/binary.ts`). When detected:
- File tree marks them with `isLikelyBinary: true`
- Preview shows "[Binary file]" placeholder
- Output includes binary notice instead of content
- First 8KB can be sniffed for content-based detection

### Token Counting

Token counting is debounced (300ms) to avoid blocking UI during selection changes. The counting happens in main thread (not worker) because tiktoken WASM module is easier to load there. Token counts match exact output format for accuracy.

### Error Handling

Errors are logged via `apps/web/src/utils/logger.ts` which wraps console with error codes for easier debugging. User-facing errors set `appStatus` state with error messages shown in StatusBar. Effects handle errors with logging instead of throwing to prevent unhandled rejections.

### Git Operations Abstraction

Never call `isomorphic-git` or Tauri commands directly from React components. Always use:
1. `GitEngine` interface from `gitFactory.ts`
2. Hook methods like `gitClient.diff()`, `gitClient.readFile()`
3. This allows desktop/web modes to swap implementations transparently

### Race Condition Prevention

Async operations that can be triggered multiple times use request ID tracking to ignore stale results:
- Preview file operations (`previewRequestIdRef`)
- Diff computation (`diffRequestIdRef`)
- Token counting with abort controller

### Design Token System

The app uses CSS custom properties for consistent spacing, sizing, and colors:
- **Spacing scale**: `--space-0` through `--space-12` (8px base unit)
- **Border radius**: `--radius-sm` through `--radius-xl`
- **Font sizes**: `--text-xs` through `--text-2xl`
- **Colors**: `--primary`, `--surface-1`, `--surface-2`, `--border-col`

All hardcoded spacing/sizing values should use these tokens for maintainability.

## Testing

- **E2E Tests**: Playwright tests in `apps/web/tests/e2e/` - test actual file system operations and Git workflows
- **Unit Tests**: Vitest tests for utilities (when present)
- **Rust Tests**: Cargo tests in `apps/desktop/src-tauri/src/` - test Git operations
- Tests run in web mode by default

## Build Process

### Web Build
1. Vite bundles React app with Node.js polyfills (buffer, process, stream, path)
2. Worker bundled separately as ES module via `worker.format: 'es'`
3. tiktoken excluded from optimizeDeps to preserve WASM handling

### Tauri Desktop Build
1. Frontend: Vite builds with `TAURI=1` flag
2. Backend: Cargo compiles Rust code with libgit2
3. Tauri CLI bundles frontend + backend together
4. Output: DMG (macOS), NSIS installer (Windows), AppImage (Linux)

### Release Pipeline
Semantic-release on main branch:
1. `build-desktop` job builds all 3 platforms in parallel using Tauri
2. `release` job runs semantic-release, creates GitHub release with binaries
3. `deploy-pages` job builds web app and deploys to GitHub Pages

Version bumps follow conventional commits (fix/feat/BREAKING CHANGE).

## Development Notes

- **Monorepo Structure**: NPM workspaces with `apps/web`, `apps/desktop`, `packages/core`
- **Vite Config**: `apps/web/vite.config.ts` configures conditional Tauri plugins, Node polyfills, WASM support
- **File System Access API**: Only available in secure contexts (HTTPS or localhost). Degrades gracefully if unavailable.
- **LightningFS Caching**: Git objects stored in IndexedDB for fast reloads (web mode)
- **Rust Backend**: libgit2 provides native Git operations with better performance than isomorphic-git

## Git Workflow

### Branch Strategy
- **dev**: Main development branch - all changes go here first
- **main**: Production branch - only receives merges from dev after testing
- Always push to `dev` first, then merge to `main` after verification

### Commit Message Format
Follow conventional commits (semantic git):
- `feat: description` - New features
- `fix: description` - Bug fixes
- `refactor: description` - Code refactoring
- `chore: description` - Maintenance tasks
- `docs: description` - Documentation changes
- `test: description` - Test changes
- `style: description` - Code style changes (formatting, etc.)

**IMPORTANT**: Do NOT include authorship information (like `Co-Authored-By`) in commit messages. Let Git handle authorship automatically.

### Commit Best Practices
- Write clear, concise commit messages
- Focus on the "why" rather than the "what"
- Keep commits atomic and focused on a single change
- Use imperative mood ("add feature" not "added feature")
- Include context in the body if the change needs explanation

Example good commit:
```
feat: implement unified spacing scale and design tokens

- Add comprehensive design token system to both web and desktop
- Convert all hardcoded spacing/sizing values to use tokens
- Ensures visual consistency across the application
```

## Code Style

- TypeScript strict mode enabled
- React functional components with hooks (no class components)
- Prefer explicit types over inference for public APIs
- Use `useCallback` for functions passed to children to avoid re-renders
- Worker messages must include `id` for request-response pairing
- Use design tokens for all spacing, sizing, and color values
