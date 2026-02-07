<h1 align="center">
  <img src="./apps/web/public/gitcontext.svg" width="50">
  <span>GitContext</span>
</h1>

<p align="center">
  <em>100% private codebase context engineering tool<br>
  Fully local app to package your codebase files and diffs into LLM-friendly format</em>
</p>

<p align="center">
<a href="https://github.com/kccarlos/gitcontext/actions/workflows/release.yml"><img src="https://github.com/kccarlos/gitcontext/actions/workflows/release.yml/badge.svg" alt="Build Status"></a>
<a href="https://github.com/kccarlos/gitcontext/releases/latest"><img src="https://img.shields.io/github/v/release/kccarlos/gitcontext" alt="Latest Release"></a>
<a href="https://github.com/kccarlos/gitcontext/blob/main/LICENSE"><img src="https://img.shields.io/github/license/kccarlos/gitcontext" alt="License"></a>
</p>

---

**GitContext** lets you securely analyze and package local Git repository diffs directly on your machine for quick copy-and-paste into AI Chatbots like ChatGPT, Claude, and others. Available as a high-performance native desktop app (Tauri + Rust) for macOS, Windows, and Linux, or as a web app running entirely in your browser.

Similar to Repomix or GitIngest, but with key differences:

- **Zero servers, zero uploads** – everything runs entirely locally on your machine or in your browser
- **Native performance** – desktop app uses Rust for blazing-fast Git operations
- Supports **Git diffs** between branches, not just files
- Generate a **file tree** with your selected code/diffs for easy LLM ingestion
- **One-click prompt templates** tailored for common coding scenarios
- **Real-time token counting** to stay within LLM context limits

## Downloads & Installation

### Desktop App (Recommended)

Download the latest native desktop app for your operating system from the [GitHub Releases](https://github.com/kccarlos/gitcontext/releases/latest) page:

- **macOS**: `.dmg` file
- **Windows**: `.msi` or `.exe` installer
- **Linux**: `.AppImage`, `.deb`, or `.rpm` package

The desktop app offers superior performance with native Rust-powered Git operations.

### Web App

Alternatively, use the web version directly at [gitcontext.xyz](https://gitcontext.xyz) — no installation required!

The web app runs entirely in your browser using modern Web APIs and never uploads your code anywhere.

---

## What is GitContext?

GitContext is a **privacy-first, local-first** application for analyzing and staging Git repository diffs — all without any cloud services.

**Desktop App** uses:
- Native file system access with Tauri
- Blazing-fast Git operations via Rust's `git2` crate
- Multi-threaded performance for large repositories

**Web App** uses:
- File System Access API for local-only file system access
- `isomorphic-git` for client-side Git operations
- Web workers + IndexedDB caching for performance

**Key features:**
- Local-only file system access with persistent permissions
- Real-time Git operations with visual diff analysis
- Interactive file tree navigation and selective staging
- Instant token count estimation for LLM context limits (GPT-4, Claude, etc.)
- Flexible output formats with smart handling of binary files
- Dark mode support

---

## Why I Built It

As a developer who frequently works with ChatGPT, Claude, and other LLMs, I found existing tools lacking:

- Needed a **visual way to pick files and diffs** instead of crafting CLI filters
- Wanted **branch-to-branch diffs** for scenarios like code reviews and bug fixes
- Preferred an **interactive workflow** over command-line arguments
- Required **privacy** — no uploading code to third-party servers

Passing only relevant context to an LLM significantly improves accuracy — especially in large codebases with overlapping names and structures. See [Context Rot](https://research.trychroma.com/context-rot) for why trimming irrelevant context matters.

---

## Tech Stack

### Desktop App (Tauri)
- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Rust + Tauri 2.0
- **Git Operations**: `git2` crate (native Rust)
- **Token Counting**: `tiktoken` (WASM)

### Web App
- **Frontend**: React 18 + TypeScript + Vite
- **Git Operations**: `isomorphic-git` + LightningFS
- **Token Counting**: `tiktoken` (WASM)
- **Storage**: IndexedDB for caching

### Shared Packages (Monorepo)
- `@gitcontext/ui` - Shared React components
- `@gitcontext/core` - Shared types and utilities

---

## Getting Started

This project uses a monorepo structure with NPM workspaces.

### Prerequisites

```bash
npm install
```

### Web App

Run the web app in development mode:

```bash
npm run web:dev
```

Build the web app for production:

```bash
npm run web:build
npm run web:preview
```

The web app will be available at http://localhost:5173

### Desktop App

**Prerequisites**:
- [Rust](https://rustup.rs/) must be installed
- Platform-specific dependencies:
  - **macOS**: Xcode Command Line Tools
  - **Linux**: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`
  - **Windows**: Microsoft Visual C++ Build Tools

Run the desktop app in development mode:

```bash
npm run desktop:dev
```

Build the desktop app for production:

```bash
npm run desktop:build
```

Installers will be created in `apps/desktop/src-tauri/target/release/bundle/`

### Testing

Run end-to-end tests:

```bash
npm --workspace apps/web run test:e2e
```

Run unit tests:

```bash
npm --workspace apps/web run test:unit
```

---

## Project Structure

```
gitcontext/
├── apps/
│   ├── web/              # Web application (React + isomorphic-git)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── workers/
│   │   │   └── utils/
│   │   └── vite.config.ts
│   └── desktop/          # Desktop application (Tauri + Rust)
│       ├── src/          # React frontend
│       └── src-tauri/    # Rust backend
│           ├── src/
│           │   ├── git.rs    # Git operations (git2)
│           │   └── lib.rs    # Tauri commands
│           └── Cargo.toml
├── packages/
│   ├── ui/               # Shared React components
│   └── core/             # Shared types and utilities
└── package.json          # Root workspace config
```

---

## Development Scripts

| Command | Description |
|---------|-------------|
| `npm run web:dev` | Start web app dev server |
| `npm run web:build` | Build web app for production |
| `npm run desktop:dev` | Start desktop app in dev mode |
| `npm run desktop:build` | Build desktop app installers |
| `npm run lint` | Lint all workspaces |
| `npm run build` | Build all workspaces |

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [isomorphic-git](https://isomorphic-git.org/) for browser-based Git operations
- [git2-rs](https://github.com/rust-lang/git2-rs) for native Rust Git operations
- [Tauri](https://tauri.app/) for the native desktop framework
- [tiktoken](https://github.com/openai/tiktoken) for token counting

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/kccarlos">kccarlos</a>
</p>
