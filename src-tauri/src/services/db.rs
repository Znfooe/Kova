use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub folder_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIProfile {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    #[serde(default)]
    pub system_prompt: String,
    #[serde(default)]
    pub max_context_messages: usize,
    #[serde(default)]
    pub enable_summary: bool,
    #[serde(default)]
    pub enable_thinking: bool,
    #[serde(default)]
    pub temperature: f32,
    #[serde(default)]
    pub max_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub data_dir: String,
    #[serde(default)]
    pub quick_width: f64,
    #[serde(default)]
    pub quick_height: f64,
    #[serde(default)]
    pub ai_base_url: String,
    #[serde(default)]
    pub ai_api_key: String,
    #[serde(default)]
    pub ai_model: String,
    #[serde(default)]
    pub ai_profiles: Vec<AIProfile>,
    #[serde(default)]
    pub active_ai_profile_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub summary: String,
    #[serde(default)]
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub tool_calls: Option<String>,
    pub tool_call_id: Option<String>,
    pub created_at: String,
}

pub struct Database {
    conn: Mutex<Connection>,
    data_dir: PathBuf,
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

    fn config_path() -> PathBuf {
        Self::default_data_dir().join("config.json")
    }

    fn read_config() -> AppConfig {
        let path = Self::config_path();
        if path.exists() {
            fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or(AppConfig { data_dir: String::new(), quick_width: 0.0, quick_height: 0.0, ai_base_url: String::new(), ai_api_key: String::new(), ai_model: String::new(), ai_profiles: Vec::new(), active_ai_profile_id: String::new() })
        } else {
            AppConfig { data_dir: String::new(), quick_width: 0.0, quick_height: 0.0, ai_base_url: String::new(), ai_api_key: String::new(), ai_model: String::new(), ai_profiles: Vec::new(), active_ai_profile_id: String::new() }
        }
    }

    fn save_config(config: &AppConfig) -> Result<(), String> {
        let path = Self::config_path();
        let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| e.to_string())
    }

    pub fn data_dir(&self) -> &PathBuf { &self.data_dir }

    pub fn quick_window_size(&self) -> (f64, f64) {
        let config = Self::read_config();
        let w = if config.quick_width > 0.0 { config.quick_width } else { 320.0 };
        let h = if config.quick_height > 0.0 { config.quick_height } else { 360.0 };
        (w, h)
    }

    pub fn save_quick_window_size(&self, width: f64, height: f64) -> Result<(), String> {
        let mut config = Self::read_config();
        config.quick_width = width;
        config.quick_height = height;
        Self::save_config(&config)
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

        let mut config = Self::read_config();
        config.data_dir = new_dir.to_string();
        Self::save_config(&config)?;

        Ok(new_path.to_string_lossy().to_string())
    }

    pub fn backup(&self, dest_dir: &str) -> Result<String, String> {
        let src = self.data_dir.join("kova.db");
        if !src.exists() {
            return Err("数据库文件不存在".into());
        }

        let now = Utc::now().format("%Y%m%d_%H%M%S");
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
                // Valid, move to final location
                // Release current connection to unlock the file on Windows
                {
                    let mut locked = self.conn.lock().map_err(|e| e.to_string())?;
                    let dummy = Connection::open_in_memory().map_err(|e| e.to_string())?;
                    let _old = std::mem::replace(&mut *locked, dummy);
                    // _old is dropped here, releasing the file lock
                }
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

    pub fn create_note(&self, title: &str, content: &str, tags: Vec<String>, folder_id: Option<String>) -> Result<Note, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            "INSERT INTO notes (id, title, content, tags, folder_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, title, content, tags_json, folder_id, now, now],
        ).map_err(|e| e.to_string())?;

        Ok(Note {
            id, title: title.to_string(), content: content.to_string(),
            tags, folder_id, created_at: now.clone(), updated_at: now,
        })
    }

    pub fn get_notes(&self, search: Option<&str>, folder_id: Option<&str>) -> Result<Vec<Note>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut sql = String::from("SELECT id, title, content, tags, folder_id, created_at, updated_at FROM notes WHERE 1=1");
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(s) = search {
            sql.push_str(" AND (title LIKE ? OR content LIKE ?)");
            param_values.push(Box::new(format!("%{}%", s)));
            param_values.push(Box::new(format!("%{}%", s)));
        }
        if let Some(f) = folder_id {
            if f.is_empty() {
                sql.push_str(" AND folder_id IS NULL");
            } else {
                sql.push_str(" AND folder_id = ?");
                param_values.push(Box::new(f.to_string()));
            }
        }
        sql.push_str(" ORDER BY updated_at DESC");

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
        let rows = stmt.query_map(params_refs.as_slice(), |row| {
            let tags_str: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                tags,
                folder_id: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut notes = Vec::new();
        for row in rows { notes.push(row.map_err(|e| e.to_string())?); }
        Ok(notes)
    }

    pub fn get_note(&self, id: &str) -> Result<Note, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT id, title, content, tags, folder_id, created_at, updated_at FROM notes WHERE id = ?1",
            params![id],
            |row| {
                let tags_str: String = row.get(3)?;
                let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
                Ok(Note {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: row.get(2)?,
                    tags,
                    folder_id: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            },
        ).map_err(|e| format!("笔记不存在: {}", e))
    }

    pub fn update_note(&self, id: &str, title: Option<&str>, content: Option<&str>, tags: Option<Vec<String>>, folder_id: Option<Option<&str>>) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();

        if let Some(t) = title {
            conn.execute("UPDATE notes SET title = ?1, updated_at = ?2 WHERE id = ?3", params![t, now, id]).map_err(|e| e.to_string())?;
        }
        if let Some(c) = content {
            conn.execute("UPDATE notes SET content = ?1, updated_at = ?2 WHERE id = ?3", params![c, now, id]).map_err(|e| e.to_string())?;
        }
        if let Some(tags) = tags {
            let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());
            conn.execute("UPDATE notes SET tags = ?1, updated_at = ?2 WHERE id = ?3", params![tags_json, now, id]).map_err(|e| e.to_string())?;
        }
        if let Some(f) = folder_id {
            conn.execute("UPDATE notes SET folder_id = ?1, updated_at = ?2 WHERE id = ?3", params![f, now, id]).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn delete_note(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM notes WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
        Ok(())
    }

    // Folder operations
    pub fn create_folder(&self, name: &str, parent_id: Option<&str>) -> Result<Folder, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        // Check for duplicate name under the same parent
        let count: i64 = if let Some(pid) = parent_id {
            conn.query_row(
                "SELECT COUNT(*) FROM folders WHERE name = ?1 AND parent_id = ?2",
                params![name, pid],
                |row| row.get(0),
            ).map_err(|e| e.to_string())?
        } else {
            conn.query_row(
                "SELECT COUNT(*) FROM folders WHERE name = ?1 AND parent_id IS NULL",
                params![name],
                |row| row.get(0),
            ).map_err(|e| e.to_string())?
        };
        if count > 0 {
            return Err("同级下已存在同名文件夹".to_string());
        }

        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO folders (id, name, parent_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, name, parent_id, now, now],
        ).map_err(|e| e.to_string())?;

        Ok(Folder {
            id, name: name.to_string(), parent_id: parent_id.map(|s| s.to_string()),
            created_at: now.clone(), updated_at: now,
        })
    }

    pub fn get_folders(&self) -> Result<Vec<Folder>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT id, name, parent_id, created_at, updated_at FROM folders ORDER BY name").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok(Folder {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut folders = Vec::new();
        for row in rows { folders.push(row.map_err(|e| e.to_string())?); }
        Ok(folders)
    }

    pub fn update_folder(&self, id: &str, name: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        conn.execute("UPDATE folders SET name = ?1, updated_at = ?2 WHERE id = ?3", params![name, now, id]).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_folder(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        // Move notes in this folder to root (no folder)
        conn.execute("UPDATE notes SET folder_id = NULL WHERE folder_id = ?1", params![id]).map_err(|e| e.to_string())?;
        // Move subfolders to root
        conn.execute("UPDATE folders SET parent_id = NULL WHERE parent_id = ?1", params![id]).map_err(|e| e.to_string())?;
        // Delete the folder
        conn.execute("DELETE FROM folders WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn import_md_file(&self, path: &str) -> Result<Note, String> {
        let content = fs::read_to_string(path).map_err(|e| format!("Failed to read file: {}", e))?;
        let (title, body) = if content.starts_with("# ") {
            let end = content.find('\n').unwrap_or(content.len());
            (content[2..end].trim().to_string(), content[end..].trim_start().to_string())
        } else {
            (String::new(), content)
        };
        self.create_note(&title, &body, vec![], None)
    }

    pub fn export_note_as_md(&self, id: &str, dest_dir: &str) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let (title, content): (String, String) = conn.query_row(
            "SELECT title, content FROM notes WHERE id = ?1", params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|e| format!("Note not found: {}", e))?;

        let full_content = if title.is_empty() { content } else { format!("# {}\n\n{}", title, content) };
        let safe_name: String = (if title.is_empty() { "note" } else { &title })
            .chars().take(40).filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_')
            .collect::<String>().trim().to_string();
        let safe_name = if safe_name.is_empty() { "note".to_string() } else { safe_name };

        let dest = PathBuf::from(dest_dir);
        fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
        let file_path = dest.join(format!("{}_{}.md", Uuid::new_v4(), safe_name));
        fs::write(&file_path, &full_content).map_err(|e| e.to_string())?;
        Ok(file_path.to_string_lossy().to_string())
    }

    pub fn export_note_as_html(&self, id: &str, dest_dir: &str) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let (title, content, created_at, updated_at): (String, String, String, String) = conn.query_row(
            "SELECT title, content, created_at, updated_at FROM notes WHERE id = ?1", params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        ).map_err(|e| format!("Note not found: {}", e))?;

        use pulldown_cmark::{Parser, Options, html};
        let mut options = Options::empty();
        options.insert(Options::ENABLE_TABLES);
        options.insert(Options::ENABLE_STRIKETHROUGH);
        options.insert(Options::ENABLE_TASKLISTS);
        let parser = Parser::new_ext(&content, options);
        let mut html_content = String::new();
        html::push_html(&mut html_content, parser);

        let display_title = if title.is_empty() { "无标题笔记" } else { &title };
        let html_doc = format!(
            r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #333; line-height: 1.7; }}
h1 {{ border-bottom: 2px solid #eee; padding-bottom: 10px; }}
h2, h3, h4 {{ margin-top: 1.5em; }}
code {{ background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }}
pre {{ background: #f5f5f5; padding: 16px; border-radius: 6px; overflow-x: auto; }}
pre code {{ background: none; padding: 0; }}
blockquote {{ border-left: 4px solid #ddd; margin: 0; padding: 10px 20px; color: #666; }}
table {{ border-collapse: collapse; width: 100%; }}
th, td {{ border: 1px solid #ddd; padding: 8px 12px; text-align: left; }}
th {{ background: #f5f5f5; }}
img {{ max-width: 100%; }}
hr {{ border: none; border-top: 1px solid #eee; margin: 2em 0; }}
.meta {{ color: #999; font-size: 0.85em; margin-bottom: 2em; }}
</style>
</head>
<body>
<h1>{title}</h1>
<div class="meta">创建时间：{created_at} | 更新时间：{updated_at}</div>
{content}
</body>
</html>"#,
            title = display_title,
            created_at = created_at,
            updated_at = updated_at,
            content = html_content,
        );

        let safe_name: String = display_title
            .chars().take(40).filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_')
            .collect::<String>().trim().to_string();
        let safe_name = if safe_name.is_empty() { "note".to_string() } else { safe_name };

        let dest = PathBuf::from(dest_dir);
        fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
        let file_path = dest.join(format!("{}_{}.html", Uuid::new_v4(), safe_name));
        fs::write(&file_path, &html_doc).map_err(|e| e.to_string())?;
        Ok(file_path.to_string_lossy().to_string())
    }

    pub fn import_html_file(&self, path: &str) -> Result<Note, String> {
        let html_content = fs::read_to_string(path).map_err(|e| format!("Failed to read file: {}", e))?;
        // Simple HTML to text: strip tags
        let mut text = String::new();
        let mut in_tag = false;
        let mut in_script_style = false;
        for ch in html_content.chars() {
            match ch {
                '<' => {
                    in_tag = true;
                    // Check for script/style tags
                    let rest = &html_content[html_content.len() - html_content.len()..]; // not useful
                    if html_content.contains("<script") || html_content.contains("<style") {
                        in_script_style = true;
                    }
                }
                '>' => {
                    in_tag = false;
                    if html_content.contains("</script>") || html_content.contains("</style>") {
                        in_script_style = false;
                    }
                }
                _ if !in_tag && !in_script_style => text.push(ch),
                _ => {}
            }
        }
        // Extract title from <title> tag or first line
        let title = if let Some(start) = html_content.find("<title>") {
            let start = start + 7;
            if let Some(end) = html_content[start..].find("</title>") {
                html_content[start..start + end].trim().to_string()
            } else {
                String::new()
            }
        } else {
            text.lines().next().unwrap_or("").trim().to_string()
        };
        let body = text.trim().to_string();
        self.create_note(&title, &body, vec![], None)
    }

    pub fn export_note_as_txt(&self, id: &str, dest_dir: &str) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let (title, content): (String, String) = conn.query_row(
            "SELECT title, content FROM notes WHERE id = ?1", params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|e| format!("Note not found: {}", e))?;

        let full_content = if title.is_empty() { content } else { format!("{}\n\n{}", title, content) };
        let safe_name: String = (if title.is_empty() { "note" } else { &title })
            .chars().take(40).filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_')
            .collect::<String>().trim().to_string();
        let safe_name = if safe_name.is_empty() { "note".to_string() } else { safe_name };

        let dest = PathBuf::from(dest_dir);
        fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
        let file_path = dest.join(format!("{}_{}.txt", Uuid::new_v4(), safe_name));
        fs::write(&file_path, &full_content).map_err(|e| e.to_string())?;
        Ok(file_path.to_string_lossy().to_string())
    }

    // ---- AI config ----

    pub fn get_ai_config(&self) -> (String, String, String) {
        let config = Self::read_config();
        (config.ai_base_url, config.ai_api_key, config.ai_model)
    }

    pub fn save_ai_config(&self, base_url: &str, api_key: &str, model: &str) -> Result<(), String> {
        let mut config = Self::read_config();
        config.ai_base_url = base_url.to_string();
        config.ai_api_key = api_key.to_string();
        config.ai_model = model.to_string();
        Self::save_config(&config)
    }

    pub fn get_ai_profiles(&self) -> Vec<AIProfile> {
        let config = Self::read_config();
        config.ai_profiles
    }

    pub fn get_active_ai_profile(&self) -> Option<AIProfile> {
        let config = Self::read_config();
        if config.active_ai_profile_id.is_empty() {
            return None;
        }
        config.ai_profiles.iter().find(|p| p.id == config.active_ai_profile_id).cloned()
    }

    pub fn save_ai_profile(&self, profile: &AIProfile) -> Result<(), String> {
        let mut config = Self::read_config();
        if let Some(existing) = config.ai_profiles.iter_mut().find(|p| p.id == profile.id) {
            *existing = profile.clone();
        } else {
            config.ai_profiles.push(profile.clone());
        }
        Self::save_config(&config)
    }

    pub fn delete_ai_profile(&self, id: &str) -> Result<(), String> {
        let mut config = Self::read_config();
        config.ai_profiles.retain(|p| p.id != id);
        if config.active_ai_profile_id == id {
            config.active_ai_profile_id = String::new();
        }
        Self::save_config(&config)
    }

    pub fn set_active_ai_profile(&self, id: &str) -> Result<(), String> {
        let mut config = Self::read_config();
        config.active_ai_profile_id = id.to_string();
        Self::save_config(&config)
    }

    // ---- Conversations ----

    pub fn create_conversation(&self, title: Option<&str>) -> Result<Conversation, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let title = title.unwrap_or("新对话");

        conn.execute(
            "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, title, now, now],
        ).map_err(|e| e.to_string())?;

        Ok(Conversation { id, title: title.to_string(), summary: String::new(), pinned: false, created_at: now.clone(), updated_at: now })
    }

    pub fn get_conversations(&self) -> Result<Vec<Conversation>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT id, title, summary, pinned, created_at, updated_at FROM conversations ORDER BY pinned DESC, updated_at DESC").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok(Conversation {
                id: row.get(0)?,
                title: row.get(1)?,
                summary: row.get(2)?,
                pinned: row.get::<_, i32>(3)? != 0,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut convs = Vec::new();
        for row in rows { convs.push(row.map_err(|e| e.to_string())?); }
        Ok(convs)
    }

    pub fn update_conversation_title(&self, id: &str, title: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        conn.execute("UPDATE conversations SET title = ?1, updated_at = ?2 WHERE id = ?3", params![title, now, id]).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_conversation_summary(&self, id: &str, summary: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        conn.execute("UPDATE conversations SET summary = ?1, updated_at = ?2 WHERE id = ?3", params![summary, now, id]).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_conversation(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM messages WHERE conversation_id = ?1", params![id]).map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM conversations WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn toggle_conversation_pinned(&self, id: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let current: i32 = conn.query_row("SELECT pinned FROM conversations WHERE id = ?1", params![id], |row| row.get(0))
            .map_err(|e| format!("对话不存在: {}", e))?;
        let new_val = if current == 0 { 1 } else { 0 };
        conn.execute("UPDATE conversations SET pinned = ?1 WHERE id = ?2", params![new_val, id]).map_err(|e| e.to_string())?;
        Ok(new_val != 0)
    }

    // ---- Messages ----

    pub fn add_message(&self, conversation_id: &str, role: &str, content: &str, tool_calls: Option<&str>, tool_call_id: Option<&str>) -> Result<ChatMessage, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, tool_calls, tool_call_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, conversation_id, role, content, tool_calls, tool_call_id, now],
        ).map_err(|e| e.to_string())?;

        // Update conversation timestamp
        conn.execute("UPDATE conversations SET updated_at = ?1 WHERE id = ?2", params![now, conversation_id]).map_err(|e| e.to_string())?;

        Ok(ChatMessage {
            id, conversation_id: conversation_id.to_string(),
            role: role.to_string(), content: content.to_string(),
            tool_calls: tool_calls.map(|s| s.to_string()),
            tool_call_id: tool_call_id.map(|s| s.to_string()),
            created_at: now,
        })
    }

    pub fn get_messages(&self, conversation_id: &str) -> Result<Vec<ChatMessage>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, conversation_id, role, content, tool_calls, tool_call_id, created_at FROM messages WHERE conversation_id = ?1 ORDER BY created_at"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map(params![conversation_id], |row| {
            Ok(ChatMessage {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                tool_calls: row.get(4)?,
                tool_call_id: row.get(5)?,
                created_at: row.get(6)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut msgs = Vec::new();
        for row in rows { msgs.push(row.map_err(|e| e.to_string())?); }
        Ok(msgs)
    }
}
