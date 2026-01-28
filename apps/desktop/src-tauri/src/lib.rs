#[cfg(debug_assertions)]
use tauri::Manager;

mod git;

// Test command to verify Tauri is working
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! GitContext Desktop is running.", name)
}

// Git operations commands
#[tauri::command]
fn open_repo(path: String) -> Result<git::LoadRepoResult, String> {
    git::open_repo(&path)
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
fn read_file_blob(path: String, ref_name: String, file_path: String) -> Result<git::ReadFileResult, String> {
    git::read_file_blob(&path, &ref_name, &file_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            open_repo,
            get_branches,
            git_diff,
            read_file_blob
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
