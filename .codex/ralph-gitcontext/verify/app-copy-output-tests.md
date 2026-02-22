# Verification: app-copy-output-tests

## Story: Frontend: copy output generation tests

### Pass Criteria

- [x] At least 8 tests covering: header, instructions, file tree toggle, modify/add/remove diffs, binary handling, context lines
  - 26 tests total across 6 describe blocks covering all required areas
- [x] Output format matches exact markdown structure used by the app
  - End-to-end test verifies section ordering (header -> instructions -> file tree -> diffs -> file sections)
  - File section format verified: `## FILE: path (STATUS)` with appropriate code blocks
- [x] Binary file handling verified for both includeBinaryAsPaths settings
  - Extension-based binary detection (e.g., .png) produces [Binary file] placeholder
  - Content-flag binary detection (binary: true from ReadFileSide) produces [Binary file] placeholder
  - Non-binary extensions (e.g., .dat) are correctly treated as text
- [x] All tests pass with `npm --workspace apps/desktop run test`
  - 252 tests pass (26 new copyOutput tests + 226 existing)

### Test Breakdown (26 tests)

**buildHeader** (6 tests):
1. Header includes repo path, base/compare branches, and file count
2. Instructions section included when non-empty
3. Instructions section omitted when empty/whitespace
4. File tree section included when fileTreeText provided
5. File tree section omitted when fileTreeText empty
6. Shows "Unknown" when currentDir is empty

**generateFileTreeText** (3 tests):
7. Generates tree for selected files only
8. Excludes directories without selected files
9. Wraps output in code fences

**buildFileSection** (9 tests):
10. Modified files produce ```diff blocks
11. Added files with unlimited context produce ``` blocks (full content)
12. Added files with limited context produce ```diff blocks
13. Removed files produce diff blocks
14. Binary files by extension show [Binary file] placeholder
15. Binary files by content flag show [Binary file] placeholder
16. Unchanged files produce full content blocks
17. Unchanged file with notFound returns empty string
18. Context lines setting affects diff output length

**buildCopyOutput** (4 tests):
19. Multiple file sections concatenated in order
20. File tree included when includeFileTree is true
21. File tree omitted when includeFileTree is false
22. Instructions included when non-empty

**Binary file handling** (3 tests):
23. Binary files by extension produce placeholder with path
24. Binary files by content flag produce placeholder
25. Non-binary .dat extension treated as text

**End-to-end format** (1 test):
26. Full output structure ordering verified for realistic scenario

### Quality Gates

| Gate | Result |
|------|--------|
| `npm --workspace apps/desktop run test` | PASS (252 tests) |
| `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` | PASS (44 tests) |
| `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings` | PASS |
| `npm run web:build` | PASS |

### Files Changed

- `apps/desktop/src/utils/copyOutput.ts` (new) - extracted testable output-building functions
- `apps/desktop/src/__tests__/copyOutput.test.ts` (new) - 26 comprehensive tests
- `apps/desktop/src/App.tsx` (modified) - refactored to use extracted functions

VERIFIED: YES
