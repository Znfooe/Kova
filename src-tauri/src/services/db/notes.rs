use chrono::Utc;
use rusqlite::params;
use uuid::Uuid;

use super::Database;
use crate::services::models::Note;

impl Database {
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
}
