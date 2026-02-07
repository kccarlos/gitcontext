## [2.0.2](https://github.com/kccarlos/gitcontext/compare/v2.0.1...v2.0.2) (2026-02-07)


### Bug Fixes

* **ci:** checkout main branch instead of version tag in deploy-pages ([27ab5d0](https://github.com/kccarlos/gitcontext/commit/27ab5d020d28fc1b626f55a18c67b391b212db79))
* resolve 10 critical and quality bugs ([bb9bdde](https://github.com/kccarlos/gitcontext/commit/bb9bdde5f8823bdd9bb006a7ed20ea6851617e70))
* resolve 10 critical and quality bugs ([7286aaf](https://github.com/kccarlos/gitcontext/commit/7286aafbb29c0046c4316103d4899da2a30a6001))
* resolve 3 additional critical bugs ([101901d](https://github.com/kccarlos/gitcontext/commit/101901d7ea2f586bc9d65fcac42d5eaa56b7bb23))
* resolve 3 additional critical bugs ([1a8a5f6](https://github.com/kccarlos/gitcontext/commit/1a8a5f6579b02cdfc4cea5358f7978f8d98f0e0a))

## [2.0.1](https://github.com/kccarlos/gitcontext/compare/v2.0.0...v2.0.1) (2026-02-07)


### Bug Fixes

* **ci:** checkout main branch instead of version tag in deploy-pages ([856c59a](https://github.com/kccarlos/gitcontext/commit/856c59a1290d191a961373f8559bcfa4f5dc4a71))

# [2.0.0](https://github.com/kccarlos/gitcontext/compare/v1.3.2...v2.0.0) (2026-02-07)


* feat(desktop)!: migrate from Electron to Tauri (feature parity) ([58e58fe](https://github.com/kccarlos/gitcontext/commit/58e58fe6a544ccc4e0e14b4fb88dbecf5add97b0))
* feat(desktop)!: migrate from Electron to Tauri with full feature parity ([287ad0a](https://github.com/kccarlos/gitcontext/commit/287ad0a7b0d57a17b28389d6e6c54868bec20385))


### Bug Fixes

* **ci:** update CI workflow to use new monorepo structure and Tauri ([93908fe](https://github.com/kccarlos/gitcontext/commit/93908feefed44cee3f27f9aa5c35d317ce9a96f8))
* regenerate package-lock.json to sync with package.json ([3264e1c](https://github.com/kccarlos/gitcontext/commit/3264e1cd7e7fc561301283419b99782e084299d5))


### Features

* **core:** add shared core package with GitService interface and migrate utilities ([2ec0779](https://github.com/kccarlos/gitcontext/commit/2ec0779654b9e86a2c7353267b7b44726fd6594d))
* **desktop/tauri:** add native git backend via git2 ([d54bde8](https://github.com/kccarlos/gitcontext/commit/d54bde8f000bfcea4da1f5a7a6a02267d240ab90))
* **ui:** extract shared React components into @gitcontext/ui ([241c0cc](https://github.com/kccarlos/gitcontext/commit/241c0ccfef1d167512f448fc4484648aac00f26b))


### Performance Improvements

* **workdir:** add guardrails, route reads to main thread, and improve concurrency ([b794563](https://github.com/kccarlos/gitcontext/commit/b794563261237ceabd7f5b64374a0e1be11bf4f1))
* **workdir:** improve performance ([7387ec4](https://github.com/kccarlos/gitcontext/commit/7387ec4a3a7c1e7a4e5e211673d1465b5a143106))
* **workdir:** performance & scalability for very large repos ([7c51162](https://github.com/kccarlos/gitcontext/commit/7c51162709a969a61f47e19d200c8cca925d53b8))
* **workdir:** remove eager snapshotting and compute WORKDIR diffs lazily ([2139e7b](https://github.com/kccarlos/gitcontext/commit/2139e7b055b4cfd72a2a9003fd5734d95ed2a719))


### BREAKING CHANGES

* Desktop app now uses Tauri instead of Electron

- Replace Electron with Tauri 2.0 framework for native desktop app
- Implement native Rust backend using git2 crate for Git operations
- Remove all Electron code (src/electron/, electron-builder.yml)
- Add complete feature parity with web app:
  * Token counting with tiktoken WASM integration
  * File tree with filtering and selection
  * Diff generation and preview
  * Context lines slider
  * Clipboard integration via tauri-plugin-clipboard-manager
  * Dark mode with proper CSS variable theming
- Add landing page with "How it works" guide
- Add clickable logo at top left (returns to landing)
- Add GitHub repository links (Star on GitHub, Report a Bug)
- Add refresh button to update file tree while preserving selection
- Add "Include binary files as paths" checkbox
- Fix file tree auto-expansion for directories with changed files
- Fix double-slash path bug in Rust git2 tree walking
- Update GitHub Actions workflow for Tauri builds (macOS, Windows, Linux)
- Update README to reflect new Tauri architecture
- Remove 245 Electron-related npm packages
- Merge with workdir performance improvements from main branch
- Maintain all lazy loading, caching, and main-thread file reading optimizations
* Desktop app now uses Tauri instead of Electron.

- Replace Electron with Tauri 2.0 for the native desktop app.
- Add Rust backend (git2) for Git operations.
- Remove Electron code and tooling (src/electron/, electron-builder.yml).
- Reach feature parity with web:
  - Token counting (tiktoken WASM).
  - File tree filtering/selection + refresh (preserve selection).
  - Diff generation/preview + context lines slider.
  - Clipboard via tauri-plugin-clipboard-manager.
  - Dark mode with CSS variable theming.
  - Include binaries as paths option.
- UX/content:
  - Landing page with "How it works" + clickable logo to return.
  - GitHub links (Star, Report a Bug).
- Fixes:
  - File tree auto-expansion for changed directories.
  - Double-slash path issue in Rust git2 tree walking.
- CI/docs:
  - Update GitHub Actions for Tauri builds (macOS/Windows/Linux).
  - Update README for Tauri architecture.
- Cleanup: remove 245 Electron-related npm packages.

## [1.3.2](https://github.com/kccarlos/gitcontext/compare/v1.3.1...v1.3.2) (2026-01-28)


### Performance Improvements

* **workdir:** add guardrails, route reads to main thread, and improve concurrency ([b888149](https://github.com/kccarlos/gitcontext/commit/b8881490628f5f3c0c07f842a8823858ed992433))
* **workdir:** performance & scalability for very large repos ([9dc5005](https://github.com/kccarlos/gitcontext/commit/9dc5005fff85af84ca977c25e9153bdcb819441e))
* **workdir:** remove eager snapshotting and compute WORKDIR diffs lazily ([be9723c](https://github.com/kccarlos/gitcontext/commit/be9723c6dad0a416cfa907f5787904a9126a0481))

## [1.3.1](https://github.com/kccarlos/gitcontext/compare/v1.3.0...v1.3.1) (2026-01-07)


### Bug Fixes

* binary file handling ([0830dce](https://github.com/kccarlos/gitcontext/commit/0830dcec124577939226ef869ced5bc1422d06bf))
* single token counting pass app wide ([7cd0459](https://github.com/kccarlos/gitcontext/commit/7cd0459eac6f28b99badeef6c0cc60071b4ece67))

# [1.3.0](https://github.com/kccarlos/gitcontext/compare/v1.2.0...v1.3.0) (2026-01-07)


### Bug Fixes

* binary file handling ([65e24c8](https://github.com/kccarlos/gitcontext/commit/65e24c8cfa6b2d0dd5223cb3ed028ba8a5417356))
* single token counting pass app wide ([98a7d43](https://github.com/kccarlos/gitcontext/commit/98a7d43361273d6b27a9d26634e56d575205af74))


### Features

* token counting progress ([816fa79](https://github.com/kccarlos/gitcontext/commit/816fa79b7902b772e1a363ff075cd0110f053563))

# [1.2.0](https://github.com/kccarlos/gitcontext/compare/v1.1.0...v1.2.0) (2025-09-07)


### Bug Fixes

* binary file detection ([0243902](https://github.com/kccarlos/gitcontext/commit/0243902579fc539c27a4373514db59f1e139526e))
* binary file handling ([65c051a](https://github.com/kccarlos/gitcontext/commit/65c051a6968e7325ef3f49b001ef15ca0c28435b))
* file tree not updated after workspace switch ([d73a4ab](https://github.com/kccarlos/gitcontext/commit/d73a4ab15a85512a174c7c2c80044b40c0121932))
* single token counting pass app wide ([e554bd1](https://github.com/kccarlos/gitcontext/commit/e554bd129e35a663517bd0cbdc7c797fad06c24b))


### Features

* status bar message during token counting ([d54502e](https://github.com/kccarlos/gitcontext/commit/d54502e405ca37fcc2b82033ba1c8682b6dbf81a))
* token counting progress ([2c13043](https://github.com/kccarlos/gitcontext/commit/2c1304343d68e93f43c911fc0809e125f326381f))

# [1.1.0](https://github.com/kccarlos/gitcontext/compare/v1.0.1...v1.1.0) (2025-09-07)


### Bug Fixes

* api mismatch ([6d07058](https://github.com/kccarlos/gitcontext/commit/6d07058be013e1fa14f8b334c83b0f2b445d4302))
* branch discovery in desktop ([d95db6b](https://github.com/kccarlos/gitcontext/commit/d95db6b8a08b9fb16eff52223eb5f6e63c32985c))
* branching ([70c25b9](https://github.com/kccarlos/gitcontext/commit/70c25b9640cc3840ba21112364ef37d4a554dd7b))
* **dev:** desktop config changed ([ee46766](https://github.com/kccarlos/gitcontext/commit/ee46766214a20a02f49b5d0599242e1de063bc6f))
* do not write binary file to final output ([99fb0ca](https://github.com/kccarlos/gitcontext/commit/99fb0ca24aa70120d89e38d47084755f7f75935c))
* electron bugs ([a53db94](https://github.com/kccarlos/gitcontext/commit/a53db9470949b6639cb0f6a7d86d9c212db45e56))
* tree construction ([623754a](https://github.com/kccarlos/gitcontext/commit/623754a87ebebb4f4f4d85b3d5919ae4387842f2))
* ui design ([6ac3471](https://github.com/kccarlos/gitcontext/commit/6ac347164c21f9c79f47a01048dd6d02c79c932c))
* ui inconsistencies ([6b4c330](https://github.com/kccarlos/gitcontext/commit/6b4c3306df66269c842fa78aec02f65c81c92f9a))
* ui responsiveness ([46f9996](https://github.com/kccarlos/gitcontext/commit/46f999647bbb1e293a7d4a17a9f3e9d0ecb006cd))
* web worker listbranches forgets to return the workdir sentinel ([932df36](https://github.com/kccarlos/gitcontext/commit/932df36a7c2949bb03e7dafe1c86bc0d277e6aa6))


### Features

* binary file icon ([8502117](https://github.com/kccarlos/gitcontext/commit/8502117989097c7079bfb460f7c2c39ddcd37fbd))

## [1.0.1](https://github.com/kccarlos/gitcontext/compare/v1.0.0...v1.0.1) (2025-08-14)


### Bug Fixes

* **dev:** add test hooks (non-visual) for selectors ([fd0b3a9](https://github.com/kccarlos/gitcontext/commit/fd0b3a9e04ad0f10cf01e4bedd076ccf2d53de00))
* **dev:** fix bug and add test cases ([5d36c9c](https://github.com/kccarlos/gitcontext/commit/5d36c9c373a738cfb951d642194e4fe7b46229b5))
* **dev:** fix copy button ([b13b45f](https://github.com/kccarlos/gitcontext/commit/b13b45f9b1182b17c592b640e5038600cee92ebb))
* **dev:** fix electron build error ([7a0bf8a](https://github.com/kccarlos/gitcontext/commit/7a0bf8a896be94923f0539e7def8422b9cf414d0))
* **dev:** workdir sentinel always present in branch list ([dd8b831](https://github.com/kccarlos/gitcontext/commit/dd8b83168f56fe263b075ae9a607a75b73392823))

# 1.0.0 (2025-08-11)


### Bug Fixes

* **dev:** gate electron plugins behind ELECTRON=1; keep web:dev standalone ([4f4d937](https://github.com/kccarlos/gitcontext/commit/4f4d93752e124382594982f74801d80932cb42f1))
* **electron:** use ESM-safe __dirname in main.ts; ignore dist-electron; reliable electron:dev ([1982964](https://github.com/kccarlos/gitcontext/commit/1982964b2aa70605678d0a98d2185f608936568d))


### Features

* **electron:** scaffold main and preload; integrate vite-plugin-electron; add deps ([2e06dba](https://github.com/kccarlos/gitcontext/commit/2e06dba25a1d56d304d554f7d5cd2ad9ac9c55ad))

# 1.0.0 (2025-08-11)


### Bug Fixes

* **dev:** gate electron plugins behind ELECTRON=1; keep web:dev standalone ([4f4d937](https://github.com/kccarlos/gitcontext/commit/4f4d93752e124382594982f74801d80932cb42f1))
* **electron:** use ESM-safe __dirname in main.ts; ignore dist-electron; reliable electron:dev ([1982964](https://github.com/kccarlos/gitcontext/commit/1982964b2aa70605678d0a98d2185f608936568d))


### Features

* **electron:** scaffold main and preload; integrate vite-plugin-electron; add deps ([2e06dba](https://github.com/kccarlos/gitcontext/commit/2e06dba25a1d56d304d554f7d5cd2ad9ac9c55ad))

# 1.0.0 (2025-08-11)


### Bug Fixes

* **dev:** gate electron plugins behind ELECTRON=1; keep web:dev standalone ([4f4d937](https://github.com/kccarlos/gitcontext/commit/4f4d93752e124382594982f74801d80932cb42f1))
* **electron:** use ESM-safe __dirname in main.ts; ignore dist-electron; reliable electron:dev ([1982964](https://github.com/kccarlos/gitcontext/commit/1982964b2aa70605678d0a98d2185f608936568d))


### Features

* **electron:** scaffold main and preload; integrate vite-plugin-electron; add deps ([2e06dba](https://github.com/kccarlos/gitcontext/commit/2e06dba25a1d56d304d554f7d5cd2ad9ac9c55ad))

# 1.0.0 (2025-08-11)


### Bug Fixes

* **dev:** gate electron plugins behind ELECTRON=1; keep web:dev standalone ([4f4d937](https://github.com/kccarlos/gitcontext/commit/4f4d93752e124382594982f74801d80932cb42f1))
* **electron:** use ESM-safe __dirname in main.ts; ignore dist-electron; reliable electron:dev ([1982964](https://github.com/kccarlos/gitcontext/commit/1982964b2aa70605678d0a98d2185f608936568d))


### Features

* **electron:** scaffold main and preload; integrate vite-plugin-electron; add deps ([2e06dba](https://github.com/kccarlos/gitcontext/commit/2e06dba25a1d56d304d554f7d5cd2ad9ac9c55ad))

# 1.0.0 (2025-08-11)


### Bug Fixes

* **dev:** gate electron plugins behind ELECTRON=1; keep web:dev standalone ([4f4d937](https://github.com/kccarlos/gitcontext/commit/4f4d93752e124382594982f74801d80932cb42f1))
* **electron:** use ESM-safe __dirname in main.ts; ignore dist-electron; reliable electron:dev ([1982964](https://github.com/kccarlos/gitcontext/commit/1982964b2aa70605678d0a98d2185f608936568d))


### Features

* **electron:** scaffold main and preload; integrate vite-plugin-electron; add deps ([2e06dba](https://github.com/kccarlos/gitcontext/commit/2e06dba25a1d56d304d554f7d5cd2ad9ac9c55ad))
