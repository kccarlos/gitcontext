# Verification: selected-files-panel-tests

## Story: Frontend: SelectedFilesPanel component tests

## Pass Criteria

- [x] At least 7 tests covering: rendering, sort modes, binary files, remove/reveal/preview callbacks, empty state
- [x] Sorting verified by checking DOM order after sort change
- [x] TokenCountsContext properly mocked
- [x] All tests pass with `npm --workspace apps/desktop run test`

## Test Summary

13 tests created in `apps/desktop/src/components/SelectedFilesPanel.test.tsx`:

1. **renders list of selected files with correct status icons** - Verifies modify/add/remove/unchanged status icons via aria-labels
2. **sorts by tokens high-to-low by default** - Checks DOM order matches descending token count
3. **sorts by tokens low-to-high when sort mode is changed** - Changes select to tokens-asc, verifies DOM reorder
4. **sorts by name A-Z and Z-A when sort mode is changed** - Tests both name-asc and name-desc, verifies DOM order
5. **binary files show binary indicator and preview button is disabled** - Checks .png file has Binary file label and disabled preview button
6. **clicking remove calls onUnselect with correct path** - Clicks remove button, verifies callback with correct path
7. **clicking reveal calls onReveal with correct path** - Clicks reveal button, verifies callback with correct path
8. **clicking preview calls onPreview with path and status** - Clicks preview button, verifies callback with path and status
9. **empty selection shows empty state message** - Renders with empty Set, checks "No Files Selected" text
10. **refreshing state shows recalculating indicator** - Renders with refreshing=true, checks "Recalculating..." text
11. **busy context state shows recalculating indicator** - Sets mock busy=true, checks indicator
12. **reveal button not rendered when onReveal is not provided** - Verifies conditional rendering
13. **displays token counts formatted with locale string** - Verifies 12345 renders as "12,345"

## Quality Gates

- `npm --workspace apps/desktop run test`: PASS (184 tests, 13 files)
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`: PASS (44 tests)
- `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings`: PASS
- `npm run web:build`: PASS

## Commit

6f6a5e3 test(desktop): add comprehensive Vitest tests for SelectedFilesPanel

VERIFIED: YES
