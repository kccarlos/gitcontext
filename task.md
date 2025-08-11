### 0 ― Project Bootstrap & Ground Rules

* **Create `electron/` workspace beside `web/`.**
  *DoD*: Fresh pnpm/npm workspace with its own `package.json`, ESLint/TSConfig inherit from root; no renderer code yet.
* **Pin versions & enable deterministic builds.**
  *DoD*: `.npmrc` with `save‑exact=true`; lockfile checked‑in; root CI job fails on `npm ci --audit --omit=dev`.
* **Adopt Conventional Commits & semantic‑release.**
  *DoD*: Husky + commitlint hook; release step produces GitHub tag and changelog.

---

### 1 ― Minimal Electron Shell (“lift & shift”)

1. **Install core deps**

   * `electron@^30`, `electron-builder`, `vite-plugin-electron`, `vite-plugin-electron-renderer`.
   * *DoD*: `npm run electron:dev` opens the existing React UI inside a desktop window.
2. **Create `main.ts` (main process) & `preload.ts`.**

   * Disable `nodeIntegration`, enable `contextIsolation`.
   * Expose a single poly‑filled API via `contextBridge.exposeInMainWorld('electron', { invoke, on })`.
   * *DoD*: Renderer detects `window.isElectron === true` (already used in `utils/models.ts`).
3. **Move static files to electron `public/` and wire Vite config.**
   *DoD*: Same asset URLs (`import.meta.env.BASE_URL`) resolve in both web & desktop.

---

### 2 ― Cross‑Platform Build Pipeline

* **Add Electron build targets to GitHub Actions.**

  1. macOS (universal .dmg), Windows (.exe using NSIS), Linux (.AppImage).
  2. Keep existing Pages deploy job unchanged.
     *DoD*: Push to `main` produces ‑ in one run ‑ Web artifact and three OS installers as workflow artifacts.

---

### 3 ― Backend Strategy Abstraction

1. **Define `src/backend/GitBackend.ts` interface**

   ```ts
   interface GitBackend {
     init(repoPath: string): Promise<BranchesInfo>
     diff(base: string, compare: string): Promise<DiffResult>
     listFiles(ref: string): Promise<string[]>
     readFile(ref: string, path: string): Promise<ReadFileResult>
     resolveRef(ref: string): Promise<string>
   }
   ```

   *DoD*: Type compiles.
2. **Implement `BrowserWorkerBackend` (adapter around current `gitWorkerClient`).**
   *DoD*: Web build still passes all unit tests.
3. **Implement `NodeBackend` in main process.**

   * Uses `isomorphic-git` + native `fs`.
   * Re‑use almost all worker logic **minus** LightningFS and snapshotting.
   * *DoD*: CLI smoke test script can `init`, `diff`, `readFile` on a real repo path.

---

### 4 ― IPC Contract (Reference‑Light)

1. **Create IPC channel per GitBackend method** using `ipcMain.handle`/`ipcRenderer.invoke`.
   *DoD*: Payloads never contain file contents > 1 MB; unit test asserts size.
2. **Encode absolute repo path once** (`repo:setPath`) and pass opaque handle thereafter.
   *DoD*: DevTools network/IPC log shows only path strings and primitive args.

---

### 5 ― Foundational Shift: On‑Disk Operations

1. **Replace LightningFS usage path‑by‑path in `NodeBackend`.**

   * Direct `fs.readFile`, `fs.readdir`.
   * *DoD*: Large repo (> 100 k files) opens with ≤ 300 MB RSS and < 3 s blocking time on M1.
2. **Drop `snapshotGitFiles`/`snapshotWorktreeFiles` in desktop.**
   *DoD*: They become dead code in electron build (tree‑shaken).

---

### 6 ― Renderer Integration & Feature Parity

1. **Inject backend at runtime via Strategy Pattern.**

   * In `useGitRepository` choose `BrowserWorkerBackend` (web) or `NodeBackend` (desktop).
   * *DoD*: All existing hooks work unchanged; unit tests parameterised for both modes.
2. **Swap `FileSystemDirectoryHandle` onboarding with `dialog.showOpenDialog`.**

   * Store recent repo paths with `electron-store`.
   * *DoD*: “Select Project Folder” opens native folder picker in desktop, IndexedDB code path untouched for web.

---

### 7 ― Performance Enhancements

1. **Instant open UX**

   * Renderer sets `repoStatus=ready` immediately after user picks path.
   * Async `backend.listBranches` populates dropdown.
     *DoD*: Time‑to‑interactive ≤ 200 ms on cold start.
2. **Diff in main process**

   * Remove web‑worker diff for desktop.
     *DoD*: Comparing two large branches (< 1000 changed files) returns in < 1 s on typical SSD.
3. **Lazy file read**

   * `readFile` IPC loads file only when Preview or tokenisation asks.
     *DoD*: Memory stays < 1 GB even after browsing 20 big files.
4. **Tokenisation offloaded**

   * Move `@dqbd/tiktoken` into main process; export `tokens:count(oid)` IPC.
   * Maintain `Map<oid, n>` cache.
     *DoD*: Re‑selecting same file multiplies faster by > 10× and UI FPS never drops below 55.
5. **IPC cancellation**

   * Implement token‑based request IDs and `ipcRenderer.send('cancel', id)`.
     *DoD*: Rapid branch switch never shows stale diff.

---

### 8 ― Code‑base Refactors for Maintainability

* **Extract `src/domain/*` pure modules** (diff formatter, token counter, tree builder).
  *DoD*: All React components import only from `domain` or `hooks`, not from backends.
* **Adopt strict ESLint for Node process** (no DOM globals).
  *DoD*: `npm run lint` passes.

---

### 9 ― Security Hardening

1. **Enable content‑security‑policy** `script-src 'self'; connect-src 'self' https://openrouter.ai`.
   *DoD*: DevTools shows no CSP violations.
2. **Use `shell.openExternal` for external links; block `target=_blank` in renderer.**
   *DoD*: Static code analysis has zero instances of `window.open(`.

---

### 10 ― Packaging Details

* **electron‑builder config (`electron-builder.yml`)**

  * App name `GitContext`.
  * mac: hardened & notarised, universal.
  * win: NSIS per‑user, auto‑update via GitHub Releases.
  * linux: AppImage.
    *DoD*: `npm run dist` produces signed binaries (CI keys from repo secrets).

---

### 11 ― End‑to‑End QA

1. **Playwright smoke tests**: open repo, compute diff, preview file, copy context.
   *DoD*: Same spec runs in `electron` & `chromium`.
2. **Performance regression guard**: Benchmark script measuring diff time & memory.
   *DoD*: GitHub Actions fails if runtime > 2 × baseline.

---

### 12 ― Documentation & Release

* **Update README with multi‑platform install and architecture diagram.**
  *DoD*: Screenshot of desktop app, link to installers, new section “Web vs Desktop”.
* **Changelog & version bump via semantic‑release.**

---

### 13 ― Post‑launch Nice‑to‑Haves (schedule after v1)

* Worker‑threads pool for parallel tokenisation on multi‑core.
* FS watcher to live‑refresh diffs without “Fetch & Refresh”.
* “Open Recent” jump‑list integration (Windows) / dock menu (macOS).
* Auto‑update diff results on remote `git fetch --all` (optional user setting).

---

### Implementation Notes & Compatibility Confirmations

* **isomorphic‑git** works natively in Node ≥ 18 without LightningFS; no code changes needed except passing `{fs}`.
* **tiktoken** WASM loads in Electron main because Node v18+ supports `WebAssembly.instantiate`. No CLI flags required.
* **electron‑store** persists JSON in app‑data; safe to hold recent repo list & UI prefs.
* The existing React code already checks `isElectron()`; leaving it intact avoids dual‑codepaths.
* Vite + `vite-plugin-electron` externalises Node built‑ins so renderer bundle remains small and no polyfills are shipped.
* GitHub Actions matrix build uses `electron-builder --publish=never` to avoid auto‑publishing from forks.
