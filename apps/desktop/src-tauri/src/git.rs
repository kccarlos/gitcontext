use git2::Repository;
use serde::{Deserialize, Serialize};
use std::path::Path;

const WORKDIR_SENTINEL: &str = "__WORKDIR__";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadRepoResult {
    pub branches: Vec<String>,
    pub default_branch: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiffFile {
    pub path: String,
    #[serde(rename = "type")]
    pub change_type: String, // "modify" | "add" | "remove" | "rename" | "copy"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>, // For renames and copies
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiffResult {
    pub files: Vec<DiffFile>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReadFileResult {
    pub binary: bool,
    pub text: Option<String>,
    pub not_found: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListFilesResult {
    pub files: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileWithOid {
    pub path: String,
    pub oid: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListFilesWithOidsResult {
    pub files: Vec<FileWithOid>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ResolveRefResult {
    pub oid: String,
}

/// Open a git repository and return branch information
pub fn open_repo(path: &str) -> Result<LoadRepoResult, String> {
    let repo = Repository::open(path).map_err(|e| format!("Failed to open repository: {}", e))?;

    // Get local branches only (avoid confusion with remote branches like origin/...)
    let branches: Vec<String> = repo
        .branches(Some(git2::BranchType::Local))
        .map_err(|e| format!("Failed to list branches: {}", e))?
        .filter_map(|branch_result| {
            branch_result
                .ok()
                .and_then(|(branch, _)| branch.name().ok().flatten().map(|name| name.to_string()))
        })
        .collect();

    // Try to get default branch (HEAD)
    let default_branch = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(|s| s.to_string()));

    // Prepend WORKDIR to branch list
    let mut all_branches = vec![WORKDIR_SENTINEL.to_string()];
    all_branches.extend(branches);

    Ok(LoadRepoResult {
        branches: all_branches,
        default_branch,
    })
}

/// List all branches in a repository
pub fn get_branches(path: &str) -> Result<LoadRepoResult, String> {
    open_repo(path)
}

/// Get diff between two refs
pub fn git_diff(path: &str, base: &str, compare: &str) -> Result<DiffResult, String> {
    let repo = Repository::open(path).map_err(|e| format!("Failed to open repository: {}", e))?;

    // Handle WORKDIR sentinel
    let mut diff = if compare == WORKDIR_SENTINEL {
        // Compare base tree to working directory
        let base_commit = repo
            .revparse_single(base)
            .map_err(|e| format!("Failed to resolve base ref '{}': {}", base, e))?
            .peel_to_commit()
            .map_err(|e| format!("Failed to peel base to commit: {}", e))?;

        let base_tree = base_commit
            .tree()
            .map_err(|e| format!("Failed to get base tree: {}", e))?;

        let mut opts = git2::DiffOptions::new();
        opts.include_untracked(false); // Only show tracked files

        repo.diff_tree_to_workdir(Some(&base_tree), Some(&mut opts))
            .map_err(|e| format!("Failed to compute diff to workdir: {}", e))?
    } else if base == WORKDIR_SENTINEL {
        // Compare working directory to compare tree (reverse diff)
        let compare_commit = repo
            .revparse_single(compare)
            .map_err(|e| format!("Failed to resolve compare ref '{}': {}", compare, e))?
            .peel_to_commit()
            .map_err(|e| format!("Failed to peel compare to commit: {}", e))?;

        let compare_tree = compare_commit
            .tree()
            .map_err(|e| format!("Failed to get compare tree: {}", e))?;

        let mut opts = git2::DiffOptions::new();
        opts.include_untracked(false); // Only show tracked files

        repo.diff_tree_to_workdir(Some(&compare_tree), Some(&mut opts))
            .map_err(|e| format!("Failed to compute diff to workdir: {}", e))?
    } else {
        // Normal tree-to-tree diff
        let base_commit = repo
            .revparse_single(base)
            .map_err(|e| format!("Failed to resolve base ref '{}': {}", base, e))?
            .peel_to_commit()
            .map_err(|e| format!("Failed to peel base to commit: {}", e))?;

        let compare_commit = repo
            .revparse_single(compare)
            .map_err(|e| format!("Failed to resolve compare ref '{}': {}", compare, e))?
            .peel_to_commit()
            .map_err(|e| format!("Failed to peel compare to commit: {}", e))?;

        let base_tree = base_commit
            .tree()
            .map_err(|e| format!("Failed to get base tree: {}", e))?;

        let compare_tree = compare_commit
            .tree()
            .map_err(|e| format!("Failed to get compare tree: {}", e))?;

        repo.diff_tree_to_tree(Some(&base_tree), Some(&compare_tree), None)
            .map_err(|e| format!("Failed to compute diff: {}", e))?
    };

    // Enable rename and copy detection
    diff.find_similar(None)
        .map_err(|e| format!("Failed to find similar files: {}", e))?;

    let mut files = Vec::new();
    let invert_changes = base == WORKDIR_SENTINEL; // Invert change types when base is WORKDIR

    diff.foreach(
        &mut |delta, _progress| {
            let new_path = delta
                .new_file()
                .path()
                .and_then(|p| p.to_str())
                .map(|s| s.to_string());

            let old_path = delta
                .old_file()
                .path()
                .and_then(|p| p.to_str())
                .map(|s| s.to_string());

            let (path, change_type, stored_old_path) = match delta.status() {
                git2::Delta::Added => {
                    if invert_changes {
                        (new_path.unwrap_or_default(), "remove", None)
                    } else {
                        (new_path.unwrap_or_default(), "add", None)
                    }
                }
                git2::Delta::Deleted => {
                    if invert_changes {
                        (old_path.unwrap_or_default(), "add", None)
                    } else {
                        (old_path.unwrap_or_default(), "remove", None)
                    }
                }
                git2::Delta::Modified => (new_path.unwrap_or_default(), "modify", None),
                git2::Delta::Renamed => {
                    // For renames, store the new path as primary and old path separately
                    (new_path.clone().unwrap_or_default(), "rename", old_path)
                }
                git2::Delta::Copied => {
                    // For copies, store the new path as primary and old path separately
                    (new_path.clone().unwrap_or_default(), "copy", old_path)
                }
                _ => (new_path.or(old_path).unwrap_or_default(), "modify", None),
            };

            files.push(DiffFile {
                path,
                change_type: change_type.to_string(),
                old_path: stored_old_path,
            });

            true
        },
        None,
        None,
        None,
    )
    .map_err(|e| format!("Failed to iterate diff: {}", e))?;

    Ok(DiffResult { files })
}

/// List all files in working directory (respecting .gitignore)
fn list_workdir_files(path: &str) -> Result<ListFilesResult, String> {
    use ignore::WalkBuilder;

    let mut files = Vec::new();
    let walker = WalkBuilder::new(path)
        .hidden(false) // Show hidden files
        .git_ignore(true) // Respect .gitignore
        .git_exclude(true) // Respect .git/info/exclude
        .build();

    for entry in walker {
        match entry {
            Ok(entry) => {
                if entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
                    // Get path relative to repo root
                    if let Ok(rel_path) = entry.path().strip_prefix(path) {
                        let path_str = rel_path.to_string_lossy().to_string();
                        // Exclude .git directory files
                        if !path_str.starts_with(".git/") && !path_str.starts_with(".git\\") {
                            // Normalize path separators to forward slashes
                            let normalized = path_str.replace('\\', "/");
                            files.push(normalized);
                        }
                    }
                }
            }
            Err(_) => continue, // Skip errors (permission issues, etc.)
        }
    }

    Ok(ListFilesResult { files })
}

/// List all files in a tree at a specific ref
pub fn list_files(path: &str, ref_name: &str) -> Result<ListFilesResult, String> {
    // Handle WORKDIR sentinel
    if ref_name == WORKDIR_SENTINEL {
        return list_workdir_files(path);
    }

    let repo = Repository::open(path).map_err(|e| format!("Failed to open repository: {}", e))?;

    // Resolve ref to commit
    let commit = repo
        .revparse_single(ref_name)
        .map_err(|e| format!("Failed to resolve ref '{}': {}", ref_name, e))?
        .peel_to_commit()
        .map_err(|e| format!("Failed to peel to commit: {}", e))?;

    // Get tree from commit
    let tree = commit
        .tree()
        .map_err(|e| format!("Failed to get tree: {}", e))?;

    let mut files = Vec::new();

    // Walk the tree recursively
    tree.walk(git2::TreeWalkMode::PreOrder, |root, entry| {
        if entry.kind() == Some(git2::ObjectType::Blob) {
            let path_str = if root.is_empty() {
                entry.name().unwrap_or("").to_string()
            } else {
                // root already includes trailing slash from git2, so trim it
                let root_trimmed = root.trim_end_matches('/');
                format!("{}/{}", root_trimmed, entry.name().unwrap_or(""))
            };
            files.push(path_str);
        }
        git2::TreeWalkResult::Ok
    })
    .map_err(|e| format!("Failed to walk tree: {}", e))?;

    Ok(ListFilesResult { files })
}

/// List all files with their OIDs in a tree at a specific ref
pub fn list_files_with_oids(path: &str, ref_name: &str) -> Result<ListFilesWithOidsResult, String> {
    let repo = Repository::open(path).map_err(|e| format!("Failed to open repository: {}", e))?;

    // Resolve ref to commit
    let commit = repo
        .revparse_single(ref_name)
        .map_err(|e| format!("Failed to resolve ref '{}': {}", ref_name, e))?
        .peel_to_commit()
        .map_err(|e| format!("Failed to peel to commit: {}", e))?;

    // Get tree from commit
    let tree = commit
        .tree()
        .map_err(|e| format!("Failed to get tree: {}", e))?;

    let mut files = Vec::new();

    // Walk the tree recursively
    tree.walk(git2::TreeWalkMode::PreOrder, |root, entry| {
        if entry.kind() == Some(git2::ObjectType::Blob) {
            let path_str = if root.is_empty() {
                entry.name().unwrap_or("").to_string()
            } else {
                // root already includes trailing slash from git2, so trim it
                let root_trimmed = root.trim_end_matches('/');
                format!("{}/{}", root_trimmed, entry.name().unwrap_or(""))
            };
            files.push(FileWithOid {
                path: path_str,
                oid: entry.id().to_string(),
            });
        }
        git2::TreeWalkResult::Ok
    })
    .map_err(|e| format!("Failed to walk tree: {}", e))?;

    Ok(ListFilesWithOidsResult { files })
}

/// Resolve a ref to its OID
pub fn resolve_ref(path: &str, ref_name: &str) -> Result<ResolveRefResult, String> {
    let repo = Repository::open(path).map_err(|e| format!("Failed to open repository: {}", e))?;

    // Resolve ref to object
    let object = repo
        .revparse_single(ref_name)
        .map_err(|e| format!("Failed to resolve ref '{}': {}", ref_name, e))?;

    Ok(ResolveRefResult {
        oid: object.id().to_string(),
    })
}

/// Read file content at a specific ref
pub fn read_file_blob(
    path: &str,
    ref_name: &str,
    file_path: &str,
) -> Result<ReadFileResult, String> {
    // Handle WORKDIR sentinel - read from filesystem
    if ref_name == WORKDIR_SENTINEL {
        use std::fs;
        use std::path::PathBuf;

        let full_path = PathBuf::from(path).join(file_path);

        match fs::read(&full_path) {
            Ok(content) => {
                // Check if binary (scan first 8KB for null bytes)
                let check_len = content.len().min(8192);
                let is_binary = content[..check_len].contains(&0);

                if is_binary {
                    return Ok(ReadFileResult {
                        binary: true,
                        text: None,
                        not_found: None,
                    });
                }

                // Convert to UTF-8 string (use lossy conversion for non-UTF8 files)
                let text = String::from_utf8_lossy(&content).into_owned();

                Ok(ReadFileResult {
                    binary: false,
                    text: Some(text),
                    not_found: None,
                })
            }
            Err(_) => Ok(ReadFileResult {
                binary: false,
                text: None,
                not_found: Some(true),
            }),
        }
    } else {
        // Normal Git blob reading
        let repo =
            Repository::open(path).map_err(|e| format!("Failed to open repository: {}", e))?;

        // Resolve ref to commit
        let commit = repo
            .revparse_single(ref_name)
            .map_err(|e| format!("Failed to resolve ref '{}': {}", ref_name, e))?
            .peel_to_commit()
            .map_err(|e| format!("Failed to peel to commit: {}", e))?;

        // Get tree from commit
        let tree = commit
            .tree()
            .map_err(|e| format!("Failed to get tree: {}", e))?;

        // Find the file in the tree
        let entry = tree
            .get_path(Path::new(file_path))
            .map_err(|_| ReadFileResult {
                binary: false,
                text: None,
                not_found: Some(true),
            })
            .ok();

        if entry.is_none() {
            return Ok(ReadFileResult {
                binary: false,
                text: None,
                not_found: Some(true),
            });
        }

        let entry = entry.unwrap();

        // Get the blob
        let object = entry
            .to_object(&repo)
            .map_err(|e| format!("Failed to get object: {}", e))?;

        let blob = object
            .as_blob()
            .ok_or_else(|| "Path is not a file".to_string())?;

        // Check if binary
        let content = blob.content();
        let is_binary = content.contains(&0);

        if is_binary {
            return Ok(ReadFileResult {
                binary: true,
                text: None,
                not_found: None,
            });
        }

        // Convert to UTF-8 string (use lossy conversion for non-UTF8 encodings like Latin-1)
        let text = String::from_utf8_lossy(content).into_owned();

        Ok(ReadFileResult {
            binary: false,
            text: Some(text),
            not_found: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// Creates a temporary git repository with an initial commit on "main".
    /// Returns the TempDir (keeps it alive) and the repo path as a String.
    fn create_test_repo() -> (tempfile::TempDir, String) {
        let tmp = tempfile::tempdir().expect("failed to create temp dir");
        let repo_path = tmp.path().to_str().unwrap().to_string();

        let repo = git2::Repository::init(&repo_path).expect("failed to init repo");

        // Configure committer identity for the test repo
        let mut config = repo.config().expect("failed to get config");
        config.set_str("user.name", "Test").unwrap();
        config.set_str("user.email", "test@test.com").unwrap();

        // Create an initial commit so "main" branch exists
        let sig = repo.signature().unwrap();
        let tree_id = {
            let mut index = repo.index().unwrap();
            // Write an initial file so the tree is non-empty
            let file_path = tmp.path().join("README.md");
            fs::write(&file_path, "# Test Repo\n").unwrap();
            index.add_path(std::path::Path::new("README.md")).unwrap();
            index.write().unwrap();
            index.write_tree().unwrap()
        };
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(
            Some("refs/heads/main"),
            &sig,
            &sig,
            "initial commit",
            &tree,
            &[],
        )
        .unwrap();

        // Set HEAD to main
        repo.set_head("refs/heads/main").unwrap();

        (tmp, repo_path)
    }

    // ── open_repo tests ───────────────────────────────────────────────

    #[test]
    fn test_open_repo_invalid_path() {
        let result = open_repo("/nonexistent/path");
        assert!(result.is_err());
    }

    // ── git_diff tests ────────────────────────────────────────────────

    #[test]
    fn test_diff_identical_branches_returns_empty() {
        let (_tmp, repo_path) = create_test_repo();

        // Diff main against itself should produce no changes
        let result = git_diff(&repo_path, "main", "main").unwrap();
        assert!(
            result.files.is_empty(),
            "identical branches should produce empty diff"
        );
    }

    #[test]
    fn test_diff_detects_added_files() {
        let (_tmp, repo_path) = create_test_repo();
        let repo = git2::Repository::open(&repo_path).unwrap();
        let sig = repo.signature().unwrap();

        // Create a feature branch from main
        let main_commit = repo
            .revparse_single("main")
            .unwrap()
            .peel_to_commit()
            .unwrap();
        repo.branch("feature-add", &main_commit, false).unwrap();

        // Checkout feature branch and add a new file
        repo.set_head("refs/heads/feature-add").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();

        let new_file = std::path::Path::new(&repo_path).join("new_file.txt");
        fs::write(&new_file, "new content\n").unwrap();

        let mut index = repo.index().unwrap();
        index
            .add_path(std::path::Path::new("new_file.txt"))
            .unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(
            Some("refs/heads/feature-add"),
            &sig,
            &sig,
            "add new file",
            &tree,
            &[&main_commit],
        )
        .unwrap();

        let result = git_diff(&repo_path, "main", "feature-add").unwrap();
        assert_eq!(result.files.len(), 1);
        assert_eq!(result.files[0].path, "new_file.txt");
        assert_eq!(result.files[0].change_type, "add");
    }

    #[test]
    fn test_diff_detects_modified_files() {
        let (_tmp, repo_path) = create_test_repo();
        let repo = git2::Repository::open(&repo_path).unwrap();
        let sig = repo.signature().unwrap();

        let main_commit = repo
            .revparse_single("main")
            .unwrap()
            .peel_to_commit()
            .unwrap();
        repo.branch("feature-modify", &main_commit, false).unwrap();
        repo.set_head("refs/heads/feature-modify").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();

        // Modify README.md
        let readme = std::path::Path::new(&repo_path).join("README.md");
        fs::write(&readme, "# Modified Repo\nSome extra content.\n").unwrap();

        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new("README.md")).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(
            Some("refs/heads/feature-modify"),
            &sig,
            &sig,
            "modify readme",
            &tree,
            &[&main_commit],
        )
        .unwrap();

        let result = git_diff(&repo_path, "main", "feature-modify").unwrap();
        assert_eq!(result.files.len(), 1);
        assert_eq!(result.files[0].path, "README.md");
        assert_eq!(result.files[0].change_type, "modify");
    }

    #[test]
    fn test_diff_detects_removed_files() {
        let (_tmp, repo_path) = create_test_repo();
        let repo = git2::Repository::open(&repo_path).unwrap();
        let sig = repo.signature().unwrap();

        let main_commit = repo
            .revparse_single("main")
            .unwrap()
            .peel_to_commit()
            .unwrap();
        repo.branch("feature-remove", &main_commit, false).unwrap();
        repo.set_head("refs/heads/feature-remove").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();

        // Remove README.md
        let readme = std::path::Path::new(&repo_path).join("README.md");
        fs::remove_file(&readme).unwrap();

        let mut index = repo.index().unwrap();
        index
            .remove_path(std::path::Path::new("README.md"))
            .unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(
            Some("refs/heads/feature-remove"),
            &sig,
            &sig,
            "remove readme",
            &tree,
            &[&main_commit],
        )
        .unwrap();

        let result = git_diff(&repo_path, "main", "feature-remove").unwrap();
        assert_eq!(result.files.len(), 1);
        assert_eq!(result.files[0].path, "README.md");
        assert_eq!(result.files[0].change_type, "remove");
    }

    #[test]
    fn test_diff_detects_renamed_files() {
        let (_tmp, repo_path) = create_test_repo();
        let repo = git2::Repository::open(&repo_path).unwrap();
        let sig = repo.signature().unwrap();

        let main_commit = repo
            .revparse_single("main")
            .unwrap()
            .peel_to_commit()
            .unwrap();
        repo.branch("feature-rename", &main_commit, false).unwrap();
        repo.set_head("refs/heads/feature-rename").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();

        // Rename README.md → DOCS.md (same content so find_similar detects it)
        let old_path = std::path::Path::new(&repo_path).join("README.md");
        let new_path = std::path::Path::new(&repo_path).join("DOCS.md");
        fs::rename(&old_path, &new_path).unwrap();

        let mut index = repo.index().unwrap();
        index
            .remove_path(std::path::Path::new("README.md"))
            .unwrap();
        index.add_path(std::path::Path::new("DOCS.md")).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(
            Some("refs/heads/feature-rename"),
            &sig,
            &sig,
            "rename readme to docs",
            &tree,
            &[&main_commit],
        )
        .unwrap();

        let result = git_diff(&repo_path, "main", "feature-rename").unwrap();
        assert_eq!(
            result.files.len(),
            1,
            "rename should produce exactly 1 diff entry"
        );
        assert_eq!(result.files[0].change_type, "rename");
        assert_eq!(result.files[0].path, "DOCS.md");
        assert_eq!(
            result.files[0].old_path.as_deref(),
            Some("README.md"),
            "old_path should contain the original filename"
        );
    }

    #[test]
    fn test_diff_workdir_detects_uncommitted_changes() {
        let (_tmp, repo_path) = create_test_repo();
        let repo = git2::Repository::open(&repo_path).unwrap();

        // Checkout main so working directory matches
        repo.set_head("refs/heads/main").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();

        // Modify README.md in working directory (do NOT commit)
        let readme = std::path::Path::new(&repo_path).join("README.md");
        fs::write(&readme, "# Changed in workdir\n").unwrap();

        let result = git_diff(&repo_path, "main", WORKDIR_SENTINEL).unwrap();
        assert!(
            !result.files.is_empty(),
            "WORKDIR diff should detect uncommitted changes"
        );

        let modified = result.files.iter().find(|f| f.path == "README.md");
        assert!(modified.is_some(), "should find modified README.md");
        assert_eq!(modified.unwrap().change_type, "modify");
    }

    #[test]
    fn test_diff_nonexistent_branch_returns_error() {
        let (_tmp, repo_path) = create_test_repo();

        let result = git_diff(&repo_path, "main", "nonexistent-branch");
        assert!(
            result.is_err(),
            "diffing against a nonexistent branch should error"
        );
        let err_msg = result.unwrap_err();
        assert!(
            err_msg.contains("Failed to resolve"),
            "error should mention resolution failure, got: {}",
            err_msg
        );
    }

    #[test]
    fn test_diff_binary_files_detected() {
        let (_tmp, repo_path) = create_test_repo();
        let repo = git2::Repository::open(&repo_path).unwrap();
        let sig = repo.signature().unwrap();

        let main_commit = repo
            .revparse_single("main")
            .unwrap()
            .peel_to_commit()
            .unwrap();
        repo.branch("feature-binary", &main_commit, false).unwrap();
        repo.set_head("refs/heads/feature-binary").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();

        // Add a binary file (contains null bytes)
        let bin_path = std::path::Path::new(&repo_path).join("image.png");
        let binary_content: Vec<u8> = vec![0x89, 0x50, 0x4E, 0x47, 0x00, 0x00, 0x00, 0x01];
        fs::write(&bin_path, &binary_content).unwrap();

        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new("image.png")).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(
            Some("refs/heads/feature-binary"),
            &sig,
            &sig,
            "add binary file",
            &tree,
            &[&main_commit],
        )
        .unwrap();

        // The diff should detect the binary file as an added file
        let result = git_diff(&repo_path, "main", "feature-binary").unwrap();
        let bin_file = result.files.iter().find(|f| f.path == "image.png");
        assert!(bin_file.is_some(), "binary file should appear in diff");
        assert_eq!(bin_file.unwrap().change_type, "add");

        // Also verify read_file_blob marks it as binary
        let blob = read_file_blob(&repo_path, "feature-binary", "image.png").unwrap();
        assert!(
            blob.binary,
            "image.png should be detected as binary by read_file_blob"
        );
    }

    // ── read_file_blob tests ─────────────────────────────────────────

    #[test]
    fn test_read_file_blob_text_file_returns_correct_content() {
        let (_tmp, repo_path) = create_test_repo();

        // README.md was committed in the initial commit with "# Test Repo\n"
        let result = read_file_blob(&repo_path, "main", "README.md").unwrap();
        assert!(!result.binary, "README.md should not be binary");
        assert_eq!(result.not_found, None, "not_found should be None");
        assert_eq!(
            result.text.as_deref(),
            Some("# Test Repo\n"),
            "text content should match what was committed"
        );
    }

    #[test]
    fn test_read_file_blob_missing_file_returns_not_found() {
        let (_tmp, repo_path) = create_test_repo();

        let result = read_file_blob(&repo_path, "main", "does_not_exist.txt").unwrap();
        assert_eq!(
            result.not_found,
            Some(true),
            "missing file should have notFound=true"
        );
        assert!(!result.binary, "missing file should not be marked binary");
        assert_eq!(result.text, None, "missing file should have no text");
    }

    #[test]
    fn test_read_file_blob_binary_file_returns_binary_true() {
        let (_tmp, repo_path) = create_test_repo();
        let repo = git2::Repository::open(&repo_path).unwrap();
        let sig = repo.signature().unwrap();

        let main_commit = repo
            .revparse_single("main")
            .unwrap()
            .peel_to_commit()
            .unwrap();

        // Create a branch with a binary file containing null bytes
        repo.branch("binary-branch", &main_commit, false).unwrap();
        repo.set_head("refs/heads/binary-branch").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();

        let bin_path = std::path::Path::new(&repo_path).join("data.bin");
        let binary_content: Vec<u8> = vec![0xFF, 0xD8, 0x00, 0x00, 0x01, 0x02, 0x03];
        fs::write(&bin_path, &binary_content).unwrap();

        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new("data.bin")).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(
            Some("refs/heads/binary-branch"),
            &sig,
            &sig,
            "add binary file",
            &tree,
            &[&main_commit],
        )
        .unwrap();

        let result = read_file_blob(&repo_path, "binary-branch", "data.bin").unwrap();
        assert!(
            result.binary,
            "file with null bytes should be detected as binary"
        );
        assert_eq!(result.text, None, "binary file should have no text");
        assert_eq!(
            result.not_found, None,
            "binary file should not be not_found"
        );
    }

    #[test]
    fn test_read_file_blob_workdir_reads_from_filesystem() {
        let (_tmp, repo_path) = create_test_repo();
        let repo = git2::Repository::open(&repo_path).unwrap();

        // Checkout main so working directory is populated
        repo.set_head("refs/heads/main").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();

        // Write a new file to the working directory (not committed)
        let new_file = std::path::Path::new(&repo_path).join("workdir_only.txt");
        fs::write(&new_file, "workdir content here\n").unwrap();

        let result = read_file_blob(&repo_path, WORKDIR_SENTINEL, "workdir_only.txt").unwrap();
        assert!(!result.binary, "text file in workdir should not be binary");
        assert_eq!(
            result.not_found, None,
            "file exists so not_found should be None"
        );
        assert_eq!(
            result.text.as_deref(),
            Some("workdir content here\n"),
            "WORKDIR read should return filesystem content"
        );
    }

    #[test]
    fn test_read_file_blob_workdir_missing_file_returns_not_found() {
        let (_tmp, repo_path) = create_test_repo();

        let result = read_file_blob(&repo_path, WORKDIR_SENTINEL, "no_such_file.txt").unwrap();
        assert_eq!(
            result.not_found,
            Some(true),
            "missing workdir file should have notFound=true"
        );
        assert!(!result.binary);
        assert_eq!(result.text, None);
    }

    #[test]
    fn test_read_file_blob_non_utf8_lossy_conversion() {
        let (_tmp, repo_path) = create_test_repo();
        let repo = git2::Repository::open(&repo_path).unwrap();
        let sig = repo.signature().unwrap();

        let main_commit = repo
            .revparse_single("main")
            .unwrap()
            .peel_to_commit()
            .unwrap();

        repo.branch("non-utf8-branch", &main_commit, false).unwrap();
        repo.set_head("refs/heads/non-utf8-branch").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();

        // Create a file with invalid UTF-8 bytes (but no null bytes, so not binary)
        // 0xC0 0xC1 are invalid UTF-8 lead bytes; 0xFE 0xFF are also invalid
        let invalid_utf8: Vec<u8> = vec![
            b'h', b'e', b'l', b'l', b'o', 0xC0, 0xC1, b'w', b'o', b'r', b'l', b'd',
        ];
        let file_path = std::path::Path::new(&repo_path).join("bad_utf8.txt");
        fs::write(&file_path, &invalid_utf8).unwrap();

        let mut index = repo.index().unwrap();
        index
            .add_path(std::path::Path::new("bad_utf8.txt"))
            .unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(
            Some("refs/heads/non-utf8-branch"),
            &sig,
            &sig,
            "add non-utf8 file",
            &tree,
            &[&main_commit],
        )
        .unwrap();

        let result = read_file_blob(&repo_path, "non-utf8-branch", "bad_utf8.txt").unwrap();
        assert!(
            !result.binary,
            "non-UTF8 text file should not be binary (no null bytes)"
        );
        assert_eq!(result.not_found, None);

        let text = result.text.expect("should have text via lossy conversion");
        // Lossy conversion replaces invalid bytes with U+FFFD (�)
        assert!(
            text.contains('\u{FFFD}'),
            "lossy conversion should produce replacement characters, got: {:?}",
            text
        );
        assert!(
            text.starts_with("hello"),
            "valid prefix should be preserved"
        );
        assert!(text.ends_with("world"), "valid suffix should be preserved");
    }

    #[test]
    fn test_read_file_blob_non_utf8_workdir_lossy_conversion() {
        let (_tmp, repo_path) = create_test_repo();
        let repo = git2::Repository::open(&repo_path).unwrap();

        repo.set_head("refs/heads/main").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();

        // Write invalid UTF-8 directly to workdir (no null bytes)
        let invalid_utf8: Vec<u8> = vec![b'A', b'B', 0xFE, 0xFF, b'C', b'D'];
        let file_path = std::path::Path::new(&repo_path).join("bad_workdir.txt");
        fs::write(&file_path, &invalid_utf8).unwrap();

        let result = read_file_blob(&repo_path, WORKDIR_SENTINEL, "bad_workdir.txt").unwrap();
        assert!(!result.binary);
        let text = result.text.expect("should have text via lossy conversion");
        assert!(
            text.contains('\u{FFFD}'),
            "WORKDIR lossy conversion should produce replacement characters"
        );
        assert!(text.starts_with("AB"), "valid prefix should be preserved");
        assert!(text.ends_with("CD"), "valid suffix should be preserved");
    }

    #[test]
    fn test_read_file_blob_bad_ref_returns_error() {
        let (_tmp, repo_path) = create_test_repo();

        let result = read_file_blob(&repo_path, "nonexistent-ref", "README.md");
        assert!(
            result.is_err(),
            "reading from a non-existent ref should return an error"
        );
        let err_msg = result.unwrap_err();
        assert!(
            err_msg.contains("Failed to resolve"),
            "error should mention resolution failure, got: {}",
            err_msg
        );
    }

    #[test]
    fn test_read_file_blob_workdir_binary_file_detected() {
        let (_tmp, repo_path) = create_test_repo();
        let repo = git2::Repository::open(&repo_path).unwrap();

        repo.set_head("refs/heads/main").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();

        // Write a binary file (containing null bytes) to the working directory
        let bin_content: Vec<u8> = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x00, 0x1A];
        let bin_path = std::path::Path::new(&repo_path).join("photo.png");
        fs::write(&bin_path, &bin_content).unwrap();

        let result = read_file_blob(&repo_path, WORKDIR_SENTINEL, "photo.png").unwrap();
        assert!(
            result.binary,
            "WORKDIR binary file (null bytes) should be detected"
        );
        assert_eq!(result.text, None, "binary workdir file should have no text");
        assert_eq!(result.not_found, None);
    }

    // ── list_files tests ────────────────────────────────────────────────

    #[test]
    fn test_list_files_returns_all_committed_files() {
        let (_tmp, repo_path) = create_test_repo();

        // The test repo has only README.md committed on main
        let result = list_files(&repo_path, "main").unwrap();
        assert_eq!(result.files, vec!["README.md"]);
    }

    #[test]
    fn test_list_files_nested_directories_flatten_to_full_paths() {
        let (_tmp, repo_path) = create_test_repo();
        let repo = git2::Repository::open(&repo_path).unwrap();
        let sig = repo.signature().unwrap();

        let main_commit = repo
            .revparse_single("main")
            .unwrap()
            .peel_to_commit()
            .unwrap();
        repo.branch("feature-nested", &main_commit, false).unwrap();
        repo.set_head("refs/heads/feature-nested").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();

        // Create nested directory structure: src/lib/util.rs and src/main.rs
        let src_dir = std::path::Path::new(&repo_path).join("src");
        let lib_dir = src_dir.join("lib");
        fs::create_dir_all(&lib_dir).unwrap();
        fs::write(src_dir.join("main.rs"), "fn main() {}\n").unwrap();
        fs::write(lib_dir.join("util.rs"), "pub fn helper() {}\n").unwrap();

        let mut index = repo.index().unwrap();
        index
            .add_path(std::path::Path::new("src/main.rs"))
            .unwrap();
        index
            .add_path(std::path::Path::new("src/lib/util.rs"))
            .unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(
            Some("refs/heads/feature-nested"),
            &sig,
            &sig,
            "add nested files",
            &tree,
            &[&main_commit],
        )
        .unwrap();

        let result = list_files(&repo_path, "feature-nested").unwrap();
        let mut files = result.files.clone();
        files.sort();

        assert_eq!(
            files,
            vec!["README.md", "src/lib/util.rs", "src/main.rs"],
            "nested directories should be flattened to full paths with forward slashes"
        );
    }

    #[test]
    fn test_list_files_empty_tree_returns_empty_list() {
        let tmp = tempfile::tempdir().expect("failed to create temp dir");
        let repo_path = tmp.path().to_str().unwrap().to_string();

        let repo = git2::Repository::init(&repo_path).expect("failed to init repo");

        // Configure committer identity
        let mut config = repo.config().expect("failed to get config");
        config.set_str("user.name", "Test").unwrap();
        config.set_str("user.email", "test@test.com").unwrap();

        // Create a commit with an empty tree (no files)
        let sig = repo.signature().unwrap();
        let empty_tree_id = repo.treebuilder(None).unwrap().write().unwrap();
        let empty_tree = repo.find_tree(empty_tree_id).unwrap();
        repo.commit(
            Some("refs/heads/main"),
            &sig,
            &sig,
            "empty commit",
            &empty_tree,
            &[],
        )
        .unwrap();
        repo.set_head("refs/heads/main").unwrap();

        let result = list_files(&repo_path, "main").unwrap();
        assert!(
            result.files.is_empty(),
            "empty tree should return empty file list"
        );
    }

    #[test]
    fn test_list_files_workdir_returns_filesystem_files() {
        let (_tmp, repo_path) = create_test_repo();
        let repo = git2::Repository::open(&repo_path).unwrap();

        repo.set_head("refs/heads/main").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();

        // Add an extra untracked file to the working directory
        let extra_path = std::path::Path::new(&repo_path).join("extra.txt");
        fs::write(&extra_path, "extra content\n").unwrap();

        let result = list_files(&repo_path, WORKDIR_SENTINEL).unwrap();
        assert!(
            result.files.contains(&"README.md".to_string()),
            "WORKDIR should include tracked files"
        );
        assert!(
            result.files.contains(&"extra.txt".to_string()),
            "WORKDIR should include untracked files"
        );
    }

    #[test]
    fn test_list_files_workdir_respects_gitignore() {
        let (_tmp, repo_path) = create_test_repo();
        let repo = git2::Repository::open(&repo_path).unwrap();
        let sig = repo.signature().unwrap();

        let main_commit = repo
            .revparse_single("main")
            .unwrap()
            .peel_to_commit()
            .unwrap();

        // Add a .gitignore that ignores *.log files
        let gitignore_path = std::path::Path::new(&repo_path).join(".gitignore");
        fs::write(&gitignore_path, "*.log\nbuild/\n").unwrap();

        let mut index = repo.index().unwrap();
        index
            .add_path(std::path::Path::new(".gitignore"))
            .unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(
            Some("refs/heads/main"),
            &sig,
            &sig,
            "add gitignore",
            &tree,
            &[&main_commit],
        )
        .unwrap();

        repo.set_head("refs/heads/main").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();

        // Create files: one ignored, one not
        let log_path = std::path::Path::new(&repo_path).join("debug.log");
        fs::write(&log_path, "log line\n").unwrap();

        let build_dir = std::path::Path::new(&repo_path).join("build");
        fs::create_dir_all(&build_dir).unwrap();
        fs::write(build_dir.join("output.js"), "var x = 1;\n").unwrap();

        let src_path = std::path::Path::new(&repo_path).join("src.rs");
        fs::write(&src_path, "fn main() {}\n").unwrap();

        let result = list_files(&repo_path, WORKDIR_SENTINEL).unwrap();
        assert!(
            result.files.contains(&"src.rs".to_string()),
            "non-ignored files should be listed"
        );
        assert!(
            !result.files.contains(&"debug.log".to_string()),
            ".gitignore should exclude *.log files"
        );
        assert!(
            !result.files.contains(&"build/output.js".to_string()),
            ".gitignore should exclude build/ directory"
        );
    }

    // ── list_files_with_oids tests ──────────────────────────────────────

    #[test]
    fn test_list_files_with_oids_returns_valid_oid_strings() {
        let (_tmp, repo_path) = create_test_repo();

        let result = list_files_with_oids(&repo_path, "main").unwrap();
        assert_eq!(
            result.files.len(),
            1,
            "test repo has one committed file on main"
        );

        let file = &result.files[0];
        assert_eq!(file.path, "README.md");
        // OIDs are 40-character hex strings
        assert_eq!(
            file.oid.len(),
            40,
            "OID should be 40 characters, got: {}",
            file.oid
        );
        assert!(
            file.oid.chars().all(|c| c.is_ascii_hexdigit()),
            "OID should be valid hex string, got: {}",
            file.oid
        );
    }

    #[test]
    fn test_list_files_with_oids_multiple_files() {
        let (_tmp, repo_path) = create_test_repo();
        let repo = git2::Repository::open(&repo_path).unwrap();
        let sig = repo.signature().unwrap();

        let main_commit = repo
            .revparse_single("main")
            .unwrap()
            .peel_to_commit()
            .unwrap();
        repo.branch("multi-files", &main_commit, false).unwrap();
        repo.set_head("refs/heads/multi-files").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();

        // Add multiple files
        fs::write(
            std::path::Path::new(&repo_path).join("a.txt"),
            "file a\n",
        )
        .unwrap();
        fs::write(
            std::path::Path::new(&repo_path).join("b.txt"),
            "file b\n",
        )
        .unwrap();

        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new("a.txt")).unwrap();
        index.add_path(std::path::Path::new("b.txt")).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(
            Some("refs/heads/multi-files"),
            &sig,
            &sig,
            "add multiple files",
            &tree,
            &[&main_commit],
        )
        .unwrap();

        let result = list_files_with_oids(&repo_path, "multi-files").unwrap();
        let mut paths: Vec<&str> = result.files.iter().map(|f| f.path.as_str()).collect();
        paths.sort();
        assert_eq!(paths, vec!["README.md", "a.txt", "b.txt"]);

        // All OIDs should be valid 40-char hex
        for file in &result.files {
            assert_eq!(file.oid.len(), 40, "OID for {} should be 40 chars", file.path);
            assert!(
                file.oid.chars().all(|c| c.is_ascii_hexdigit()),
                "OID for {} should be valid hex",
                file.path
            );
        }

        // Different file contents should have different OIDs
        let oid_a = result.files.iter().find(|f| f.path == "a.txt").unwrap();
        let oid_b = result.files.iter().find(|f| f.path == "b.txt").unwrap();
        assert_ne!(
            oid_a.oid, oid_b.oid,
            "files with different content should have different OIDs"
        );
    }

    // ── resolve_ref tests ───────────────────────────────────────────────

    #[test]
    fn test_resolve_ref_valid_branch_resolves_to_oid() {
        let (_tmp, repo_path) = create_test_repo();

        let result = resolve_ref(&repo_path, "main").unwrap();
        assert_eq!(
            result.oid.len(),
            40,
            "resolved OID should be 40 characters, got: {}",
            result.oid
        );
        assert!(
            result.oid.chars().all(|c| c.is_ascii_hexdigit()),
            "resolved OID should be valid hex, got: {}",
            result.oid
        );
    }

    #[test]
    fn test_resolve_ref_invalid_ref_returns_error() {
        let (_tmp, repo_path) = create_test_repo();

        let result = resolve_ref(&repo_path, "nonexistent-branch");
        assert!(
            result.is_err(),
            "resolving a nonexistent ref should return an error"
        );
        let err_msg = result.unwrap_err();
        assert!(
            err_msg.contains("Failed to resolve"),
            "error should mention resolution failure, got: {}",
            err_msg
        );
    }

    #[test]
    fn test_resolve_ref_head_resolves_correctly() {
        let (_tmp, repo_path) = create_test_repo();

        // HEAD should resolve to the same OID as main (since HEAD points to main)
        let head_result = resolve_ref(&repo_path, "HEAD").unwrap();
        let main_result = resolve_ref(&repo_path, "main").unwrap();

        assert_eq!(
            head_result.oid, main_result.oid,
            "HEAD and main should resolve to the same OID"
        );
        assert_eq!(head_result.oid.len(), 40);
        assert!(head_result.oid.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
