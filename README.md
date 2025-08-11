<h1 align="center">
  <img src="./src/web/public/gitcontext.svg" width="50">
  <span>GitContext</span>
</h1>

<p align="center">
  <em>100% private codebase context engineering tool<br>
  Fully local web app to package your codebase files and diffs into LLM-friendly format</em>
</p>

<p align="center">
<a href="https://github.com/kccarlos/gitcontext/actions/workflows/release.yml"><img src="https://github.com/kccarlos/gitcontext/actions/workflows/release.yml/badge.svg" alt="Build Status"></a>
<a href="https://github.com/kccarlos/gitcontext/releases/latest"><img src="https://img.shields.io/github/v/release/kccarlos/gitcontext" alt="Latest Release"></a>
<a href="https://github.com/kccarlos/gitcontext/blob/main/LICENSE"><img src="https://img.shields.io/github/license/kccarlos/gitcontext" alt="License"></a>
</p>

---

**GitContext** lets you securely analyze and package local Git repository diffs directly on your machine for quick copy-and-paste into AI Chatbots like ChatGPT, Claude, and others. It runs as a desktop application for macOS, Windows, and Linux, or directly in your browser.

Similar to Repomix or GitIngest, but with key differences:

- **Zero servers, zero uploads** – everything runs entirely in your browser.  
- Supports **Git diffs** between branches, not just files.  
- Generate a **file tree** with your selected code/diffs for easy LLM ingestion.  
- **One-click prompt templates** tailored for common coding scenarios.

## Downloads & Installation

You can download the latest version for your operating system from the [GitHub Releases](https://github.com/kccarlos/gitcontext/releases/latest) page.

Alternatively, you can use the web version directly at [gitcontext.xyz](https://gitcontext.xyz).

---

## What is GitContext?

GitContext is a **privacy-first, browser-based** application for analyzing and staging Git repository diffs — all locally.  
It uses modern browser APIs like **File System Access** and **IndexedDB** to ensure your code never leaves your machine.

**Key features:**
- Local-only file system access with persistent permissions.
- Real-time Git operations via `isomorphic-git`, accelerated with web workers + IndexedDB caching.
- UI for diff analysis, file tree navigation, and selective staging.
- Instant token count estimation for LLM context limits.
- Flexible output formats with smart handling of binary files.

---

## Why I Built It

As a developer who frequently works with ChatGPT, Claude, and other LLMs, I found existing tools lacking:

- Needed a **visual way to pick files and diffs** instead of crafting CLI filters.
- Wanted **branch-to-branch diffs** for scenarios like code reviews and bug fixes.
- Preferred an **interactive workflow** over command-line arguments.

Passing only relevant context to an LLM significantly improves accuracy — especially in large codebases with overlapping names and structures. See [Context Rot](https://research.trychroma.com/context-rot) for why trimming irrelevant context matters.

---

## Tech Stack

- React 18 & Vite
- Electron & electron-builder
- isomorphic-git & LightningFS (for in-browser Git)
tiktoken (for token counting)

---

## Getting Started

### Web App

To run the web app, run:

```bash
npm install
npm run web:dev
```

To build the web app, run:

```bash
npm run web:build
npm run web:preview
```


### Electron App

To run the Electron app, run:

```bash
npm install
npm run electron:dev
```

To build the Electron app, run:

```bash
npm run electron:build
```

