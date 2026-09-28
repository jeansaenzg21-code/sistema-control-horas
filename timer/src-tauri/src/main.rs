#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

#[cfg(not(windows))]
use tauri::{PhysicalPosition, PhysicalSize};

/// Cambia tamaño y posición en una sola operación nativa para evitar que
/// Windows renderice un estado intermedio al abrir o cerrar el panel.
#[tauri::command]
fn set_window_bounds(
    window: tauri::WebviewWindow,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let result = unsafe {
            windows_sys::Win32::UI::WindowsAndMessaging::SetWindowPos(
                hwnd.0 as _,
                std::ptr::null_mut(),
                x,
                y,
                width as i32,
                height as i32,
                windows_sys::Win32::UI::WindowsAndMessaging::SWP_NOACTIVATE
                    | windows_sys::Win32::UI::WindowsAndMessaging::SWP_NOZORDER
                    | windows_sys::Win32::UI::WindowsAndMessaging::SWP_NOREDRAW,
            )
        };
        if result == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        unsafe {
            windows_sys::Win32::Graphics::Gdi::InvalidateRect(hwnd.0 as _, std::ptr::null(), 0);
            windows_sys::Win32::Graphics::Gdi::UpdateWindow(hwnd.0 as _);
        }
        return Ok(());
    }

    #[cfg(not(windows))]
    window
        .set_size(PhysicalSize::new(width, height))
        .and_then(|()| window.set_position(PhysicalPosition::new(x, y)))
        .map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        // Tiene que ir el primero: es el que intercepta el segundo lanzamiento
        // antes de que se cree ninguna ventana. Sin esto, cada doble clic abría
        // otra instancia con su propio widget encima.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Ya hay una instancia: se muestra la que existe en vez de abrir otra.
            if let Some(ventana) = app.get_webview_window("main") {
                let _ = ventana.show();
                let _ = ventana.unminimize();
                let _ = ventana.set_focus();
            }
        }))
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![set_window_bounds])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
