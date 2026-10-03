pub mod commands;
pub mod highlight;
pub mod markdown;
pub mod models;
pub mod utils;
pub mod watcher;
pub mod diff;

use tauri::{Emitter, Manager};
use watcher::FileWatcherState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let _ = app.emit("open-file-from-cli", args);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .manage(FileWatcherState::new())
        .invoke_handler(tauri::generate_handler![
            commands::file::open_md_file,
            commands::file::open_folder,
            commands::file::reset_file_dialog_size,
            commands::file::get_cli_args,
            commands::file::read_directory,
            commands::file::read_md_file,
            commands::file::open_in_app,
            commands::file::reveal_in_explorer,
            commands::link::resolve_link_target,
            commands::link::open_external,
            commands::image::read_image_data_url,
            commands::markdown::parse_markdown,
            commands::watcher::watch_active_files,
            commands::workspace::list_workspace_markdown_files,
            commands::diff::compare_markdown_files,
            commands::diff::compare_markdown_text,
            commands::git::compare_git_markdown,
            commands::git::check_git_status,
            commands::git::get_git_commit_history
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

