#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Build tray menu
            let show = tauri::menu::MenuItemBuilder::with_id("show", "显示窗口")
                .build(app)?;
            let quit = tauri::menu::MenuItemBuilder::with_id("quit", "退出")
                .build(app)?;
            let menu = tauri::menu::MenuBuilder::new(app)
                .item(&show)
                .item(&quit)
                .build()?;

            // Load and decode tray icon
            let img = image::load_from_memory(include_bytes!("../icons/icon.ico"))
                .map_err(|e| format!("{e}"))?
                .into_rgba8();
            let (w, h) = img.dimensions();
            let icon = tauri::image::Image::new_owned(img.into_raw(), w, h);

            // Build system tray
            tauri::tray::TrayIconBuilder::new()
                .icon(icon)
                .tooltip("Codex Provider Switcher")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { .. } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Hide to tray instead of closing
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            codex_provider_switcher_lib::commands::load_codex_config,
            codex_provider_switcher_lib::commands::list_profiles,
            codex_provider_switcher_lib::commands::create_profile_from_current,
            codex_provider_switcher_lib::commands::create_empty_profile,
            codex_provider_switcher_lib::commands::load_profile,
            codex_provider_switcher_lib::commands::parse_profile_fields,
            codex_provider_switcher_lib::commands::parse_toml_content,
            codex_provider_switcher_lib::commands::save_profile_toml,
            codex_provider_switcher_lib::commands::save_profile_fields,
            codex_provider_switcher_lib::commands::delete_profile,
            codex_provider_switcher_lib::commands::apply_profile,
            codex_provider_switcher_lib::commands::get_config_path,
            codex_provider_switcher_lib::commands::set_config_path,
            codex_provider_switcher_lib::commands::load_auth_json,
            codex_provider_switcher_lib::commands::save_auth_json,
            codex_provider_switcher_lib::commands::parse_auth_content,
            codex_provider_switcher_lib::commands::save_auth_fields,
            codex_provider_switcher_lib::commands::open_config_directory,
            codex_provider_switcher_lib::commands::reset_all_enabled,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
