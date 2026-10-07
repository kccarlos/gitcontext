use std::sync::Mutex;
#[cfg(debug_assertions)]
use tauri::Manager;

mod git;
mod watcher;

// Global watcher state
static WATCHER: Mutex<Option<watcher::RepoWatcher>> = Mutex::new(None);

// Test command to verify Tauri is working
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! GitContext Desktop is running.", name)
}

// Git operations commands
#[tauri::command]
fn open_repo(app: tauri::AppHandle, path: String) -> Result<git::LoadRepoResult, String> {
    let result = git::open_repo(&path)?;

    // Stop existing watcher if any
    if let Ok(mut watcher) = WATCHER.lock() {
        if let Some(old_watcher) = watcher.take() {
            old_watcher.stop();
        }

        // Start new watcher
        match watcher::RepoWatcher::new(app, path.clone()) {
            Ok(new_watcher) => {
                *watcher = Some(new_watcher);
            }
            Err(e) => {
                eprintln!("Warning: Failed to start file watcher: {}", e);
                // Continue without watcher - not a fatal error
            }
        }
    }

    Ok(result)
}

#[tauri::command]
fn get_branches(path: String) -> Result<git::LoadRepoResult, String> {
    git::get_branches(&path)
}

#[tauri::command]
fn git_diff(path: String, base: String, compare: String) -> Result<git::DiffResult, String> {
    git::git_diff(&path, &base, &compare)
}

#[tauri::command]
fn read_file_blob(
    path: String,
    ref_name: String,
    file_path: String,
) -> Result<git::ReadFileResult, String> {
    git::read_file_blob(&path, &ref_name, &file_path)
}

#[tauri::command]
fn list_files(path: String, ref_name: String) -> Result<git::ListFilesResult, String> {
    git::list_files(&path, &ref_name)
}

#[tauri::command]
fn list_files_with_oids(
    path: String,
    ref_name: String,
) -> Result<git::ListFilesWithOidsResult, String> {
    git::list_files_with_oids(&path, &ref_name)
}

#[tauri::command]
fn resolve_ref(path: String, ref_name: String) -> Result<git::ResolveRefResult, String> {
    git::resolve_ref(&path, &ref_name)
}

#[tauri::command]
fn list_commits(
    path: String,
    ref_name: String,
    max_count: Option<u32>,
) -> Result<git::ListCommitsResult, String> {
    git::list_commits(&path, &ref_name, max_count)
}

#[tauri::command]
fn close_repo() -> Result<(), String> {
    if let Ok(mut watcher) = WATCHER.lock() {
        if let Some(old_watcher) = watcher.take() {
            old_watcher.stop();
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            open_repo,
            get_branches,
            git_diff,
            read_file_blob,
            list_files,
            list_files_with_oids,
            resolve_ref,
            list_commits,
            close_repo
        ])
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                let window = _app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
