#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod hit_test;

use serde::{Deserialize, Serialize};
use std::{
    fs,
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_autostart::ManagerExt;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Settings {
    size: f64,
    activity: f64,
    sound: bool,
    always_on_top: bool,
    autostart: bool,
    paused: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            size: 240.,
            activity: 0.45,
            sound: false,
            always_on_top: true,
            autostart: false,
            paused: false,
        }
    }
}
impl Settings {
    fn validate(&mut self) {
        if !self.size.is_finite() {
            self.size = 240.;
        }
        if !self.activity.is_finite() {
            self.activity = 0.45;
        }
        self.size = self.size.clamp(130., 340.);
        self.activity = self.activity.clamp(0., 1.);
    }
}
#[derive(Clone, Copy, Serialize)]
struct Point {
    x: f64,
    y: f64,
}
#[derive(Clone, Serialize)]
struct Area {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    scale: f64,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    cursor: Point,
    local: Point,
    left_down: bool,
    areas: Vec<Area>,
    scale: f64,
    pet: Point,
    visible: bool,
}
struct Runtime {
    settings: Settings,
    pet: Point,
    mask: Vec<u8>,
    dragging: bool,
    heartbeat: Instant,
    visible: bool,
    displays: Vec<Area>,
}
type Shared = Arc<Mutex<Runtime>>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn main_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "SCULPY window is unavailable".into())
}
fn areas(app: &tauri::AppHandle) -> Result<Vec<Area>, String> {
    Ok(app
        .available_monitors()
        .map_err(err)?
        .iter()
        .map(|m| {
            let r = m.work_area();
            Area {
                x: r.position.x as f64,
                y: r.position.y as f64,
                width: r.size.width as f64,
                height: r.size.height as f64,
                scale: m.scale_factor(),
            }
        })
        .collect())
}
fn left_down() -> bool {
    #[cfg(windows)]
    {
        unsafe {
            windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState(
                windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_LBUTTON as i32,
            ) < 0
        }
    }
    #[cfg(not(windows))]
    {
        false
    }
}
fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(err)?;
    fs::create_dir_all(&dir).map_err(err)?;
    Ok(dir.join("settings.json"))
}
fn persist(app: &tauri::AppHandle, s: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    let temp = path.with_extension("tmp");
    fs::write(&temp, serde_json::to_vec_pretty(s).map_err(err)?).map_err(err)?;
    fs::rename(temp, path).map_err(err)
}

#[tauri::command]
fn get_settings(state: tauri::State<Shared>) -> Result<Settings, String> {
    Ok(state.lock().map_err(err)?.settings.clone())
}
#[tauri::command]
fn save_settings(
    app: tauri::AppHandle,
    state: tauri::State<Shared>,
    mut settings: Settings,
) -> Result<Settings, String> {
    settings.validate();
    let old = state.lock().map_err(err)?.settings.clone();
    if old.autostart != settings.autostart {
        if settings.autostart {
            app.autolaunch().enable().map_err(err)?;
        } else {
            app.autolaunch().disable().map_err(err)?;
        }
    }
    if let Err(e) = persist(&app, &settings) {
        if old.autostart != settings.autostart {
            if old.autostart {
                let _ = app.autolaunch().enable();
            } else {
                let _ = app.autolaunch().disable();
            }
        }
        return Err(e);
    }
    main_window(&app)?
        .set_always_on_top(settings.always_on_top)
        .map_err(err)?;
    {
        let mut s = state.lock().map_err(err)?;
        s.settings = settings.clone();
        if settings.paused {
            s.dragging = false;
        }
    }
    app.emit("settings-changed", &settings).map_err(err)?;
    Ok(settings)
}
#[tauri::command]
fn get_snapshot(app: tauri::AppHandle, state: tauri::State<Shared>) -> Result<Snapshot, String> {
    let w = main_window(&app)?;
    let cursor = app.cursor_position().map_err(err)?;
    let origin = w.outer_position().map_err(err)?;
    let scale = w.scale_factor().map_err(err)?;
    let display_areas = state.lock().map_err(err)?.displays.clone();
    let s = state.lock().map_err(err)?;
    Ok(Snapshot {
        cursor: Point {
            x: cursor.x,
            y: cursor.y,
        },
        local: Point {
            x: (cursor.x - origin.x as f64) / scale,
            y: (cursor.y - origin.y as f64) / scale,
        },
        left_down: left_down(),
        areas: display_areas,
        scale,
        pet: s.pet,
        visible: s.visible,
    })
}
#[tauri::command]
fn sync_pet(
    app: tauri::AppHandle,
    state: tauri::State<Shared>,
    x: f64,
    y: f64,
    dragging: bool,
    mask: Option<Vec<u8>>,
) -> Result<(), String> {
    if !x.is_finite() || !y.is_finite() {
        return Err("Invalid pet coordinates".into());
    }
    if let Some(ref m) = mask {
        if m.len() != 128 * 128 && m.len() != 2048 {
            return Err("Invalid silhouette mask".into());
        }
    }
    let w = main_window(&app)?;
    let scale = w.scale_factor().map_err(err)?;
    // The pet's foot stays 50 logical px above the window bottom.
    let target = PhysicalPosition::new(
        (x - 380. * scale).round() as i32,
        (y - 470. * scale).round() as i32,
    );
    if w.outer_position().map_err(err)? != target {
        w.set_position(target).map_err(err)?;
    }
    let mut s = state.lock().map_err(err)?;
    s.pet = Point { x, y };
    s.dragging = dragging;
    s.heartbeat = Instant::now();
    if let Some(m) = mask {
        s.mask = m;
    }
    Ok(())
}
#[tauri::command]
async fn open_settings(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("settings") {
        w.show().map_err(err)?;
        return w.set_focus().map_err(err);
    }
    WebviewWindowBuilder::new(
        &app,
        "settings",
        WebviewUrl::App("index.html?settings".into()),
    )
    .title("SCULPY · 相处设置")
    .inner_size(440., 730.)
    .min_inner_size(400., 620.)
    .resizable(true)
    .center()
    .build()
    .map_err(err)?;
    Ok(())
}
#[tauri::command]
fn hide_pet(app: tauri::AppHandle, state: tauri::State<Shared>) -> Result<(), String> {
    main_window(&app)?.hide().map_err(err)?;
    let mut s = state.lock().map_err(err)?;
    s.visible = false;
    s.dragging = false;
    Ok(())
}
fn show_pet(app: &tauri::AppHandle) -> Result<(), String> {
    main_window(app)?.show().map_err(err)?;
    app.state::<Shared>().lock().map_err(err)?.visible = true;
    Ok(())
}
#[tauri::command]
fn reset_pet(app: tauri::AppHandle) -> Result<(), String> {
    show_pet(&app)?;
    let w = main_window(&app)?;
    if let Some(a) = areas(&app)?.first() {
        let scale = w.scale_factor().map_err(err)?;
        let p = Point {
            x: a.x + a.width * 0.72,
            y: a.y + a.height,
        };
        w.set_position(PhysicalPosition::new(
            (p.x - 380. * scale) as i32,
            (p.y - 470. * scale) as i32,
        ))
        .map_err(err)?;
        let shared = app.state::<Shared>();
        let mut s = shared.lock().map_err(err)?;
        s.pet = p;
        s.dragging = false;
    }
    app.emit_to("main", "reset-requested", ()).map_err(err)
}
#[tauri::command]
fn reload_pet(app: tauri::AppHandle) -> Result<(), String> {
    show_pet(&app)?;
    main_window(&app)?.eval("location.reload()").map_err(err)
}
#[tauri::command]
fn perform_action(app: tauri::AppHandle, action: String) -> Result<(), String> {
    if !["Jump", "Happy", "Stretch", "Sleep"].contains(&action.as_str()) {
        return Err("Unknown action".into());
    }
    app.emit_to("main", "perform-action", action).map_err(err)
}
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = show_pet(app);
            let _ = app.emit_to("main", "reset-requested", ());
        }))
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("SCULPY Companion")
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            get_snapshot,
            sync_pet,
            open_settings,
            hide_pet,
            reset_pet,
            quit_app,
            reload_pet,
            perform_action
        ])
        .setup(|app| {
            let handle = app.handle();
            let mut settings: Settings = settings_path(handle)
                .ok()
                .and_then(|p| fs::read(p).ok())
                .and_then(|b| serde_json::from_slice(&b).ok())
                .unwrap_or_default();
            settings.validate();
            settings.autostart = app.autolaunch().is_enabled().unwrap_or(false);
            let displays = areas(handle).map_err(std::io::Error::other)?;
            let primary = app
                .primary_monitor()?
                .and_then(|m| {
                    let p = m.work_area().position;
                    displays
                        .iter()
                        .find(|a| a.x == p.x as f64 && a.y == p.y as f64)
                })
                .or(displays.first())
                .ok_or_else(|| std::io::Error::other("No display is available"))?;
            let pet = Point {
                x: primary.x + primary.width * 0.72,
                y: primary.y + primary.height,
            };
            let state: Shared = Arc::new(Mutex::new(Runtime {
                settings: settings.clone(),
                pet,
                mask: vec![0; 128 * 128],
                dragging: false,
                heartbeat: Instant::now(),
                visible: true,
                displays: displays.clone(),
            }));
            app.manage(state.clone());
            let w = main_window(handle).map_err(std::io::Error::other)?;
            let sf = w.scale_factor()?;
            w.set_position(PhysicalPosition::new(
                (pet.x - 380. * sf) as i32,
                (pet.y - 470. * sf) as i32,
            ))?;
            w.set_always_on_top(settings.always_on_top)?;
            w.set_ignore_cursor_events(true)?;
            w.show()?;
            let show = MenuItem::with_id(app, "show", "显示 / 隐藏 SCULPY", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", "暂停 / 继续活动", true, None::<&str>)?;
            let prefs = MenuItem::with_id(app, "settings", "相处设置", true, None::<&str>)?;
            let reload = MenuItem::with_id(app, "reload", "重新加载角色", true, None::<&str>)?;
            let reset = MenuItem::with_id(app, "reset", "重置角色位置", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出 SCULPY", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &pause, &prefs, &reset, &reload, &quit])?;
            TrayIconBuilder::new()
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .ok_or_else(|| std::io::Error::other("Missing tray icon"))?,
                )
                .tooltip("SCULPY · 你的桌面小精灵")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, e| {
                    let result: Result<(), String> = (|| {
                        match e.id.as_ref() {
                            "quit" => app.exit(0),
                            "settings" => {
                                let handle = app.clone();
                                tauri::async_runtime::spawn(async move {
                                    if let Err(e) = open_settings(handle).await {
                                        eprintln!("settings: {e}");
                                    }
                                });
                            }
                            "reset" => reset_pet(app.clone())?,
                            "reload" => {
                                main_window(app)?.eval("location.reload() ").map_err(err)?;
                            }
                            "show" => {
                                let visible = app.state::<Shared>().lock().map_err(err)?.visible;
                                if visible {
                                    hide_pet(app.clone(), app.state())?;
                                } else {
                                    show_pet(app)?;
                                }
                            }
                            "pause" => {
                                let mut s =
                                    app.state::<Shared>().lock().map_err(err)?.settings.clone();
                                s.paused = !s.paused;
                                save_settings(app.clone(), app.state(), s)?;
                            }
                            _ => {}
                        }
                        Ok(())
                    })();
                    if let Err(error) = result {
                        eprintln!("SCULPY tray: {error}");
                    }
                })
                .build(app)?;
            let app_handle = handle.clone();
            thread::spawn(move || {
                let mut ignored = true;
                let mut tick = 0u64;
                loop {
                    thread::sleep(Duration::from_millis(16));
                    let Some(w) = app_handle.get_webview_window("main") else {
                        break;
                    };
                    // Poll independently of DOM events: an ignored window never gets mouseenter.
                    if let (Ok(cursor), Ok(origin), Ok(scale), Ok(size)) = (
                        app_handle.cursor_position(),
                        w.outer_position(),
                        w.scale_factor(),
                        w.inner_size(),
                    ) {
                        let (interactive, visible) = {
                            let Ok(s) = state.lock() else { break };
                            let fresh = s.heartbeat.elapsed() < Duration::from_secs(2);
                            (
                                s.visible
                                    && fresh
                                    && (s.dragging
                                        || hit_test::hit(
                                            &s.mask,
                                            (cursor.x - origin.x as f64) / scale,
                                            (cursor.y - origin.y as f64) / scale,
                                            size.width as f64 / scale,
                                            size.height as f64 / scale,
                                        )),
                                s.visible,
                            )
                        };
                        let next = !interactive;
                        if next != ignored {
                            if w.set_ignore_cursor_events(next).is_ok() {
                                ignored = next;
                            }
                        }
                        // Cursor and button polling continue while hidden, allowing tray recovery.
                        tick += 1;
                        if tick % 60 == 0 {
                            if let Ok(displays) = areas(&app_handle) {
                                if let Ok(mut s) = state.lock() {
                                    s.displays = displays;
                                }
                            }
                        }
                        if tick % 2 == 0 {
                            let snapshot = {
                                let Ok(s) = state.lock() else { break };
                                Snapshot {
                                    cursor: Point {
                                        x: cursor.x,
                                        y: cursor.y,
                                    },
                                    local: Point {
                                        x: (cursor.x - origin.x as f64) / scale,
                                        y: (cursor.y - origin.y as f64) / scale,
                                    },
                                    left_down: left_down(),
                                    areas: s.displays.clone(),
                                    scale,
                                    pet: s.pet,
                                    visible: s.visible,
                                }
                            };
                            let _ = w.emit("desktop-snapshot", snapshot);
                        }
                        if !visible {
                            thread::sleep(Duration::from_millis(80));
                        }
                    }
                }
            });
            Ok(())
        })
        .on_window_event(|w, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if w.label() == "main" {
                    api.prevent_close();
                    let _ = w.hide();
                    if let Ok(mut s) = w.app_handle().state::<Shared>().lock() {
                        s.visible = false;
                        s.dragging = false;
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("SCULPY failed to start");
}
