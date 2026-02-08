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
                                // Check if path is under .git/refs or .git/HEAD
                                if path.starts_with(git_dir.join("refs"))
                                    || path.ends_with(".git/HEAD")
                                {
                                    refs_changed = true;
                                } else if path.starts_with(&repo_root) {
                                    // Skip .git/objects, .git/logs, node_modules, target
                                    let rel_path = path.strip_prefix(&repo_root).unwrap();
                                    let path_str = rel_path.to_string_lossy();

                                    if !path_str.starts_with(".git/objects")
                                        && !path_str.starts_with(".git/logs")
                                        && !path_str.contains("node_modules")
                                        && !path_str.contains("/target/")
                                        && !path_str.starts_with("target/")
                                    {
                                        let normalized = path_str.replace('\\', "/");
                                        if !normalized.starts_with(".git/") {
                                            workdir_files.push(normalized);
                                        }
                                    }
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
