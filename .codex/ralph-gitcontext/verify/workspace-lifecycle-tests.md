# Verification: workspace-lifecycle-tests

## Story
**ID:** workspace-lifecycle-tests
**Title:** Frontend: workspace save/restore lifecycle integration tests

## Pass Criteria

- [x] At least 7 tests covering: save, restore, auto-detect, refresh, delete, missing branch, session auto-persist
- [x] Branch and selection state correctly captured and restored
- [x] Race condition between workspace switches handled
- [x] All tests pass with `npm --workspace apps/desktop run test`

## Test Results

```
 ✓ src/__tests__/workspaceLifecycle.test.ts (10 tests)
   ✓ saving a workspace captures current branch selection and file selection
   ✓ loading a saved workspace restores branches and selection for diff
   ✓ workspace auto-detection on repo open matches by path
   ✓ workspace refresh preserves current selection
   ✓ deleting a workspace removes it from store and clears selection
   ✓ workspace with missing branch falls back gracefully
   ✓ workspace session auto-persists on settings change
   ✓ switching workspaces cancels pending selection restore from previous workspace
   ✓ full lifecycle: create → save → close → reopen → modify → persist → reload
   ✓ multiple workspaces maintain isolated sessions
```

## Quality Gates

| Command | Result |
|---------|--------|
| `npm --workspace apps/desktop run test` | PASS (288 tests, 20 files) |
| `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` | PASS (44 tests) |
| `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings` | PASS |
| `npm run web:build` | PASS |

## Files Changed

- `apps/desktop/src/__tests__/workspaceLifecycle.test.ts` (new - 10 integration tests)

## Implementation Notes

- Tests simulate the full workspace lifecycle using workspaceStore functions
- Helper functions mirror App.tsx patterns: buildSnapshot, commitWorkspaceStore
- localStorage mocked via vi.stubGlobal with Map-backed store
- Race condition tested by simulating the workspace switch request ID counter pattern
- Missing branch fallback tested by checking branch existence against available branches

VERIFIED: YES
