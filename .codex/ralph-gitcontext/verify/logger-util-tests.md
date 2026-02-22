# Verification: logger-util-tests

## Story
**ID:** logger-util-tests
**Title:** Frontend: logger utility tests

## Acceptance Criteria

- [x] At least 4 tests covering: Error objects, strings, other types, error code formatting
- [x] console.error mock verifies exact output format
- [x] All tests pass with `npm --workspace apps/desktop run test`

## Test Summary

6 tests created in `apps/desktop/src/utils/logger.test.ts`:

1. **calls console.error with formatted source prefix and the Error object** — verifies `console.error('[GIT_DIFF]', err)` called with Error object
2. **extracts message from Error objects and pushes to errorLog** — verifies `.message` extraction and errorLog entry shape
3. **handles string errors by using the string directly as the message** — verifies string passthrough
4. **handles non-Error non-string values (objects, null, undefined)** — verifies `String()` conversion for objects → '[object Object]', null → 'null', undefined → 'undefined'
5. **includes the error code/source prefix in console.error output** — verifies `[E_REPO_OPEN]` prefix format
6. **caps errorLog at 100 entries by removing oldest** — verifies FIFO eviction when exceeding 100 entries

## Quality Gates

| Command | Result |
|---------|--------|
| `npm --workspace apps/desktop run test` | PASS (294 tests, 21 files) |
| `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` | PASS (44 tests) |
| `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings` | PASS |
| `npm run web:build` | PASS |

## Commit
b3abfde test(desktop): add logger utility unit tests

VERIFIED: YES
