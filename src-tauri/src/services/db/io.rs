use std::fs;
use std::path::PathBuf;
use rusqlite::params;
use uuid::Uuid;

use super::Database;
use crate::services::models::Note;

impl Database {
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

    pub fn export_note_as_md(&self, id: &str, dest_dir: &str) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let (title, content): (String, String) = conn.query_row(
            "SELECT title, content FROM notes WHERE id = ?1", params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|e| format!("Note not found: {}", e))?;

        let full_content = if title.is_empty() { content } else { format!("# {}\n\n{}", title, content) };
        let safe_name = Self::safe_filename(&title);

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

        let safe_name = Self::safe_filename(display_title);
        let dest = PathBuf::from(dest_dir);
        fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
        let file_path = dest.join(format!("{}_{}.html", Uuid::new_v4(), safe_name));
        fs::write(&file_path, &html_doc).map_err(|e| e.to_string())?;
        Ok(file_path.to_string_lossy().to_string())
    }

    pub fn export_note_as_txt(&self, id: &str, dest_dir: &str) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let (title, content): (String, String) = conn.query_row(
            "SELECT title, content FROM notes WHERE id = ?1", params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|e| format!("Note not found: {}", e))?;

        let full_content = if title.is_empty() { content } else { format!("{}\n\n{}", title, content) };
        let safe_name = Self::safe_filename(&title);

        let dest = PathBuf::from(dest_dir);
        fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
        let file_path = dest.join(format!("{}_{}.txt", Uuid::new_v4(), safe_name));
        fs::write(&file_path, &full_content).map_err(|e| e.to_string())?;
        Ok(file_path.to_string_lossy().to_string())
    }

    fn safe_filename(title: &str) -> String {
        let name = if title.is_empty() { "note" } else { title };
        let safe: String = name.chars().take(40).filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_').collect();
        let safe = safe.trim().to_string();
        if safe.is_empty() { "note".to_string() } else { safe }
    }
}
