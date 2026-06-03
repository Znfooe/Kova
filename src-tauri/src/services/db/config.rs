use super::Database;
use crate::services::models::{AIProfile, AppConfig};

impl Database {
    fn config_path(&self) -> std::path::PathBuf {
        self.data_dir.join("config.json")
    }

    pub(crate) fn read_config(&self) -> AppConfig {
        let path = self.config_path();
        if path.exists() {
            std::fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or(AppConfig { data_dir: String::new(), quick_width: 0.0, quick_height: 0.0, ai_base_url: String::new(), ai_api_key: String::new(), ai_model: String::new(), ai_profiles: Vec::new(), active_ai_profile_id: String::new() })
        } else {
            AppConfig { data_dir: String::new(), quick_width: 0.0, quick_height: 0.0, ai_base_url: String::new(), ai_api_key: String::new(), ai_model: String::new(), ai_profiles: Vec::new(), active_ai_profile_id: String::new() }
        }
    }

    pub(crate) fn save_config_file(&self, config: &AppConfig) -> Result<(), String> {
        let path = self.config_path();
        let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
        std::fs::write(&path, json).map_err(|e| e.to_string())
    }

    pub fn get_ai_config(&self) -> (String, String, String) {
        let config = self.read_config();
        (config.ai_base_url, config.ai_api_key, config.ai_model)
    }

    pub fn save_ai_config(&self, base_url: &str, api_key: &str, model: &str) -> Result<(), String> {
        let mut config = self.read_config();
        config.ai_base_url = base_url.to_string();
        config.ai_api_key = api_key.to_string();
        config.ai_model = model.to_string();
        self.save_config_file(&config)
    }

    pub fn get_ai_profiles(&self) -> Vec<AIProfile> {
        self.read_config().ai_profiles
    }

    pub fn get_active_ai_profile(&self) -> Option<AIProfile> {
        let config = self.read_config();
        if config.active_ai_profile_id.is_empty() {
            return None;
        }
        config.ai_profiles.iter().find(|p| p.id == config.active_ai_profile_id).cloned()
    }

    pub fn save_ai_profile(&self, profile: &AIProfile) -> Result<(), String> {
        let mut config = self.read_config();
        if let Some(existing) = config.ai_profiles.iter_mut().find(|p| p.id == profile.id) {
            *existing = profile.clone();
        } else {
            config.ai_profiles.push(profile.clone());
        }
        self.save_config_file(&config)
    }

    pub fn delete_ai_profile(&self, id: &str) -> Result<(), String> {
        let mut config = self.read_config();
        config.ai_profiles.retain(|p| p.id != id);
        if config.active_ai_profile_id == id {
            config.active_ai_profile_id = String::new();
        }
        self.save_config_file(&config)
    }

    pub fn set_active_ai_profile(&self, id: &str) -> Result<(), String> {
        let mut config = self.read_config();
        config.active_ai_profile_id = id.to_string();
        self.save_config_file(&config)
    }
}
