use chrono::Utc;
use rusqlite::params;
use uuid::Uuid;

use super::Database;
use crate::services::models::{Conversation, ChatMessage};

impl Database {
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

    pub fn toggle_conversation_pinned(&self, id: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let current: i32 = conn.query_row("SELECT pinned FROM conversations WHERE id = ?1", params![id], |row| row.get(0))
            .map_err(|e| format!("对话不存在: {}", e))?;
        let new_val = if current == 0 { 1 } else { 0 };
        conn.execute("UPDATE conversations SET pinned = ?1 WHERE id = ?2", params![new_val, id]).map_err(|e| e.to_string())?;
        Ok(new_val != 0)
    }

    pub fn delete_conversation(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM messages WHERE conversation_id = ?1", params![id]).map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM conversations WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
        Ok(())
    }

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
