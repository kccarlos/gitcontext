use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkdirChangedPayload {
    pub repo_path: String,
    pub changed_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefsChangedPayload {
    pub repo_path: String,
}

/// Classification of a file system event path.
#[derive(Debug, PartialEq)]
pub enum EventKind {
    /// Change to .git/refs or .git/HEAD — branch/tag metadata changed.
    RefsChanged,
    /// Change to a working directory file. Contains the normalized relative path.
    WorkdirChanged(String),
    /// Path should be ignored (node_modules, .git/objects, .git/logs, target, etc.).
    Ignored,
}

/// Classify a changed path relative to the repo root.
///
/// Pure function extracted from the watcher callback for testability.
pub fn classify_path(path: &Path, repo_root: &Path, git_dir: &Path) -> EventKind {
    // Check if path is under .git/refs or .git/HEAD
    if path.starts_with(git_dir.join("refs")) || path.ends_with(".git/HEAD") {
        return EventKind::RefsChanged;
    }

    if path.starts_with(repo_root) {
        let rel_path = path.strip_prefix(repo_root).unwrap();
        let path_str = rel_path.to_string_lossy();

        if !path_str.starts_with(".git/objects")
            && !path_str.starts_with(".git/logs")
            && !path_str.contains("node_modules")
            && !path_str.contains("/target/")
            && !path_str.starts_with("target/")
        {
            let normalized = path_str.replace('\\', "/");
            if !normalized.starts_with(".git/") {
                return EventKind::WorkdirChanged(normalized);
            }
        }
    }

    EventKind::Ignored
}

pub struct RepoWatcher {
    debouncer: Debouncer<RecommendedWatcher, FileIdMap>,
    #[allow(dead_code)] // Used in closure passed to debouncer
    repo_path: String,
}

impl RepoWatcher {
    pub fn new(app: AppHandle, repo_path: String) -> Result<Self, String> {
        let repo_path_clone = repo_path.clone();
        let repo_root = PathBuf::from(&repo_path);
        let git_dir = repo_root.join(".git");

        // Create debouncer with 500ms delay
        let mut debouncer = new_debouncer(
            Duration::from_millis(500),
            None,
            move |result: DebounceEventResult| {
                match result {
                    Ok(events) => {
                        let mut workdir_files: Vec<String> = Vec::new();
                        let mut refs_changed = false;

                        for event in events {
                            for path in &event.paths {
                                match classify_path(path, &repo_root, &git_dir) {
                                    EventKind::RefsChanged => {
                                        refs_changed = true;
                                    }
                                    EventKind::WorkdirChanged(normalized) => {
                                        workdir_files.push(normalized);
                                    }
                                    EventKind::Ignored => {}
                                }
                            }
                        }

                        // Emit events
                        if !workdir_files.is_empty() {
                            let _ = app.emit(
                                "workdir-changed",
                                WorkdirChangedPayload {
                                    repo_path: repo_path_clone.clone(),
                                    changed_files: workdir_files,
                                },
                            );
                        }

                        if refs_changed {
                            let _ = app.emit(
                                "refs-changed",
                                RefsChangedPayload {
                                    repo_path: repo_path_clone.clone(),
                                },
                            );
                        }
                    }
                    Err(errors) => {
                        eprintln!("Watcher errors: {:?}", errors);
                    }
                }
            },
        )
        .map_err(|e| format!("Failed to create file watcher: {}", e))?;

        // Watch the repository root recursively
        debouncer
            .watcher()
            .watch(Path::new(&repo_path), RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch repository: {}", e))?;

        Ok(RepoWatcher {
            debouncer,
            repo_path,
        })
    }

    pub fn stop(self) {
        // Debouncer is dropped here, which stops the watcher
        drop(self.debouncer);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn repo_root() -> PathBuf {
        PathBuf::from("/repo")
    }

    fn git_dir() -> PathBuf {
        PathBuf::from("/repo/.git")
    }

    // --- Ignored paths ---

    #[test]
    fn ignores_node_modules() {
        let path = PathBuf::from("/repo/node_modules/pkg/index.js");
        assert_eq!(
            classify_path(&path, &repo_root(), &git_dir()),
            EventKind::Ignored
        );
    }

    #[test]
    fn ignores_nested_node_modules() {
        let path = PathBuf::from("/repo/packages/web/node_modules/pkg/lib.js");
        assert_eq!(
            classify_path(&path, &repo_root(), &git_dir()),
            EventKind::Ignored
        );
    }

    #[test]
    fn ignores_git_objects() {
        let path = PathBuf::from("/repo/.git/objects/ab/cdef1234567890");
        assert_eq!(
            classify_path(&path, &repo_root(), &git_dir()),
            EventKind::Ignored
        );
    }

    #[test]
    fn ignores_git_logs() {
        let path = PathBuf::from("/repo/.git/logs/HEAD");
        assert_eq!(
            classify_path(&path, &repo_root(), &git_dir()),
            EventKind::Ignored
        );
    }

    #[test]
    fn ignores_target_directory_at_root() {
        let path = PathBuf::from("/repo/target/debug/build/libfoo.rlib");
        assert_eq!(
            classify_path(&path, &repo_root(), &git_dir()),
            EventKind::Ignored
        );
    }

    #[test]
    fn ignores_nested_target_directory() {
        let path = PathBuf::from("/repo/crates/core/target/release/output");
        assert_eq!(
            classify_path(&path, &repo_root(), &git_dir()),
            EventKind::Ignored
        );
    }

    #[test]
    fn ignores_other_git_internal_paths() {
        // .git/index, .git/config, etc. should be ignored (starts with .git/)
        let path = PathBuf::from("/repo/.git/index");
        assert_eq!(
            classify_path(&path, &repo_root(), &git_dir()),
            EventKind::Ignored
        );
    }

    // --- Regular source files (workdir-changed) ---

    #[test]
    fn detects_regular_source_file() {
        let path = PathBuf::from("/repo/src/main.rs");
        assert_eq!(
            classify_path(&path, &repo_root(), &git_dir()),
            EventKind::WorkdirChanged("src/main.rs".to_string())
        );
    }

    #[test]
    fn detects_root_level_file() {
        let path = PathBuf::from("/repo/Cargo.toml");
        assert_eq!(
            classify_path(&path, &repo_root(), &git_dir()),
            EventKind::WorkdirChanged("Cargo.toml".to_string())
        );
    }

    #[test]
    fn detects_deeply_nested_file() {
        let path = PathBuf::from("/repo/apps/web/src/components/Button.tsx");
        assert_eq!(
            classify_path(&path, &repo_root(), &git_dir()),
            EventKind::WorkdirChanged("apps/web/src/components/Button.tsx".to_string())
        );
    }

    // --- Refs-changed ---

    #[test]
    fn detects_git_refs_heads_change() {
        let path = PathBuf::from("/repo/.git/refs/heads/main");
        assert_eq!(
            classify_path(&path, &repo_root(), &git_dir()),
            EventKind::RefsChanged
        );
    }

    #[test]
    fn detects_git_refs_tags_change() {
        let path = PathBuf::from("/repo/.git/refs/tags/v1.0.0");
        assert_eq!(
            classify_path(&path, &repo_root(), &git_dir()),
            EventKind::RefsChanged
        );
    }

    #[test]
    fn detects_git_refs_remotes_change() {
        let path = PathBuf::from("/repo/.git/refs/remotes/origin/main");
        assert_eq!(
            classify_path(&path, &repo_root(), &git_dir()),
            EventKind::RefsChanged
        );
    }

    #[test]
    fn detects_git_head_change() {
        let path = PathBuf::from("/repo/.git/HEAD");
        assert_eq!(
            classify_path(&path, &repo_root(), &git_dir()),
            EventKind::RefsChanged
        );
    }

    // --- Edge cases ---

    #[test]
    fn ignores_path_outside_repo() {
        let path = PathBuf::from("/other/project/src/main.rs");
        assert_eq!(
            classify_path(&path, &repo_root(), &git_dir()),
            EventKind::Ignored
        );
    }

    #[test]
    fn file_named_target_not_ignored() {
        // A file literally named "target" (not a directory) at root should pass
        // because the filter checks "target/" prefix
        let path = PathBuf::from("/repo/src/target.rs");
        assert_eq!(
            classify_path(&path, &repo_root(), &git_dir()),
            EventKind::WorkdirChanged("src/target.rs".to_string())
        );
    }
}
