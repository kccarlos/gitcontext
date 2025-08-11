<h1 align="center">
  <img src="./web/public/gitcontext.svg" width="50">
  <span>GitContext</span>
</h1>

<p align="center">
  <em>100% private codebase context engineering tool<br>
  Fully local web app to package your codebase files and diffs into LLM-friendly format</em>
</p>

---

**GitContext Web** lets you securely analyze and stage local Git repository diffs directly in your browser for quick copy-and-paste into AI Chatbots like ChatGPT, Claude, and others.

Similar to Repomix or GitIngest, but with key differences:

- **Zero servers, zero uploads** – everything runs entirely in your browser.  
- Supports **Git diffs** between branches, not just files.  
- Generate a **file tree** with your selected code/diffs for easy LLM ingestion.  
- **One-click prompt templates** tailored for common coding scenarios.

---

## What is GitContext Web?

GitContext Web is a **privacy-first, browser-based** application for analyzing and staging Git repository diffs — all locally.  
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

- React 18
- isomorphic-git
- LightningFS
- tiktoken
- lucide-react
- react-diff-viewer-continued
- vite
- @dqbd/tiktoken

---

## Installation

```bash
cd web && npm install
cd web && npm run dev
```

To build the production version, run:

```bash
cd web && npm run build
npm run preview
```
