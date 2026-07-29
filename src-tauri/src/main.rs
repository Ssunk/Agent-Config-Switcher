#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .setup(|app| {
            // Build tray menu
            let show = tauri::menu::MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
            let quit = tauri::menu::MenuItemBuilder::with_id("quit", "退出").build(app)?;
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
                .tooltip("Agent Config Switcher")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        show_main_window(app);
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
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
            agent_config_switcher_lib::commands::load_codex_config,
            agent_config_switcher_lib::commands::list_profiles,
            agent_config_switcher_lib::commands::create_profile_from_current,
            agent_config_switcher_lib::commands::create_empty_profile,
            agent_config_switcher_lib::commands::duplicate_profile,
            agent_config_switcher_lib::commands::load_profile,
            agent_config_switcher_lib::commands::parse_profile_fields,
            agent_config_switcher_lib::commands::parse_toml_content,
            agent_config_switcher_lib::commands::save_profile_toml,
            agent_config_switcher_lib::commands::save_profile_fields,
            agent_config_switcher_lib::commands::delete_profile,
            agent_config_switcher_lib::commands::apply_profile,
            agent_config_switcher_lib::commands::get_config_path,
            agent_config_switcher_lib::commands::set_config_path,
            agent_config_switcher_lib::commands::load_auth_json,
            agent_config_switcher_lib::commands::load_profile_auth,
            agent_config_switcher_lib::commands::save_auth_json,
            agent_config_switcher_lib::commands::save_profile_auth,
            agent_config_switcher_lib::commands::parse_auth_content,
            agent_config_switcher_lib::commands::parse_json_content,
            agent_config_switcher_lib::commands::save_auth_fields,
            agent_config_switcher_lib::commands::open_config_directory,
            agent_config_switcher_lib::commands::reset_all_enabled,
            agent_config_switcher_lib::commands::load_claude_config,
            agent_config_switcher_lib::commands::list_claude_profiles,
            agent_config_switcher_lib::commands::create_claude_profile_from_current,
            agent_config_switcher_lib::commands::duplicate_claude_profile,
            agent_config_switcher_lib::commands::parse_claude_profile_fields,
            agent_config_switcher_lib::commands::save_claude_profile_fields,
            agent_config_switcher_lib::commands::delete_claude_profile,
            agent_config_switcher_lib::commands::apply_claude_profile,
            agent_config_switcher_lib::commands::open_claude_config_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
