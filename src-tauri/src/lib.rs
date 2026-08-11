pub mod cc_hub;

#[cfg(feature = "desktop")]
use std::io;
#[cfg(feature = "desktop")]
use tauri::Manager;

#[cfg(feature = "desktop")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| -> Result<(), Box<dyn std::error::Error>> {
            let config_dir = app.path().app_config_dir().map_err(|_| {
                io::Error::new(io::ErrorKind::NotFound, "app config directory unavailable")
            })?;
            app.manage(cc_hub::AppState::new(config_dir)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cc_hub::commands::get_cc_hub_connection_state,
            cc_hub::commands::save_cc_hub_connection,
            cc_hub::commands::test_cc_hub_connection,
            cc_hub::commands::remove_cc_hub_connection,
            cc_hub::commands::list_providers,
            cc_hub::commands::set_provider_enabled,
            cc_hub::commands::list_quota_users,
            cc_hub::commands::list_usage_logs,
            cc_hub::commands::get_usage_filter_options,
        ])
        .run(tauri::generate_context!())
        .expect("error while running OmniDeck");
}

#[cfg(not(feature = "desktop"))]
pub fn run() {
    panic!("OmniDeck requires the desktop feature to run");
}
