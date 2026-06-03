use serde::{Deserialize, Serialize};

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
