use chrono::Utc;
use rusqlite::params;
use uuid::Uuid;

use super::Database;
use crate::services::models::Folder;

impl Database {
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
}
