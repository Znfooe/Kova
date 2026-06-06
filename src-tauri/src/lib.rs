mod services;

use services::db::Database;
use services::models::{Note, Folder, Conversation, ChatMessage};
use services::ai::AiService;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::OnceLock;
use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconEvent;
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
use windows::Win32::UI::HiDpi::GetDpiForSystem;
use windows::Win32::Foundation::POINT;

static DB: OnceLock<Database> = OnceLock::new();
static AI: OnceLock<AiService> = OnceLock::new();
static QUICK_ID: AtomicU32 = AtomicU32::new(0);

fn get_cursor_logical() -> Result<(f64, f64), String> {
    let mut point = POINT { x: 0, y: 0 };
    unsafe { GetCursorPos(&mut point).map_err(|e| e.to_string())? };
    let dpi = unsafe { GetDpiForSystem() } as f64;
    let scale = dpi / 96.0;
    Ok((point.x as f64 / scale, point.y as f64 / scale))
}

fn db() -> &'static Database {
    DB.get_or_init(|| Database::new())
}

fn ai() -> &'static AiService {
    AI.get_or_init(|| AiService::new())
}

#[tauri::command]
fn create_note(title: String, content: String, tags: Vec<String>, folder_id: Option<String>) -> Result<Note, String> {
    // Empty string from frontend means "uncategorized" → store as NULL
    let fid = folder_id.filter(|s| !s.is_empty());
    db().create_note(&title, &content, tags, fid)
}

#[tauri::command]
fn get_notes(search: Option<String>, folder_id: Option<String>) -> Result<Vec<Note>, String> {
    db().get_notes(search.as_deref(), folder_id.as_deref())
}

#[tauri::command]
fn update_note(id: String, title: Option<String>, content: Option<String>, tags: Option<Vec<String>>, folder_id: Option<String>) -> Result<(), String> {
    // Only update folder_id if explicitly provided; None means "don't touch"
    let folder_update = if folder_id.is_some() { Some(folder_id.as_deref()) } else { None };
    db().update_note(&id, title.as_deref(), content.as_deref(), tags, folder_update)
}

#[tauri::command]
fn delete_note(id: String) -> Result<(), String> {
    db().delete_note(&id)
}

#[tauri::command]
fn create_folder(name: String, parent_id: Option<String>) -> Result<Folder, String> {
    db().create_folder(&name, parent_id.as_deref())
}

#[tauri::command]
fn get_folders() -> Result<Vec<Folder>, String> {
    db().get_folders()
}

#[tauri::command]
fn update_folder(id: String, name: String) -> Result<(), String> {
    db().update_folder(&id, &name)
}

#[tauri::command]
fn delete_folder(id: String) -> Result<(), String> {
    db().delete_folder(&id)
}

#[tauri::command]
fn move_note_to_folder(id: String, folder_id: Option<String>) -> Result<(), String> {
    db().update_note(&id, None, None, None, Some(folder_id.as_deref()))
}

#[tauri::command]
fn get_data_dir() -> String {
    db().data_dir().to_string_lossy().to_string()
}

#[tauri::command]
fn set_data_dir(new_dir: String) -> Result<String, String> {
    db().set_data_dir(&new_dir)
}

#[tauri::command]
fn import_md_file(path: String) -> Result<Note, String> {
    db().import_md_file(&path)
}

#[tauri::command]
fn import_file(path: String) -> Result<Note, String> {
    if path.ends_with(".html") || path.ends_with(".htm") {
        db().import_html_file(&path)
    } else {
        db().import_md_file(&path)
    }
}

#[tauri::command]
fn export_note(id: String, dest_dir: String) -> Result<String, String> {
    db().export_note_as_md(&id, &dest_dir)
}

#[tauri::command]
fn export_note_html(id: String, dest_dir: String) -> Result<String, String> {
    db().export_note_as_html(&id, &dest_dir)
}

#[tauri::command]
fn export_note_txt(id: String, dest_dir: String) -> Result<String, String> {
    db().export_note_as_txt(&id, &dest_dir)
}

#[tauri::command]
fn backup_data(dest_dir: String) -> Result<String, String> {
    db().backup(&dest_dir)
}

#[tauri::command]
fn restore_data(src_path: String) -> Result<(), String> {
    db().restore(&src_path)
}

#[tauri::command]
fn abort_ai() {
    services::ai::abort_ai();
}

#[tauri::command]
fn toggle_conversation_pinned(id: String) -> Result<bool, String> {
    db().toggle_conversation_pinned(&id)
}

#[tauri::command]
fn export_conversation(id: String, dest_dir: String) -> Result<String, String> {
    let conv = db().get_conversations()?.into_iter().find(|c| c.id == id).ok_or("对话不存在")?;
    let messages = db().get_messages(&id)?;
    let mut md = format!("# {}\n\n", conv.title);
    for msg in &messages {
        let role = match msg.role.as_str() {
            "user" => "👤 用户",
            "assistant" => "🤖 AI",
            _ => continue,
        };
        md.push_str(&format!("**{}**\n\n{}\n\n---\n\n", role, msg.content));
    }
    let safe_name: String = conv.title.chars().take(40).filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_').collect();
    let file_name = format!("{}_{}.md", &conv.id[..8], if safe_name.is_empty() { "conversation" } else { &safe_name });
    let path = std::path::PathBuf::from(&dest_dir).join(&file_name);
    std::fs::write(&path, &md).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn copy_file(src: String, dest: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&dest).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn download_font(url: String, dest: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&dest).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_cursor_position() -> Result<(f64, f64), String> {
    get_cursor_logical()
}

#[tauri::command]
fn get_window_size(window: tauri::WebviewWindow) -> Result<(f64, f64), String> {
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().unwrap_or(1.0);
    Ok((size.width as f64 / scale, size.height as f64 / scale))
}

#[tauri::command]
fn save_quick_window_size(width: f64, height: f64) -> Result<(), String> {
    db().save_quick_window_size(width, height)
}

#[tauri::command]
fn create_quick_window(app: tauri::AppHandle) -> Result<(), String> {
    let (w, h) = db().quick_window_size();
    let (x, y) = {
        let (cx, cy) = get_cursor_logical()?;
        (cx - w / 2.0, cy - h / 2.0)
    };
    let id = QUICK_ID.fetch_add(1, Ordering::Relaxed);
    let label = format!("quick-{}", id);
    let _win = tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App("quick.html".into()),
    )
    .title("便签")
    .position(x, y)
    .inner_size(w, h)
    .min_inner_size(260.0, 250.0)
    .decorations(false)
    .transparent(true)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .visible(false)
    .skip_taskbar(true)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn toggle_window(window: tauri::Window) -> Result<(), String> {
    if window.is_visible().unwrap_or(false) {
        window.hide().map_err(|e| e.to_string())?;
    } else {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

static WINDOW_SHOWN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[tauri::command]
fn mark_window_shown() {
    WINDOW_SHOWN.store(true, std::sync::atomic::Ordering::Relaxed);
}

// ---- AI commands ----

#[tauri::command]
async fn ai_chat(conversation_id: String, message: String, base_url: String, api_key: String, model: String, system_prompt: String) -> Result<ChatMessage, String> {
    let _reply = ai().chat(db(), &conversation_id, &message, &base_url, &api_key, &model, &system_prompt, true).await?;
    let messages = db().get_messages(&conversation_id)?;
    messages.into_iter().rev().find(|m| m.role == "assistant")
        .ok_or_else(|| "未找到助手回复".to_string())
}

#[tauri::command]
async fn ai_chat_stream(
    app: tauri::AppHandle,
    conversation_id: String,
    message: String,
    base_url: String,
    api_key: String,
    model: String,
    system_prompt: String,
    max_context_messages: usize,
    enable_summary: bool,
    enable_thinking: bool,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
) -> Result<ChatMessage, String> {
    use tauri::Emitter;

    // Get conversation summary
    let conversations = db().get_conversations()?;
    let conv_summary = conversations.iter()
        .find(|c| c.id == conversation_id)
        .map(|c| c.summary.clone())
        .unwrap_or_default();

    let conv_id = conversation_id.clone();
    let _reply = ai().chat_stream(
        db(), &conversation_id, &message, &base_url, &api_key, &model,
        &system_prompt, max_context_messages, enable_summary, &conv_summary, enable_thinking,
        temperature, max_tokens,
        move |event_type, data| {
            let _ = app.emit("ai-stream", serde_json::json!({
                "type": event_type,
                "data": data,
                "conversation_id": conv_id,
            }));
        },
    ).await?;

    // Generate summary if enabled and enough messages
    if enable_summary {
        let messages = db().get_messages(&conversation_id)?;
        if messages.len() >= 10 {
            let summary_prompt = "请用2-3句话总结以下对话的要点，作为后续对话的参考上下文。只输出总结内容，不要加任何前缀或标题。";
            let conv_history: Vec<String> = messages.iter().take(messages.len().saturating_sub(2))
                .filter(|m| m.role == "user" || m.role == "assistant")
                .map(|m| format!("{}: {}", m.role, m.content.chars().take(100).collect::<String>()))
                .collect();
            let summary_input = format!("{}\n\n对话内容：\n{}", summary_prompt, conv_history.join("\n"));

            match ai().chat(db(), &conversation_id, &summary_input, &base_url, &api_key, &model, "", false).await {
                Ok(summary_reply) => {
                    let _ = db().update_conversation_summary(&conversation_id, &summary_reply);
                    log::info!("[AI] Updated conversation summary for: {}", conversation_id);
                }
                Err(e) => {
                    log::warn!("[AI] Failed to generate summary: {}", e);
                }
            }
        }
    }

    let messages = db().get_messages(&conversation_id)?;
    messages.into_iter().rev().find(|m| m.role == "assistant")
        .ok_or_else(|| "未找到助手回复".to_string())
}

#[tauri::command]
fn create_conversation(title: Option<String>) -> Result<Conversation, String> {
    db().create_conversation(title.as_deref())
}

#[tauri::command]
fn get_conversations() -> Result<Vec<Conversation>, String> {
    db().get_conversations()
}

#[tauri::command]
fn update_conversation_title(id: String, title: String) -> Result<(), String> {
    db().update_conversation_title(&id, &title)
}

#[tauri::command]
fn delete_conversation(id: String) -> Result<(), String> {
    db().delete_conversation(&id)
}

#[tauri::command]
fn get_messages(conversation_id: String) -> Result<Vec<ChatMessage>, String> {
    db().get_messages(&conversation_id)
}

#[tauri::command]
fn get_ai_config() -> (String, String, String) {
    db().get_ai_config()
}

#[tauri::command]
fn save_ai_config(base_url: String, api_key: String, model: String) -> Result<(), String> {
    db().save_ai_config(&base_url, &api_key, &model)
}

#[tauri::command]
fn get_ai_profiles() -> Vec<services::db::AIProfile> {
    db().get_ai_profiles()
}

#[tauri::command]
fn get_active_ai_profile() -> Option<services::db::AIProfile> {
    db().get_active_ai_profile()
}

#[tauri::command]
fn save_ai_profile(profile: services::db::AIProfile) -> Result<(), String> {
    db().save_ai_profile(&profile)
}

#[tauri::command]
fn delete_ai_profile(id: String) -> Result<(), String> {
    db().delete_ai_profile(&id)
}

#[tauri::command]
fn set_active_ai_profile(id: String) -> Result<(), String> {
    db().set_active_ai_profile(&id)
}

#[tauri::command]
fn update_quick_shortcut(app: tauri::AppHandle, shortcut: String) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    // Unregister old shortcut
    let _ = app.global_shortcut().unregister_all();
    // Parse and register new shortcut
    let parts: Vec<&str> = shortcut.split('+').collect();
    let mut modifiers = tauri_plugin_global_shortcut::Modifiers::empty();
    let mut key = None;
    for part in &parts {
        match *part {
            "Ctrl" => modifiers |= tauri_plugin_global_shortcut::Modifiers::CONTROL,
            "Shift" => modifiers |= tauri_plugin_global_shortcut::Modifiers::SHIFT,
            "Alt" => modifiers |= tauri_plugin_global_shortcut::Modifiers::ALT,
            k => {
                let code = match k.to_uppercase().as_str() {
                    "A" => tauri_plugin_global_shortcut::Code::KeyA,
                    "B" => tauri_plugin_global_shortcut::Code::KeyB,
                    "C" => tauri_plugin_global_shortcut::Code::KeyC,
                    "D" => tauri_plugin_global_shortcut::Code::KeyD,
                    "E" => tauri_plugin_global_shortcut::Code::KeyE,
                    "F" => tauri_plugin_global_shortcut::Code::KeyF,
                    "G" => tauri_plugin_global_shortcut::Code::KeyG,
                    "H" => tauri_plugin_global_shortcut::Code::KeyH,
                    "I" => tauri_plugin_global_shortcut::Code::KeyI,
                    "J" => tauri_plugin_global_shortcut::Code::KeyJ,
                    "K" => tauri_plugin_global_shortcut::Code::KeyK,
                    "L" => tauri_plugin_global_shortcut::Code::KeyL,
                    "M" => tauri_plugin_global_shortcut::Code::KeyM,
                    "N" => tauri_plugin_global_shortcut::Code::KeyN,
                    "O" => tauri_plugin_global_shortcut::Code::KeyO,
                    "P" => tauri_plugin_global_shortcut::Code::KeyP,
                    "Q" => tauri_plugin_global_shortcut::Code::KeyQ,
                    "R" => tauri_plugin_global_shortcut::Code::KeyR,
                    "S" => tauri_plugin_global_shortcut::Code::KeyS,
                    "T" => tauri_plugin_global_shortcut::Code::KeyT,
                    "U" => tauri_plugin_global_shortcut::Code::KeyU,
                    "V" => tauri_plugin_global_shortcut::Code::KeyV,
                    "W" => tauri_plugin_global_shortcut::Code::KeyW,
                    "X" => tauri_plugin_global_shortcut::Code::KeyX,
                    "Y" => tauri_plugin_global_shortcut::Code::KeyY,
                    "Z" => tauri_plugin_global_shortcut::Code::KeyZ,
                    "0" => tauri_plugin_global_shortcut::Code::Digit0,
                    "1" => tauri_plugin_global_shortcut::Code::Digit1,
                    "2" => tauri_plugin_global_shortcut::Code::Digit2,
                    "3" => tauri_plugin_global_shortcut::Code::Digit3,
                    "4" => tauri_plugin_global_shortcut::Code::Digit4,
                    "5" => tauri_plugin_global_shortcut::Code::Digit5,
                    "6" => tauri_plugin_global_shortcut::Code::Digit6,
                    "7" => tauri_plugin_global_shortcut::Code::Digit7,
                    "8" => tauri_plugin_global_shortcut::Code::Digit8,
                    "9" => tauri_plugin_global_shortcut::Code::Digit9,
                    "SPACE" => tauri_plugin_global_shortcut::Code::Space,
                    _ => return Err(format!("不支持的按键: {}", k)),
                };
                key = Some(code);
            }
        }
    }
    let key = key.ok_or("缺少按键")?;
    let sc = tauri_plugin_global_shortcut::Shortcut::new(Some(modifiers), key);
    app.global_shortcut().on_shortcut(sc, move |app, _shortcut, event| {
        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
            let _ = create_quick_window(app.clone());
        }
    }).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            // 窗口显示由前端在 restoreWindowSize() 完成后调用
            // 避免窗口先以默认位置显示再居中的闪烁
            // 安全网：如果前端 3 秒内没显示窗口，Rust 端强制显示
            if let Some(window) = app.get_webview_window("main") {
                let win = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(3));
                    // 只有窗口从未显示过才触发
                    if !WINDOW_SHOWN.load(std::sync::atomic::Ordering::Relaxed) {
                        WINDOW_SHOWN.store(true, std::sync::atomic::Ordering::Relaxed);
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                });
            }

            // Setup tray menu
            let open_item = MenuItem::with_id(app, "open", "打开主窗口", true, None::<&str>)?;
            let quick_item = MenuItem::with_id(app, "quick", "新建便签", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &quick_item, &quit_item])?;

            if let Some(tray) = app.tray_by_id("main-tray") {
                tray.set_menu(Some(menu))?;
                tray.set_show_menu_on_left_click(false)?;
                tray.on_menu_event(move |app, event| {
                    match event.id.as_ref() {
                        "open" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quick" => {
                            let _ = create_quick_window(app.clone());
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                });
                tray.on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, button_state: tauri::tray::MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_minimized().unwrap_or(false) || !window.is_visible().unwrap_or(true) {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            } else {
                                let _ = window.minimize();
                            }
                        }
                    }
                });
            }

            // Register global shortcut for quick note
            use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyN);
            app.global_shortcut().on_shortcut(shortcut, move |app, _shortcut, event| {
                if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    let (x, y) = match get_cursor_logical() {
                        Ok((cx, cy)) => (cx - 160.0, cy - 180.0),
                        Err(_) => return,
                    };
                    let id = QUICK_ID.fetch_add(1, Ordering::Relaxed);
                    let label = format!("quick-{}", id);
                    let _ = tauri::WebviewWindowBuilder::new(
                        app,
                        &label,
                        tauri::WebviewUrl::App("quick.html".into()),
                    )
                    .title("便签")
                    .position(x, y)
                    .inner_size(320.0, 360.0)
                    .min_inner_size(260.0, 250.0)
                    .decorations(false)
                    .transparent(true)
                    .shadow(false)
                    .always_on_top(true)
                    .visible(false)
                    .skip_taskbar(true)
                    .build();
                }
            }).map_err(|e| e.to_string())?;
            #[cfg(debug_assertions)]
            {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_note, get_notes, update_note, delete_note,
            create_folder, get_folders, update_folder, delete_folder, move_note_to_folder,
            get_data_dir, set_data_dir, import_md_file, import_file, export_note, export_note_html, export_note_txt,
            backup_data, restore_data, abort_ai, toggle_conversation_pinned, export_conversation, write_file, read_file, copy_file, download_font, get_window_size, save_quick_window_size,
            toggle_window, get_cursor_position, create_quick_window, update_quick_shortcut,
            ai_chat, ai_chat_stream, create_conversation, get_conversations, update_conversation_title, delete_conversation,
            get_messages, get_ai_config, save_ai_config,
            get_ai_profiles, get_active_ai_profile, save_ai_profile, delete_ai_profile, set_active_ai_profile,
            mark_window_shown,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Kova");
}
