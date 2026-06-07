use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::LazyLock;
use super::db::Database;

// Global abort flag for stopping AI generation
static ABORT_FLAG: LazyLock<AtomicBool> = LazyLock::new(|| AtomicBool::new(false));

// ---- OpenAI-compatible API types ----

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ApiMessage>,
    pub tools: Option<Vec<ToolDefinition>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enable_thinking: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct StreamChunk {
    pub choices: Vec<StreamChoice>,
}

#[derive(Debug, Deserialize)]
pub struct StreamChoice {
    pub delta: StreamDelta,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StreamDelta {
    pub content: Option<String>,
    pub tool_calls: Option<Vec<StreamToolCall>>,
    pub reasoning_content: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StreamToolCall {
    pub index: usize,
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub call_type: Option<String>,
    pub function: Option<StreamFunction>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StreamFunction {
    pub name: Option<String>,
    pub arguments: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: FunctionDefinition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionDefinition {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: FunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Deserialize)]
pub struct ChatResponse {
    pub choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
pub struct Choice {
    pub message: ApiMessage,
}

// ---- Model list types ----

#[derive(Debug, Deserialize)]
pub struct ModelsResponse {
    pub data: Vec<ModelInfo>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ModelInfo {
    pub id: String,
    #[serde(rename = "type")]
    pub model_type: Option<String>,
}

// ---- AI Service ----

pub struct AiService {
    client: reqwest::Client,
}

pub fn abort_ai() {
    ABORT_FLAG.store(true, Ordering::SeqCst);
}

fn is_aborted() -> bool {
    ABORT_FLAG.load(Ordering::SeqCst)
}

fn reset_abort() {
    ABORT_FLAG.store(false, Ordering::SeqCst);
}

impl AiService {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }

    /// Fetch available models from an OpenAI-compatible API provider
    pub async fn fetch_models(&self, base_url: &str, api_key: &str) -> Result<Vec<String>, String> {
        let url = format!("{}/models", base_url.trim_end_matches('/'));
        let response = self.client.get(&url)
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API 错误 ({}): {}", status, body));
        }

        let models_response: ModelsResponse = response.json().await
            .map_err(|e| format!("解析响应失败: {}", e))?;

        let model_ids: Vec<String> = models_response.data
            .into_iter()
            .map(|m| m.id)
            .collect();

        Ok(model_ids)
    }

    /// Full chat loop: send message, handle tool calls, return final response
    /// If save_messages is false, messages won't be saved to database (used for internal calls like summary generation)
    pub async fn chat(
        &self,
        db: &Database,
        conversation_id: &str,
        user_message: &str,
        base_url: &str,
        api_key: &str,
        model: &str,
        system_prompt: &str,
        save_messages: bool,
    ) -> Result<String, String> {
        // Save user message if needed
        if save_messages {
            db.add_message(conversation_id, "user", user_message, None, None)?;
        }

        // Build message history
        let history = db.get_messages(conversation_id)?;
        let tools = self.get_tools();

        let mut api_messages: Vec<ApiMessage> = Vec::new();

        // Add system prompt as first message
        let tool_prompt = "你可以帮用户管理笔记和文件夹。支持的操作：\n\
            【笔记】创建、查看完整内容、搜索、列出、更新（标题/内容/标签/文件夹）、移动到文件夹、删除、导出为 Markdown\n\
            【文件夹】创建、列出、搜索、重命名、删除（笔记自动移至未分类）\n\
            【批量】批量创建笔记、批量删除笔记、批量移动笔记\n\
            请用 Markdown 格式回复。当用户要求管理笔记或文件夹时，请主动使用对应的工具完成操作。";
        let prompt = if system_prompt.is_empty() {
            tool_prompt.to_string()
        } else {
            format!("{}\n\n{}", system_prompt, tool_prompt)
        };
        api_messages.push(ApiMessage {
            role: "system".to_string(),
            content: Some(prompt),
            tool_calls: None,
            tool_call_id: None,
            reasoning_content: None,
        });

        // Add conversation history
        for m in &history {
            // Extract thinking content from stored message if present
            let (content, reasoning) = if let Some(c) = m.content.strip_prefix("<!--KOVA_THINKING:") {
                if let Some(end) = c.find("-->") {
                    let thinking = c[..end].trim().to_string();
                    let main = c[end + 3..].trim().to_string();
                    (if main.is_empty() { None } else { Some(main) }, Some(thinking))
                } else {
                    (Some(m.content.clone()), None)
                }
            } else {
                (Some(m.content.clone()), None)
            };
            api_messages.push(ApiMessage {
                role: m.role.clone(),
                content,
                tool_calls: m.tool_calls.as_ref().and_then(|tc| serde_json::from_str(tc).ok()),
                tool_call_id: m.tool_call_id.clone(),
                reasoning_content: reasoning,
            });
        }

        // Tool execution loop (max 10 iterations to prevent infinite loops)
        for _ in 0..10 {
            let request = ChatRequest {
                model: model.to_string(),
                messages: api_messages.clone(),
                tools: Some(tools.clone()),
                tool_choice: None,
                stream: None,
                enable_thinking: None,
                temperature: None,
                max_tokens: None,
            };

            let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
            let response = self.client.post(&url)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .json(&request)
                .send()
                .await
                .map_err(|e| format!("请求失败: {}", e))?;

            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                return Err(format!("API 错误 ({}): {}", status, body));
            }

            let chat_response: ChatResponse = response.json().await
                .map_err(|e| format!("解析响应失败: {}", e))?;

            let assistant_msg = chat_response.choices.first()
                .ok_or("API 返回空响应")?
                .message.clone();

            // Check if AI wants to call tools
            if let Some(tool_calls) = &assistant_msg.tool_calls {
                // Save assistant message with tool calls
                let tc_json = serde_json::to_string(tool_calls).unwrap_or_default();
                if save_messages {
                    db.add_message(conversation_id, "assistant", "", Some(&tc_json), None)?;
                }

                // Add assistant message to conversation
                api_messages.push(assistant_msg.clone());

                // Execute each tool call
                for tc in tool_calls {
                    let result = self.execute_tool(db, &tc.function.name, &tc.function.arguments).await;
                    let result_content = match result {
                        Ok(val) => serde_json::to_string(&val).unwrap_or_else(|_| val.to_string()),
                        Err(e) => serde_json::json!({"error": e}).to_string(),
                    };

                    // Save tool result message
                    if save_messages {
                        db.add_message(conversation_id, "tool", &result_content, None, Some(&tc.id))?;
                    }

                    // Add tool result to conversation
                    api_messages.push(ApiMessage {
                        role: "tool".to_string(),
                        content: Some(result_content),
                        tool_calls: None,
                        tool_call_id: Some(tc.id.clone()),
                        reasoning_content: None,
                    });
                }
                // Continue loop to get AI's response after tool execution
            } else {
                // No tool calls - save final assistant response
                let content = assistant_msg.content.clone().unwrap_or_default();
                if save_messages {
                    db.add_message(conversation_id, "assistant", &content, None, None)?;
                }
                return Ok(content);
            }
        }

        Err("达到最大工具调用次数限制".to_string())
    }

    /// Streaming chat: emits events via callback, returns final response
    pub async fn chat_stream<F>(
        &self,
        db: &Database,
        conversation_id: &str,
        user_message: &str,
        base_url: &str,
        api_key: &str,
        model: &str,
        system_prompt: &str,
        max_context_messages: usize,
        _enable_summary: bool,
        conversation_summary: &str,
        enable_thinking: bool,
        temperature: Option<f32>,
        max_tokens: Option<u32>,
        on_event: F,
    ) -> Result<String, String>
    where
        F: Fn(&str, &str) + Send + Sync,
    {
        log::info!("[AI Stream] Starting chat_stream for conversation: {}", conversation_id);
        reset_abort();

        // Save user message
        db.add_message(conversation_id, "user", user_message, None, None)?;

        let history = db.get_messages(conversation_id)?;
        let tools = self.get_tools();

        // Truncate history if exceeds max_context_messages (keep recent messages)
        let truncated_history = if max_context_messages > 0 && history.len() > max_context_messages {
            log::info!("[AI Stream] Truncating history from {} to {} messages", history.len(), max_context_messages);
            &history[history.len() - max_context_messages..]
        } else {
            &history
        };

        let mut api_messages: Vec<ApiMessage> = Vec::new();

        // Add system prompt as first message
        let tool_prompt = "你可以帮用户管理笔记和文件夹。支持的操作：\n\
            【笔记】创建、查看完整内容、搜索、列出、更新（标题/内容/标签/文件夹）、移动到文件夹、删除、导出为 Markdown\n\
            【文件夹】创建、列出、搜索、重命名、删除（笔记自动移至未分类）\n\
            【批量】批量创建笔记、批量删除笔记、批量移动笔记\n\
            请用 Markdown 格式回复。当用户要求管理笔记或文件夹时，请主动使用对应的工具完成操作。";
        let mut prompt_parts = Vec::new();
        if !system_prompt.is_empty() {
            prompt_parts.push(system_prompt.to_string());
        }
        if !conversation_summary.is_empty() {
            prompt_parts.push(format!("以下是之前对话的摘要：\n{}", conversation_summary));
        }
        prompt_parts.push(tool_prompt.to_string());
        let prompt = prompt_parts.join("\n\n");

        api_messages.push(ApiMessage {
            role: "system".to_string(),
            content: Some(prompt),
            tool_calls: None,
            tool_call_id: None,
            reasoning_content: None,
        });

        // Add conversation history (truncated)
        for m in truncated_history {
            let (content, reasoning) = if let Some(c) = m.content.strip_prefix("<!--KOVA_THINKING:") {
                if let Some(end) = c.find("-->") {
                    let thinking = c[..end].trim().to_string();
                    let main = c[end + 3..].trim().to_string();
                    (if main.is_empty() { None } else { Some(main) }, Some(thinking))
                } else {
                    (Some(m.content.clone()), None)
                }
            } else {
                (Some(m.content.clone()), None)
            };
            api_messages.push(ApiMessage {
                role: m.role.clone(),
                content,
                tool_calls: m.tool_calls.as_ref().and_then(|tc| serde_json::from_str(tc).ok()),
                tool_call_id: m.tool_call_id.clone(),
                reasoning_content: reasoning,
            });
        }

        for _ in 0..10 {
            if is_aborted() {
                log::info!("[AI Stream] Aborted by user");
                on_event("done", "");
                return Ok("已停止生成".to_string());
            }
            let request = ChatRequest {
                model: model.to_string(),
                messages: api_messages.clone(),
                tools: Some(tools.clone()),
                tool_choice: None,
                stream: Some(true),
                enable_thinking: if enable_thinking { Some(true) } else { None },
                temperature,
                max_tokens,
            };

            let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
            let response = self.client.post(&url)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .json(&request)
                .send()
                .await
                .map_err(|e| format!("请求失败: {}", e))?;

            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                log::error!("[AI Stream] API error: status={}, body={}", status, body);
                return Err(format!("API 错误 ({}): {}", status, body));
            }

            log::info!("[AI Stream] Response received, starting to read SSE stream");

            // Read SSE stream
            let mut full_content = String::new();
            let mut tool_calls_map: std::collections::HashMap<usize, (String, String, String)> = std::collections::HashMap::new();
            let mut has_tool_calls = false;

            let mut stream = response.bytes_stream();
            use futures_util::StreamExt;
            let mut buffer = String::new();

            let mut chunk_count = 0;
            let mut thinking_content = String::new();
            let mut done = false;
            while let Some(chunk_result) = stream.next().await {
                if done || is_aborted() { break; }
                let chunk = chunk_result.map_err(|e| format!("流读取失败: {}", e))?;
                buffer.push_str(&String::from_utf8_lossy(&chunk));

                // Process complete lines
                while let Some(line_end) = buffer.find('\n') {
                    let line = buffer[..line_end].trim().to_string();
                    buffer = buffer[line_end + 1..].to_string();

                    if line.is_empty() { continue; }
                    if line == "data: [DONE]" {
                        log::info!("[AI Stream] Received [DONE] signal");
                        done = true;
                        break;
                    }
                    if line.starts_with(":") {
                        // SSE comment, skip
                        continue;
                    }
                    log::debug!("[AI Stream] Raw SSE line: {}", line);
                    if let Some(data) = line.strip_prefix("data: ") {
                        match serde_json::from_str::<StreamChunk>(data) {
                            Ok(chunk) => {
                                if let Some(choice) = chunk.choices.first() {
                                    // Text content
                                    if let Some(content) = &choice.delta.content {
                                        chunk_count += 1;
                                        full_content.push_str(content);
                                        if chunk_count <= 3 || chunk_count % 10 == 0 {
                                            log::info!("[AI Stream] Chunk #{}: content='{}', total_len={}", chunk_count, content, full_content.len());
                                        }
                                        on_event("chunk", content);
                                    }
                                    // Thinking/reasoning content
                                    if let Some(thinking) = &choice.delta.reasoning_content {
                                        if !thinking.is_empty() {
                                            thinking_content.push_str(thinking);
                                            on_event("thinking", thinking);
                                        }
                                    }
                                    // Tool calls
                                    for tc in choice.delta.tool_calls.iter().flatten() {
                                        has_tool_calls = true;
                                        let entry = tool_calls_map.entry(tc.index).or_insert((
                                            tc.id.clone().unwrap_or_default(),
                                            String::new(),
                                            String::new(),
                                        ));
                                        if let Some(id) = &tc.id { entry.0 = id.clone(); }
                                        if let Some(func) = &tc.function {
                                            if let Some(name) = &func.name { entry.1 = name.clone(); }
                                            if let Some(args) = &func.arguments { entry.2.push_str(args); }
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                log::warn!("[AI Stream] Failed to parse chunk: {}, data: {}", e, data);
                            }
                        }
                    }
                }
            }

            log::info!("[AI Stream] Stream ended. full_content.len={}, has_tool_calls={}, tool_calls_map.len={}", full_content.len(), has_tool_calls, tool_calls_map.len());

            if has_tool_calls && !tool_calls_map.is_empty() {
                // Save assistant message with tool calls
                let mut sorted_keys: Vec<usize> = tool_calls_map.keys().copied().collect();
                sorted_keys.sort();
                let tool_calls_vec: Vec<ToolCall> = sorted_keys.iter().filter_map(|k| tool_calls_map.get(k)).map(|(id, name, args)| {
                    ToolCall {
                        id: id.clone(),
                        call_type: "function".to_string(),
                        function: FunctionCall {
                            name: name.clone(),
                            arguments: args.clone(),
                        },
                    }
                }).collect();
                let tc_json = serde_json::to_string(&tool_calls_vec).unwrap_or_default();
                db.add_message(conversation_id, "assistant", "", Some(&tc_json), None)?;

                api_messages.push(ApiMessage {
                    role: "assistant".to_string(),
                    content: None,
                    tool_calls: Some(tool_calls_vec.clone()),
                    tool_call_id: None,
                    reasoning_content: if thinking_content.is_empty() { None } else { Some(thinking_content.clone()) },
                });

                // Execute tool calls
                for tc in &tool_calls_vec {
                    if is_aborted() {
                        log::info!("[AI Stream] Aborted before tool execution");
                        break;
                    }
                    on_event("tool_call", &format!("{{\"name\":\"{}\",\"arguments\":{}}}", tc.function.name, tc.function.arguments));
                    let result = self.execute_tool(db, &tc.function.name, &tc.function.arguments).await;
                    let result_content = match result {
                        Ok(val) => serde_json::to_string(&val).unwrap_or_else(|_| val.to_string()),
                        Err(e) => serde_json::json!({"error": e}).to_string(),
                    };
                    on_event("tool_done", &tc.function.name);
                    // Notify frontend to refresh data if the tool modifies notes or folders
                    let should_refresh = matches!(tc.function.name.as_str(),
                        "create_note" | "update_note" | "delete_note" | "move_note" |
                        "create_folder" | "update_folder" | "delete_folder" |
                        "batch_move_notes" | "batch_delete_notes" | "batch_create_notes"
                    );
                    if should_refresh {
                        on_event("data_changed", &tc.function.name);
                    }
                    db.add_message(conversation_id, "tool", &result_content, None, Some(&tc.id))?;
                    api_messages.push(ApiMessage {
                        role: "tool".to_string(),
                        content: Some(result_content),
                        tool_calls: None,
                        tool_call_id: Some(tc.id.clone()),
                        reasoning_content: None,
                    });
                }
                // Check abort after tool execution
                if is_aborted() {
                    log::info!("[AI Stream] Aborted after tool execution");
                    on_event("done", "");
                    return Ok("已停止生成".to_string());
                }
                // Continue loop
            } else {
                // No tool calls - save and return
                // If only thinking content with no main text, use thinking as the response
                let effective_content = if full_content.is_empty() && !thinking_content.is_empty() {
                    thinking_content.clone()
                } else {
                    full_content.clone()
                };
                let save_content = if thinking_content.is_empty() || full_content.is_empty() {
                    effective_content.clone()
                } else {
                    format!("<!--KOVA_THINKING:{}-->\n{}", thinking_content, full_content)
                };
                log::info!("[AI Stream] Saving assistant message to DB. content_len={}, thinking_len={}", effective_content.len(), thinking_content.len());
                db.add_message(conversation_id, "assistant", &save_content, None, None)?;
                on_event("done", &effective_content);
                log::info!("[AI Stream] chat_stream completed successfully");
                return Ok(effective_content);
            }
        }

        Err("达到最大工具调用次数限制".to_string())
    }

    /// Execute a single tool call and return the result
    async fn execute_tool(&self, db: &Database, name: &str, arguments: &str) -> Result<Value, String> {
        let args: Value = serde_json::from_str(arguments).map_err(|e| format!("参数解析失败: {}", e))?;

        match name {
            "create_note" => {
                let title = args["title"].as_str().unwrap_or("");
                let content = args["content"].as_str().unwrap_or("");
                let folder_name = args["folder_name"].as_str();

                let folder_id = if let Some(fname) = folder_name {
                    self.find_folder_id(db, fname)?
                } else {
                    None
                };

                let note = db.create_note(title, content, vec![], folder_id)?;
                Ok(serde_json::json!({
                    "success": true,
                    "note_id": note.id,
                    "title": note.title,
                    "message": format!("已创建笔记「{}」", note.title)
                }))
            }
            "get_note" => {
                let note_id = args["note_id"].as_str().ok_or("缺少 note_id")?;
                let note = db.get_note(note_id)?;
                let folder_name = if let Some(ref fid) = note.folder_id {
                    db.get_folders()?.iter().find(|f| &f.id == fid).map(|f| f.name.clone())
                } else {
                    None
                };
                Ok(serde_json::json!({
                    "id": note.id,
                    "title": note.title,
                    "content": note.content,
                    "tags": note.tags,
                    "folder_id": note.folder_id,
                    "folder_name": folder_name,
                    "created_at": note.created_at,
                    "updated_at": note.updated_at
                }))
            }
            "list_notes" => {
                let folder_name = args["folder_name"].as_str();
                let folder_id = if let Some(fname) = folder_name {
                    self.find_folder_id(db, fname)?
                } else {
                    None
                };

                let notes = db.get_notes(None, folder_id.as_deref())?;
                let summary: Vec<Value> = notes.iter().take(20).map(|n| {
                    serde_json::json!({
                        "id": n.id,
                        "title": n.title,
                        "preview": n.content.chars().take(100).collect::<String>(),
                        "folder_id": n.folder_id,
                    })
                }).collect();

                Ok(serde_json::json!({
                    "count": notes.len(),
                    "notes": summary,
                }))
            }
            "search_notes" => {
                let query = args["query"].as_str().unwrap_or("");
                let notes = db.get_notes(Some(query), None)?;
                let summary: Vec<Value> = notes.iter().take(10).map(|n| {
                    serde_json::json!({
                        "id": n.id,
                        "title": n.title,
                        "preview": n.content.chars().take(100).collect::<String>(),
                    })
                }).collect();

                Ok(serde_json::json!({
                    "count": notes.len(),
                    "results": summary,
                }))
            }
            "update_note" => {
                let note_id = args["note_id"].as_str().ok_or("缺少 note_id")?;
                let title = args["title"].as_str();
                let content = args["content"].as_str();
                let tags = args["tags"].as_array().map(|arr| {
                    arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect::<Vec<_>>()
                });
                let folder_name = args["folder_name"].as_str();
                let resolved_folder = if let Some(fname) = folder_name {
                    if fname.is_empty() { Some(None) } else { self.find_folder_id(db, fname)?.map(Some) }
                } else { None };
                let folder_id: Option<Option<&str>> = resolved_folder.as_ref().map(|opt| opt.as_deref());

                db.update_note(note_id, title, content, tags, folder_id)?;
                Ok(serde_json::json!({
                    "success": true,
                    "message": "笔记已更新"
                }))
            }
            "move_note" => {
                let note_id = args["note_id"].as_str().ok_or("缺少 note_id")?;
                let folder_name = args["folder_name"].as_str().ok_or("缺少 folder_name")?;
                let resolved_folder: Option<Option<String>> = if folder_name.is_empty() {
                    Some(None)
                } else {
                    self.find_folder_id(db, folder_name)?.map(Some)
                };
                let folder_id: Option<Option<&str>> = resolved_folder.as_ref().map(|opt| opt.as_deref());
                db.update_note(note_id, None, None, None, folder_id)?;
                let dest = if folder_name.is_empty() { "未分类".to_string() } else { folder_name.to_string() };
                Ok(serde_json::json!({
                    "success": true,
                    "message": format!("已移动笔记到「{}」", dest)
                }))
            }
            "delete_note" => {
                let note_id = args["note_id"].as_str().ok_or("缺少 note_id")?;
                db.delete_note(note_id)?;
                Ok(serde_json::json!({
                    "success": true,
                    "message": "笔记已删除"
                }))
            }
            "create_folder" => {
                let name = args["name"].as_str().ok_or("缺少文件夹名称")?;
                let parent_name = args["parent_name"].as_str();

                let parent_id = if let Some(pname) = parent_name {
                    self.find_folder_id(db, pname)?
                } else {
                    None
                };

                let folder = db.create_folder(name, parent_id.as_deref())?;
                Ok(serde_json::json!({
                    "success": true,
                    "folder_id": folder.id,
                    "name": folder.name,
                    "message": format!("已创建文件夹「{}」", folder.name)
                }))
            }
            "update_folder" => {
                let folder_name = args["folder_name"].as_str().ok_or("缺少 folder_name")?;
                let new_name = args["new_name"].as_str().ok_or("缺少 new_name")?;
                let folder_id = self.find_folder_id(db, folder_name)?
                    .ok_or(format!("找不到文件夹「{}」", folder_name))?;
                db.update_folder(&folder_id, new_name)?;
                Ok(serde_json::json!({
                    "success": true,
                    "message": format!("已将「{}」重命名为「{}」", folder_name, new_name)
                }))
            }
            "delete_folder" => {
                let folder_name = args["folder_name"].as_str().ok_or("缺少 folder_name")?;
                let folder_id = self.find_folder_id(db, folder_name)?
                    .ok_or(format!("找不到文件夹「{}」", folder_name))?;
                db.delete_folder(&folder_id)?;
                Ok(serde_json::json!({
                    "success": true,
                    "message": format!("已删除文件夹「{}」，其中的笔记已移至未分类", folder_name)
                }))
            }
            "list_folders" => {
                let folders = db.get_folders()?;
                let summary: Vec<Value> = folders.iter().map(|f| {
                    serde_json::json!({
                        "id": f.id,
                        "name": f.name,
                        "parent_id": f.parent_id,
                    })
                }).collect();

                Ok(serde_json::json!({
                    "count": folders.len(),
                    "folders": summary,
                }))
            }
            "search_folders" => {
                let query = args["query"].as_str().unwrap_or("");
                let folders = db.get_folders()?;
                let matched: Vec<Value> = folders.iter()
                    .filter(|f| f.name.to_lowercase().contains(&query.to_lowercase()))
                    .map(|f| serde_json::json!({
                        "id": f.id,
                        "name": f.name,
                        "parent_id": f.parent_id,
                    }))
                    .collect();
                Ok(serde_json::json!({
                    "count": matched.len(),
                    "folders": matched,
                }))
            }
            "batch_move_notes" => {
                let note_ids = args["note_ids"].as_array().ok_or("缺少 note_ids")?;
                let folder_name = args["folder_name"].as_str().ok_or("缺少 folder_name")?;
                let folder_id_val: Option<Option<String>> = if folder_name.is_empty() {
                    Some(None)
                } else {
                    self.find_folder_id(db, folder_name)?.map(Some)
                };
                let mut moved = 0;
                for id_val in note_ids {
                    if let Some(id) = id_val.as_str() {
                        let folder_id: Option<Option<&str>> = folder_id_val.as_ref().map(|opt| opt.as_deref());
                        if db.update_note(id, None, None, None, folder_id).is_ok() {
                            moved += 1;
                        }
                    }
                }
                let dest = if folder_name.is_empty() { "未分类".to_string() } else { folder_name.to_string() };
                Ok(serde_json::json!({
                    "success": true,
                    "moved": moved,
                    "message": format!("已移动 {} 条笔记到「{}」", moved, dest)
                }))
            }
            "batch_delete_notes" => {
                let note_ids = args["note_ids"].as_array().ok_or("缺少 note_ids")?;
                let mut deleted = 0;
                for id_val in note_ids {
                    if let Some(id) = id_val.as_str() {
                        if db.delete_note(id).is_ok() {
                            deleted += 1;
                        }
                    }
                }
                Ok(serde_json::json!({
                    "success": true,
                    "deleted": deleted,
                    "message": format!("已删除 {} 条笔记", deleted)
                }))
            }
            "batch_create_notes" => {
                let notes = args["notes"].as_array().ok_or("缺少 notes")?;
                let mut created = Vec::new();
                for note_val in notes {
                    let title = note_val["title"].as_str().unwrap_or("");
                    let content = note_val["content"].as_str().unwrap_or("");
                    let folder_name = note_val["folder_name"].as_str();
                    let folder_id = if let Some(fname) = folder_name {
                        self.find_folder_id(db, fname)?
                    } else {
                        None
                    };
                    if let Ok(note) = db.create_note(title, content, vec![], folder_id) {
                        created.push(note.id);
                    }
                }
                Ok(serde_json::json!({
                    "success": true,
                    "created": created.len(),
                    "note_ids": created,
                    "message": format!("已创建 {} 条笔记", created.len())
                }))
            }
            "export_note" => {
                let note_id = args["note_id"].as_str().ok_or("缺少 note_id")?;
                let dest_dir = args["dest_dir"].as_str().unwrap_or("");
                let path = if dest_dir.is_empty() {
                    let data_dir = db.data_dir();
                    let export_dir = data_dir.join("exports");
                    db.export_note_as_md(note_id, export_dir.to_str().unwrap_or("."))?
                } else {
                    db.export_note_as_md(note_id, dest_dir)?
                };
                Ok(serde_json::json!({
                    "success": true,
                    "path": path,
                    "message": format!("已导出到：{}", path)
                }))
            }
            _ => Err(format!("未知工具: {}", name))
        }
    }

    /// Find folder ID by name (returns first match)
    fn find_folder_id(&self, db: &Database, name: &str) -> Result<Option<String>, String> {
        let folders = db.get_folders()?;
        let folder = folders.iter().find(|f| f.name == name);
        Ok(folder.map(|f| f.id.clone()))
    }

    /// Get tool definitions in OpenAI function calling format
    fn get_tools(&self) -> Vec<ToolDefinition> {
        vec![
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "create_note".to_string(),
                    description: "创建一篇新笔记".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "title": { "type": "string", "description": "笔记标题" },
                            "content": { "type": "string", "description": "笔记内容（Markdown 格式）" },
                            "folder_name": { "type": "string", "description": "目标文件夹名称（可选，不填则归入未分类）" }
                        },
                        "required": ["title", "content"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "get_note".to_string(),
                    description: "获取单篇笔记的完整内容（包括标题、正文、标签、文件夹等全部信息）".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "note_id": { "type": "string", "description": "笔记 ID" }
                        },
                        "required": ["note_id"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "list_notes".to_string(),
                    description: "列出笔记，可按文件夹筛选".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "folder_name": { "type": "string", "description": "文件夹名称（可选，不填则列出全部）" }
                        }
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "search_notes".to_string(),
                    description: "搜索笔记（按标题和内容关键词匹配）".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "query": { "type": "string", "description": "搜索关键词" }
                        },
                        "required": ["query"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "update_note".to_string(),
                    description: "更新已有笔记的标题、内容、标签或文件夹归属".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "note_id": { "type": "string", "description": "笔记 ID" },
                            "title": { "type": "string", "description": "新标题（可选）" },
                            "content": { "type": "string", "description": "新内容（可选）" },
                            "tags": { "type": "array", "items": { "type": "string" }, "description": "新标签列表（可选，替换现有标签）" },
                            "folder_name": { "type": "string", "description": "目标文件夹名称（可选，传空字符串表示移至未分类）" }
                        },
                        "required": ["note_id"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "move_note".to_string(),
                    description: "移动笔记到指定文件夹".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "note_id": { "type": "string", "description": "笔记 ID" },
                            "folder_name": { "type": "string", "description": "目标文件夹名称（传空字符串表示移至未分类）" }
                        },
                        "required": ["note_id", "folder_name"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "delete_note".to_string(),
                    description: "删除指定笔记".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "note_id": { "type": "string", "description": "笔记 ID" }
                        },
                        "required": ["note_id"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "create_folder".to_string(),
                    description: "创建新文件夹".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "name": { "type": "string", "description": "文件夹名称" },
                            "parent_name": { "type": "string", "description": "父文件夹名称（可选，不填则创建在顶层）" }
                        },
                        "required": ["name"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "update_folder".to_string(),
                    description: "重命名文件夹".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "folder_name": { "type": "string", "description": "当前文件夹名称" },
                            "new_name": { "type": "string", "description": "新名称" }
                        },
                        "required": ["folder_name", "new_name"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "delete_folder".to_string(),
                    description: "删除文件夹（其中的笔记会移至未分类）".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "folder_name": { "type": "string", "description": "要删除的文件夹名称" }
                        },
                        "required": ["folder_name"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "list_folders".to_string(),
                    description: "列出所有文件夹".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {}
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "search_folders".to_string(),
                    description: "按名称搜索文件夹".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "query": { "type": "string", "description": "搜索关键词" }
                        },
                        "required": ["query"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "batch_move_notes".to_string(),
                    description: "批量移动多篇笔记到同一文件夹".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "note_ids": { "type": "array", "items": { "type": "string" }, "description": "笔记 ID 列表" },
                            "folder_name": { "type": "string", "description": "目标文件夹名称（传空字符串表示移至未分类）" }
                        },
                        "required": ["note_ids", "folder_name"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "batch_delete_notes".to_string(),
                    description: "批量删除多篇笔记".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "note_ids": { "type": "array", "items": { "type": "string" }, "description": "笔记 ID 列表" }
                        },
                        "required": ["note_ids"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "batch_create_notes".to_string(),
                    description: "批量创建多篇笔记".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "notes": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "title": { "type": "string", "description": "笔记标题" },
                                        "content": { "type": "string", "description": "笔记内容" },
                                        "folder_name": { "type": "string", "description": "目标文件夹名称（可选）" }
                                    },
                                    "required": ["title", "content"]
                                },
                                "description": "笔记列表"
                            }
                        },
                        "required": ["notes"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "export_note".to_string(),
                    description: "将笔记导出为 Markdown 文件".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "note_id": { "type": "string", "description": "笔记 ID" },
                            "dest_dir": { "type": "string", "description": "导出目录（可选，默认导出到数据目录下的 exports 文件夹）" }
                        },
                        "required": ["note_id"]
                    }),
                },
            },
        ]
    }
}
