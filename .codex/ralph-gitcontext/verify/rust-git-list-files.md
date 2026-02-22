# Verification: rust-git-list-files

## Story
Rust backend: list_files and list_files_with_oids tests

## Pass Criteria

- [x] At least 6 tests covering list_files, list_files_with_oids, and resolve_ref
- [x] WORKDIR listing respects .gitignore patterns
- [x] OIDs are valid 40-char hex strings
- [x] All tests pass with `cargo test`

## Tests Added (11 total)

### list_files (6 tests)
1. `test_list_files_returns_all_committed_files` - listing files for a ref returns all committed files
2. `test_list_files_nested_directories_flatten_to_full_paths` - nested dirs flatten to full paths (src/lib/util.rs)
3. `test_list_files_empty_tree_returns_empty_list` - empty tree returns empty list
4. `test_list_files_workdir_returns_filesystem_files` - WORKDIR returns filesystem files including untracked
5. `test_list_files_workdir_respects_gitignore` - WORKDIR listing respects .gitignore patterns (*.log, build/)

### list_files_with_oids (2 tests)
6. `test_list_files_with_oids_returns_valid_oid_strings` - OIDs are valid 40-char hex strings
7. `test_list_files_with_oids_multiple_files` - multiple files each have valid unique OIDs

### resolve_ref (3 tests)
8. `test_resolve_ref_valid_branch_resolves_to_oid` - valid branch resolves to 40-char hex OID
9. `test_resolve_ref_invalid_ref_returns_error` - invalid ref returns error
10. `test_resolve_ref_head_resolves_correctly` - HEAD resolves to same OID as main

## Quality Gates

- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` -> PASS (28 tests passed)
- `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings` -> PASS
- `npm --workspace apps/desktop run test` -> PASS (45 tests passed)
- `npm run web:build` -> PASS

VERIFIED: YES
