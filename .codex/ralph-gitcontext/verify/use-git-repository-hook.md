# Verification Report: use-git-repository-hook

## Story: Frontend: useGitRepository hook tests

### Pass Criteria

- [x] At least 8 tests covering: initial state, load success, load error, refresh, reset, branch persistence, watcher events, flip
- [x] State transitions verified (idle→loading→ready, idle→loading→error)
- [x] localStorage mock verifies branch persistence per repo path
- [x] All tests pass with `npm --workspace apps/desktop run test`

### Test Summary

12 tests created in `apps/desktop/src/hooks/useGitRepository.test.ts`:

1. **Initial state** — idle with empty branches, null currentDir, diffTrigger=0
2. **Load success** — idle→loading→ready transition, branches set, default branch selection (main/dev), AppStatus callbacks
3. **Load error** — idle→loading→error transition, error message propagated, AppStatus ERROR callback
4. **Refresh** — reloads branches from current directory, preserves selection via preferredBranches
5. **Reset** — clears all state back to idle, calls dispose(), AppStatus IDLE callback
6. **Branch persistence** — saves to localStorage on load, saves on manual change via useEffect, restores saved branches on reload
7. **Workdir-changed event** — increments diffTrigger when __WORKDIR__ is selected (after 300ms debounce)
8. **Workdir-changed ignored** — does NOT increment diffTrigger when __WORKDIR__ is not selected
9. **Flip branches** — setBaseBranch/setCompareBranch can swap base and compare
10. **Refresh returns false** — returns false when no directory is loaded
11. **Single-branch repo** — compare defaults to same as base when only one branch exists
12. **Wrong repo ignored** — workdir-changed event for different repoPath is ignored

### Mocking Strategy

- `TauriGitService` mocked via `vi.hoisted()` + `vi.mock()` with class definition pattern
- `@tauri-apps/api/event` `listen` mocked to capture callbacks, enabling manual event emission in tests
- `@tauri-apps/plugin-dialog` mocked (not exercised in these tests)
- `localStorage` stubbed via `vi.stubGlobal()` with `Map`-based storage (pattern from workspaceStore.test.ts)
- Fake timers used to test debounce behavior

### Verification Commands

```
npm --workspace apps/desktop run test          -> PASS (75 tests, 12 new)
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -> PASS (44 tests)
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings -> PASS
npm run web:build                              -> PASS
```

VERIFIED: YES
