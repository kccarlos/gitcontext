use git2::Repository;
use serde::{Deserialize, Serialize};
use std::path::Path;

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
    pub change_type: String, // "modify" | "add" | "remove"
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

/// Open a git repository and return branch information
pub fn open_repo(path: &str) -> Result<LoadRepoResult, String> {
    let repo = Repository::open(path).map_err(|e| format!("Failed to open repository: {}", e))?;

    // Get all branches
    let branches = repo
        .branches(None)
        .map_err(|e| format!("Failed to list branches: {}", e))?
        .filter_map(|branch_result| {
            branch_result.ok().and_then(|(branch, _)| {
                branch.name().ok().flatten().map(|name| name.to_string())
            })
        })
        .collect();

    // Try to get default branch (HEAD)
    let default_branch = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(|s| s.to_string()));

    Ok(LoadRepoResult {
        branches,
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

    // Resolve base and compare to commits
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

    // Get trees from commits
    let base_tree = base_commit
        .tree()
        .map_err(|e| format!("Failed to get base tree: {}", e))?;

    let compare_tree = compare_commit
        .tree()
        .map_err(|e| format!("Failed to get compare tree: {}", e))?;

    // Compute diff
    let diff = repo
        .diff_tree_to_tree(Some(&base_tree), Some(&compare_tree), None)
        .map_err(|e| format!("Failed to compute diff: {}", e))?;

    let mut files = Vec::new();

    diff.foreach(
        &mut |delta, _progress| {
            let path = delta.new_file().path()
                .or_else(|| delta.old_file().path())
                .and_then(|p| p.to_str())
                .unwrap_or("")
                .to_string();

            let change_type = match delta.status() {
                git2::Delta::Added => "add",
                git2::Delta::Deleted => "remove",
                git2::Delta::Modified => "modify",
                git2::Delta::Renamed => "modify",
                git2::Delta::Copied => "add",
                _ => "modify",
            };

            files.push(DiffFile {
                path,
                change_type: change_type.to_string(),
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

/// Read file content at a specific ref
pub fn read_file_blob(path: &str, ref_name: &str, file_path: &str) -> Result<ReadFileResult, String> {
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

    // Find the file in the tree
    let entry = tree
        .get_path(Path::new(file_path))
        .map_err(|_| {
            return ReadFileResult {
                binary: false,
                text: None,
                not_found: Some(true),
            };
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
        .ok_or_else(|| format!("Path is not a file"))?;

    // Check if binary
    let content = blob.content();
    let is_binary = content.iter().any(|&b| b == 0);

    if is_binary {
        return Ok(ReadFileResult {
            binary: true,
            text: None,
            not_found: None,
        });
    }

    // Convert to UTF-8 string
    let text = String::from_utf8(content.to_vec())
        .map_err(|_| "Failed to decode file as UTF-8".to_string())?;

    Ok(ReadFileResult {
        binary: false,
        text: Some(text),
        not_found: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: These tests would need a test repository to run against
    // For now, they serve as examples of how to test the git operations

    #[test]
    fn test_open_repo_structure() {
        // Test that the function signature is correct
        // Actual test would need a valid repo path
        let result = open_repo("/nonexistent/path");
        assert!(result.is_err());
    }
}
