mod notes;
mod folders;
mod conversations;
mod config;
mod io;

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use rusqlite::Connection;

use crate::services::models::AppConfig;

pub struct Database {
    pub(crate) conn: Mutex<Connection>,
    pub(crate) data_dir: PathBuf,
}

impl Database {
    pub fn new() -> Self {
        let default_dir = Self::default_data_dir();
        fs::create_dir_all(&default_dir).ok();

        // Read config to get custom data dir
        let config_path = default_dir.join("config.json");
        let config: AppConfig = if config_path.exists() {
            fs::read_to_string(&config_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or(AppConfig { data_dir: String::new(), quick_width: 0.0, quick_height: 0.0, ai_base_url: String::new(), ai_api_key: String::new(), ai_model: String::new(), ai_profiles: Vec::new(), active_ai_profile_id: String::new() })
        } else {
            AppConfig { data_dir: String::new(), quick_width: 0.0, quick_height: 0.0, ai_base_url: String::new(), ai_api_key: String::new(), ai_model: String::new(), ai_profiles: Vec::new(), active_ai_profile_id: String::new() }
        };

        let data_dir = if config.data_dir.is_empty() {
            default_dir.clone()
        } else {
            PathBuf::from(&config.data_dir)
        };
        fs::create_dir_all(&data_dir).ok();

        let db_path = data_dir.join("kova.db");
        let conn = Connection::open(&db_path).expect("Failed to open database");

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL,
                note_type TEXT NOT NULL DEFAULT 'note',
                tags TEXT NOT NULL DEFAULT '[]',
                done INTEGER NOT NULL DEFAULT 0,
                due_date TEXT,
                folder_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(note_type);
            CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);

            CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                parent_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT '新对话',
                summary TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                tool_calls TEXT,
                tool_call_id TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);"
        ).expect("Failed to create tables");

        // Migrate: add title column if missing
        let has_title = conn.prepare("SELECT title FROM notes LIMIT 0").is_ok();
        if !has_title {
            let _ = conn.execute_batch("ALTER TABLE notes ADD COLUMN title TEXT NOT NULL DEFAULT ''");
        }

        // Migrate: add folder_id column if missing
        let has_folder_id = conn.prepare("SELECT folder_id FROM notes LIMIT 0").is_ok();
        if !has_folder_id {
            let _ = conn.execute_batch("ALTER TABLE notes ADD COLUMN folder_id TEXT");
        }

        // Create folder index (after migration ensures column exists)
        let _ = conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id)");

        // Migrate: add summary column to conversations if missing
        let has_summary = conn.prepare("SELECT summary FROM conversations LIMIT 0").is_ok();
        if !has_summary {
            let _ = conn.execute_batch("ALTER TABLE conversations ADD COLUMN summary TEXT NOT NULL DEFAULT ''");
        }

        // Migrate: add pinned column to conversations if missing
        let has_pinned = conn.prepare("SELECT pinned FROM conversations LIMIT 0").is_ok();
        if !has_pinned {
            let _ = conn.execute_batch("ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
        }

        Database { conn: Mutex::new(conn), data_dir }
    }

    pub fn default_data_dir() -> PathBuf {
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.join("data")))
            .unwrap_or_else(|| PathBuf::from("data"))
    }

    pub fn data_dir(&self) -> &PathBuf {
        &self.data_dir
    }

    pub fn quick_window_size(&self) -> (f64, f64) {
        let config = self.read_config();
        let w = if config.quick_width > 0.0 { config.quick_width } else { 320.0 };
        let h = if config.quick_height > 0.0 { config.quick_height } else { 360.0 };
        (w, h)
    }

    pub fn save_quick_window_size(&self, width: f64, height: f64) -> Result<(), String> {
        let mut config = self.read_config();
        config.quick_width = width;
        config.quick_height = height;
        self.save_config_file(&config)
    }

    pub fn set_data_dir(&self, new_dir: &str) -> Result<String, String> {
        let new_path = PathBuf::from(new_dir);
        fs::create_dir_all(&new_path).map_err(|e| format!("Cannot create directory: {}", e))?;

        // Move database file if it exists in old location
        let old_db = self.data_dir.join("kova.db");
        let new_db = new_path.join("kova.db");
        if old_db.exists() && old_db != new_db {
            fs::copy(&old_db, &new_db).map_err(|e| format!("Failed to copy database: {}", e))?;
            let _ = fs::remove_file(&old_db);
        }

        let mut config = self.read_config();
        config.data_dir = new_dir.to_string();
        self.save_config_file(&config)?;

        Ok(new_path.to_string_lossy().to_string())
    }

    pub fn backup(&self, dest_dir: &str) -> Result<String, String> {
        let src = self.data_dir.join("kova.db");
        if !src.exists() {
            return Err("数据库文件不存在".into());
        }

        let now = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        let zip_name = format!("kova-backup-{}.zip", now);
        let dest = PathBuf::from(dest_dir).join(&zip_name);
        let file = fs::File::create(&dest).map_err(|e| format!("创建备份文件失败: {}", e))?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        // Add database
        let db_data = fs::read(&src).map_err(|e| format!("读取数据库失败: {}", e))?;
        zip.start_file("kova.db", options).map_err(|e| e.to_string())?;
        zip.write_all(&db_data).map_err(|e| e.to_string())?;

        // Add config.json if exists
        let config_path = self.data_dir.join("config.json");
        if config_path.exists() {
            let config_data = fs::read(&config_path).map_err(|e| format!("读取配置失败: {}", e))?;
            zip.start_file("kova-config.json", options).map_err(|e| e.to_string())?;
            zip.write_all(&config_data).map_err(|e| e.to_string())?;
        }

        // Add localStorage settings if exists
        let settings_path = self.data_dir.join("kova-settings.json");
        if settings_path.exists() {
            let settings_data = fs::read(&settings_path).map_err(|e| format!("读取设置失败: {}", e))?;
            zip.start_file("kova-settings.json", options).map_err(|e| e.to_string())?;
            zip.write_all(&settings_data).map_err(|e| e.to_string())?;
        }

        zip.finish().map_err(|e| e.to_string())?;
        Ok(dest.to_string_lossy().to_string())
    }

    pub fn restore(&self, src_path: &str) -> Result<(), String> {
        let src = PathBuf::from(src_path);
        if !src.exists() {
            return Err("备份文件不存在".into());
        }

        if src.extension().map_or(false, |e| e == "zip") {
            // Restore from zip
            let file = fs::File::open(&src).map_err(|e| format!("打开备份文件失败: {}", e))?;
            let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("解析备份文件失败: {}", e))?;

            // Validate: must contain kova.db
            let has_db = archive.file_names().any(|n| n == "kova.db");
            if !has_db {
                return Err("备份文件无效：缺少数据库文件".into());
            }

            // Validate: kova.db must be a valid SQLite database
            {
                let mut db_entry = archive.by_name("kova.db").map_err(|e| e.to_string())?;
                let mut db_buf = Vec::new();
                std::io::Read::read_to_end(&mut db_entry, &mut db_buf).map_err(|e| e.to_string())?;

                // Write to temp file and validate
                let temp_path = self.data_dir.join("kova.db.tmp");
                fs::write(&temp_path, &db_buf).map_err(|e| e.to_string())?;
                let conn = Connection::open_with_flags(&temp_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                    .map_err(|_| "备份文件中的数据库无效".to_string())?;
                let table_check: String = conn
                    .query_row("SELECT name FROM sqlite_master WHERE type='table' AND name='notes'", [], |row| row.get(0))
                    .map_err(|_| "备份文件中的数据库结构不正确".to_string())?;
                if table_check != "notes" {
                    let _ = fs::remove_file(&temp_path);
                    return Err("备份文件中的数据库结构不正确".into());
                }
                drop(conn);
                // Release current connection to unlock the file on Windows
                {
                    let mut locked = self.conn.lock().map_err(|e| e.to_string())?;
                    let dummy = Connection::open_in_memory().map_err(|e| e.to_string())?;
                    let _old = std::mem::replace(&mut *locked, dummy);
                }
                // Valid, move to final location
                fs::rename(&temp_path, self.data_dir.join("kova.db")).map_err(|e| e.to_string())?;
                // Reopen with the restored database
                {
                    let new_conn = Connection::open(self.data_dir.join("kova.db")).map_err(|e| e.to_string())?;
                    let mut locked = self.conn.lock().map_err(|e| e.to_string())?;
                    let _old = std::mem::replace(&mut *locked, new_conn);
                }
            }

            // Restore optional files (config and settings)
            for i in 0..archive.len() {
                let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
                let entry_name = entry.name().to_string();

                match entry_name.as_str() {
                    "kova-config.json" => {
                        let mut buf = Vec::new();
                        std::io::Read::read_to_end(&mut entry, &mut buf).map_err(|e| e.to_string())?;
                        // Validate JSON
                        if serde_json::from_slice::<serde_json::Value>(&buf).is_ok() {
                            let dest = self.data_dir.join("config.json");
                            fs::write(&dest, &buf).map_err(|e| e.to_string())?;
                        }
                    }
                    "kova-settings.json" => {
                        let mut buf = Vec::new();
                        std::io::Read::read_to_end(&mut entry, &mut buf).map_err(|e| e.to_string())?;
                        // Validate JSON
                        if serde_json::from_slice::<serde_json::Value>(&buf).is_ok() {
                            let dest = self.data_dir.join("kova-settings.json");
                            fs::write(&dest, &buf).map_err(|e| e.to_string())?;
                        }
                    }
                    _ => {}
                }
            }
        } else {
            // Legacy: restore from individual files
            // Verify it's a valid SQLite database with the notes table
            {
                let conn = Connection::open_with_flags(&src, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                    .map_err(|_| "文件不是有效的数据库")?;
                let table_check: String = conn
                    .query_row("SELECT name FROM sqlite_master WHERE type='table' AND name='notes'", [], |row| row.get(0))
                    .map_err(|_| "数据库中没有找到笔记表")?;
                if table_check != "notes" {
                    return Err("数据库结构不正确".into());
                }
            }

            let dest = self.data_dir.join("kova.db");
            fs::copy(&src, &dest).map_err(|e| format!("恢复失败: {}", e))?;

            // Also restore config.json if it exists in the same directory
            let src_dir = src.parent().unwrap_or(&src);
            let config_src = src_dir.join("kova-config.json");
            if config_src.exists() {
                let config_dest = self.data_dir.join("config.json");
                fs::copy(&config_src, &config_dest).map_err(|e| format!("恢复配置失败: {}", e))?;
            }
        }

        Ok(())
    }
}

// Re-export for backward compatibility
pub use crate::services::models::*;
