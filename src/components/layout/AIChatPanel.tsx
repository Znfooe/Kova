import { useState, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { MarkdownPreview } from "../shared/MarkdownPreview";

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tool_calls: string | null;
  tool_call_id: string | null;
  created_at: string;
}

interface AIProfile {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  system_prompt: string;
  max_context_messages: number;
  enable_summary: boolean;
  enable_thinking: boolean;
}

interface AIChatPanelProps {
  onClose: () => void;
}

function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-1.5 bg-transparent">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center text-[11px] text-ink-ghost hover:text-ink-faint transition-colors bg-transparent"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`mr-1.5 transition-transform ${expanded ? "rotate-90" : ""}`}><path d="M9 18l6-6-6-6"/></svg>
        <span>深度思考</span>
      </button>
      {expanded && (
        <div className="mt-1 ml-4 p-2.5 bg-paper-warm/60 border-l-2 border-accent/40 rounded-r-lg text-[11px] text-ink-faint leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  );
}

export function AIChatPanel({ onClose }: AIChatPanelProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<AIProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>("");
  const [showConvList, setShowConvList] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editProfile, setEditProfile] = useState<AIProfile | null>(null);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingConvTitle, setEditingConvTitle] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeProfile = profiles.find(p => p.id === activeProfileId);

  // Load conversations and config on mount
  useEffect(() => {
    loadConversations();
    loadProfiles();
  }, []);

  // Load messages when conversation changes
  useEffect(() => {
    if (currentConvId) {
      invoke<ChatMessage[]>("get_messages", { conversationId: currentConvId }).then((msgs) => {
        console.log("[AI Chat] Loaded messages for conversation:", currentConvId, "count:", msgs.length);
        setMessages(msgs);
      });
    } else {
      setMessages([]);
    }
  }, [currentConvId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversations = async () => {
    const convs = await invoke<Conversation[]>("get_conversations");
    setConversations(convs);
    if (convs.length > 0 && !currentConvId) {
      setCurrentConvId(convs[0].id);
    }
  };

  const loadProfiles = async () => {
    const profs = await invoke<AIProfile[]>("get_ai_profiles");
    setProfiles(profs);
    const active = await invoke<AIProfile | null>("get_active_ai_profile");
    if (active) {
      setActiveProfileId(active.id);
    }
  };

  const handleSaveProfile = async () => {
    if (!editProfile) return;
    const profile = { ...editProfile };
    if (!profile.id) {
      profile.id = Date.now().toString();
    }
    await invoke("save_ai_profile", { profile });
    await invoke("set_active_ai_profile", { id: profile.id });
    await loadProfiles();
    setEditProfile(null);
  };

  const handleDeleteProfile = async (id: string) => {
    await invoke("delete_ai_profile", { id });
    await loadProfiles();
  };

  const handleSelectProfile = async (id: string) => {
    await invoke("set_active_ai_profile", { id });
    setActiveProfileId(id);
  };

  const handleNewProfile = () => {
    setEditProfile({ id: "", name: "", base_url: "", api_key: "", model: "", system_prompt: "", max_context_messages: 20, enable_summary: true, enable_thinking: false });
  };

  const handleNewConversation = async () => {
    // Check if there's already an empty "新对话" conversation
    const existing = conversations.find((c) => c.title === "新对话");
    if (existing) {
      const msgs = await invoke<ChatMessage[]>("get_messages", { conversationId: existing.id });
      if (msgs.length === 0) {
        setCurrentConvId(existing.id);
        setShowConvList(false);
        return;
      }
    }
    const conv = await invoke<Conversation>("create_conversation", { title: "新对话" });
    setConversations((prev) => [conv, ...prev]);
    setCurrentConvId(conv.id);
    setShowConvList(false);
  };

  const handleDeleteConversation = async (id: string) => {
    await invoke("delete_conversation", { id });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (currentConvId === id) {
      const remaining = conversations.filter((c) => c.id !== id);
      setCurrentConvId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const handleStartRename = (conv: Conversation) => {
    setEditingConvId(conv.id);
    setEditingConvTitle(conv.title);
  };

  const handleConfirmRename = async () => {
    if (!editingConvId || !editingConvTitle.trim()) return;
    await invoke("update_conversation_title", { id: editingConvId, title: editingConvTitle.trim() });
    setConversations((prev) => prev.map((c) => c.id === editingConvId ? { ...c, title: editingConvTitle.trim() } : c));
    setEditingConvId(null);
  };

  const handleSend = async () => {
    if (!input.trim() || !currentConvId || loading) return;
    if (!activeProfile) {
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        conversation_id: currentConvId,
        role: "system",
        content: "请先在设置中配置 AI（API 地址、Key、模型）",
        tool_calls: null,
        tool_call_id: null,
        created_at: new Date().toISOString(),
      }]);
      return;
    }

    const userMsg = input.trim();
    const convId = currentConvId;
    setInput("");
    setLoading(true);

    // Optimistic add user message
    setMessages((prev) => [...prev, {
      id: Date.now().toString(),
      conversation_id: convId,
      role: "user",
      content: userMsg,
      tool_calls: null,
      tool_call_id: null,
      created_at: new Date().toISOString(),
    }]);

    // Add empty assistant message for streaming
    const streamingId = "streaming-" + Date.now();
    setMessages((prev) => [...prev, {
      id: streamingId,
      conversation_id: convId,
      role: "assistant",
      content: "",
      tool_calls: null,
      tool_call_id: null,
      created_at: new Date().toISOString(),
    }]);

    // Listen for streaming events
    let streamedContent = "";
    let thinkingContent = "";
    const toolCalls: Array<{ name: string; args: string; done: boolean; startTime: number }> = [];

    const getToolDisplayName = (name: string, args: string): string => {
      let p: Record<string, unknown> = {};
      try { p = JSON.parse(args); } catch { /* ignore */ }
      const v = (k: string): string => String(p[k] ?? "");
      switch (name) {
        case "create_note": return `创建笔记「${v("title") || "无标题"}」`;
        case "get_note": return "查看笔记内容";
        case "search_notes": return `搜索「${v("query")}」`;
        case "update_note": return "更新笔记";
        case "move_note": return `移动笔记到「${v("folder_name") || "未分类"}」`;
        case "delete_note": return "删除笔记";
        case "create_folder": return `创建文件夹「${v("name")}」`;
        case "update_folder": return "重命名文件夹";
        case "delete_folder": return `删除文件夹「${v("folder_name")}」`;
        case "list_notes": return v("folder_name") ? `查看「${v("folder_name")}」的笔记` : "查看所有笔记";
        case "list_folders": return "查看文件夹列表";
        case "search_folders": return `搜索文件夹「${v("query")}」`;
        case "batch_move_notes": return `批量移动 ${(p.note_ids as unknown[])?.length || 0} 条笔记`;
        case "batch_delete_notes": return `批量删除 ${(p.note_ids as unknown[])?.length || 0} 条笔记`;
        case "batch_create_notes": return `批量创建 ${(p.notes as unknown[])?.length || 0} 条笔记`;
        case "export_note": return "导出笔记";
        default: return name;
      }
    };

    const buildToolCallDisplay = () => {
      if (toolCalls.length === 0) return "";
      return "\n\n" + toolCalls.map((tc, i) => {
        const icon = tc.done ? "✅" : "⏳";
        const name = getToolDisplayName(tc.name, tc.args);
        const isRunning = !tc.done && (i === toolCalls.length - 1 || !toolCalls[i + 1]?.done);
        return `${icon} ${name}${isRunning ? " 执行中..." : ""}`;
      }).join("\n");
    };

    const buildFullContent = () => {
      let parts = "";
      if (thinkingContent) {
        parts += `<!--KOVA_THINKING:${thinkingContent}-->`;
      }
      parts += streamedContent;
      const toolDisplay = buildToolCallDisplay();
      if (toolDisplay) {
        parts += toolDisplay;
        if (toolCalls.some(tc => !tc.done)) {
          parts += "\n\n⏳ 正在处理...";
        }
      }
      return parts;
    };

    const unlisten = await listen<{ type: string; data: string; conversation_id: string }>("ai-stream", (event) => {
      if (event.payload.conversation_id !== convId) return;
      const { type, data } = event.payload;

      if (type === "chunk") {
        streamedContent += data;
        setMessages((prev) => prev.map((m) =>
          m.id === streamingId ? { ...m, content: buildFullContent() } : m
        ));
      } else if (type === "thinking") {
        thinkingContent += data;
        setMessages((prev) => prev.map((m) =>
          m.id === streamingId ? { ...m, content: buildFullContent() } : m
        ));
      } else if (type === "tool_call") {
        try {
          const toolInfo = JSON.parse(data);
          toolCalls.push({ name: toolInfo.name, args: toolInfo.arguments, done: false, startTime: Date.now() });
          flushSync(() => {
            setMessages((prev) => prev.map((m) =>
              m.id === streamingId ? { ...m, content: buildFullContent() } : m
            ));
          });
        } catch {
          // ignore parse errors
        }
      } else if (type === "tool_done") {
        const lastTool = toolCalls[toolCalls.length - 1];
        if (lastTool) {
          // Ensure the "executing" state is visible for at least 300ms
          const elapsed = Date.now() - (lastTool.startTime ?? 0);
          const delay = Math.max(0, 300 - elapsed);
          setTimeout(() => {
            lastTool.done = true;
            setMessages((prev) => prev.map((m) =>
              m.id === streamingId ? { ...m, content: buildFullContent() } : m
            ));
          }, delay);
        }
      } else if (type === "done") {
        // Streaming finished - show only the final content, clear tool display
        toolCalls.length = 0;
        thinkingContent = "";
        setMessages((prev) => prev.map((m) =>
          m.id === streamingId ? { ...m, content: streamedContent || data } : m
        ));
      }
    });

    try {
      console.log("[AI Chat] Starting ai_chat_stream with profile:", activeProfile.name);
      await invoke<ChatMessage>("ai_chat_stream", {
        conversationId: convId,
        message: userMsg,
        baseUrl: activeProfile.base_url,
        apiKey: activeProfile.api_key,
        model: activeProfile.model,
        systemPrompt: activeProfile.system_prompt || "",
        maxContextMessages: activeProfile.max_context_messages || 0,
        enableSummary: activeProfile.enable_summary ?? true,
        enableThinking: activeProfile.enable_thinking ?? false,
      });
      console.log("[AI Chat] ai_chat_stream completed, streamedContent length:", streamedContent.length);

      // Reload messages from DB to get final state
      const updated = await invoke<ChatMessage[]>("get_messages", { conversationId: convId });
      console.log("[AI Chat] Loaded messages from DB:", updated.map(m => ({
        id: m.id,
        role: m.role,
        contentLength: m.content?.length || 0,
        contentPreview: m.content?.slice(0, 50) || "",
      })));
      setMessages(updated);

      // Update conversation title if it's still "新对话"
      const conv = conversations.find((c) => c.id === convId);
      if (conv && conv.title === "新对话") {
        const shortTitle = userMsg.slice(0, 20) + (userMsg.length > 20 ? "..." : "");
        await invoke("update_conversation_title", { id: convId, title: shortTitle });
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, title: shortTitle } : c))
        );
      }
    } catch (err) {
      // Remove streaming placeholder and show error
      setMessages((prev) => prev.filter((m) => m.id !== streamingId));
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        conversation_id: convId,
        role: "system",
        content: `错误: ${err}`,
        tool_calls: null,
        tool_call_id: null,
        created_at: new Date().toISOString(),
      }]);
    } finally {
      unlisten();
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCreateNoteFromMsg = async (content: string) => {
    // Extract title from first line if it starts with #
    const lines = content.split("\n");
    let title = "";
    let body = content;
    if (lines[0].startsWith("# ")) {
      title = lines[0].replace(/^#+\s*/, "");
      body = lines.slice(1).join("\n").trim();
    } else {
      title = lines[0].slice(0, 30) + (lines[0].length > 30 ? "..." : "");
    }
    await invoke("create_note", { title, content: body, tags: [], folderId: null });
  };

  const currentConv = conversations.find((c) => c.id === currentConvId);

  // Parse thinking content (supports both HTML comment and tag formats)
  const parseThinkingContent = (content: string): { thinking: string | null; main: string } => {
    // New format: <!--KOVA_THINKING:content-->
    let match = content.match(/^<!--KOVA_THINKING:([\s\S]*?)-->\s*([\s\S]*)$/);
    if (match) {
      return { thinking: match[1].trim(), main: match[2].trim() };
    }
    // Legacy format: <thinking>content</thinking>
    match = content.match(/^<thinking>([\s\S]*?)<\/thinking>\s*([\s\S]*)$/);
    if (match) {
      return { thinking: match[1].trim(), main: match[2].trim() };
    }
    return { thinking: null, main: content };
  };

  const renderMessage = (msg: ChatMessage) => {
    if (msg.role === "system") {
      return (
        <div key={msg.id} className="flex justify-center my-2">
          <span className="text-[11px] text-ink-ghost bg-paper-warm/60 px-3 py-1 rounded-full">{msg.content}</span>
        </div>
      );
    }

    // Skip empty assistant messages (tool call holders)
    if (msg.role === "assistant" && !msg.content && msg.tool_calls && msg.tool_calls !== "[]") return null;
    // Skip tool result messages
    if (msg.role === "tool") return null;
    // Skip empty assistant messages without content (but not during streaming)
    if (msg.role === "assistant" && !msg.content && !loading) return null;

    const isUser = msg.role === "user";
    const { thinking, main } = isUser ? { thinking: null, main: msg.content } : parseThinkingContent(msg.content);

    return (
      <div key={msg.id} className={`group/msg flex flex-col ${isUser ? "items-end" : "items-start"} mb-3`}>
        {/* Thinking section - completely separate from bubble */}
        {thinking && (
          <div className="max-w-[85%] mb-1">
            <ThinkingBlock content={thinking} />
          </div>
        )}
        <div className={`max-w-[85%]`}>
          <div className={`rounded-xl px-3 py-2 text-[13px] leading-relaxed select-text ${isUser
            ? "bg-accent text-white rounded-br-sm whitespace-pre-wrap"
            : "bg-paper-warm text-ink-soft rounded-bl-sm"
            }`}>
            {isUser ? main : (
              main ? (
                <div className="markdown-body text-[12px] select-text [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <MarkdownPreview content={main} />
                </div>
              ) : (
                <span className="text-ink-ghost animate-pulse">正在思考...</span>
              )
            )}
          </div>
          {/* Action buttons below the bubble, shown on hover */}
          <div className={`flex items-center gap-0.5 mt-1 opacity-0 group-hover/msg:opacity-100 transition-opacity ${isUser ? "justify-end" : "justify-start"}`}>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(msg.content)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-ink-ghost hover:text-accent hover:bg-accent-mist/50 transition-colors"
              title="复制"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              复制
            </button>
            {!isUser && (
              <button
                type="button"
                onClick={() => handleCreateNoteFromMsg(msg.content)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-ink-ghost hover:text-accent hover:bg-accent-mist/50 transition-colors"
                title="创建笔记"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                创建笔记
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const handleContainerClick = () => {
    if (showConvList) setShowConvList(false);
    if (showSettings) { setShowSettings(false); setEditProfile(null); }
  };

  return (
    <div className="w-full h-full flex flex-col border-l border-paper-deep/30 bg-paper/40 relative" onClick={handleContainerClick}>
      {/* Header */}
      <div className="h-10 px-3 flex items-center justify-between border-b border-paper-deep/25 shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowConvList(!showConvList); if (!showConvList) setShowSettings(false); }}
            className="text-xs text-ink-soft hover:text-accent transition-colors flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {currentConv?.title || "AI 助手"}
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showConvList ? "rotate-180" : ""}`}><path d="M1 2l3 3 3-3" /></svg>
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleNewConversation(); }}
            className="w-6 h-6 flex items-center justify-center rounded text-ink-ghost hover:text-accent hover:bg-accent-mist transition-colors"
            title="新对话"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); setEditProfile(null); if (!showSettings) setShowConvList(false); }}
            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${showSettings ? "bg-accent-mist text-accent" : "text-ink-ghost hover:text-accent hover:bg-accent-mist"}`}
            title="AI 设置"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded text-ink-ghost hover:text-ink-soft hover:bg-paper-warm transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
          </button>
        </div>
      </div>

      {/* Settings dropdown - full width below header */}
      {showSettings && (
        <div className="absolute left-0 right-0 top-10 z-20 bg-cloud border-b border-paper-deep shadow-lg animate-dropdown rounded-b-xl" onClick={(e) => e.stopPropagation()}>
          <div className="px-3 py-3">
            {/* Profile list */}
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] text-ink-faint">AI 配置</label>
              <button
                type="button"
                onClick={handleNewProfile}
                className="text-[10px] text-accent hover:text-accent-light transition-colors"
              >+ 新建配置</button>
            </div>
            {profiles.length > 0 ? (
              <div className="space-y-1 mb-3">
                {profiles.map((p) => (
                  <div
                    key={p.id}
                    className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${p.id === activeProfileId
                      ? "bg-accent-mist/50 border border-accent/30"
                      : "bg-paper-warm/40 border border-transparent hover:border-paper-deep/30"
                      }`}
                    onClick={() => handleSelectProfile(p.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${p.id === activeProfileId ? "bg-accent" : "bg-ink-ghost/30"}`} />
                      <span className="text-xs text-ink-soft">{p.name}</span>
                      <span className="text-[10px] text-ink-ghost">({p.model})</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditProfile(editProfile?.id === p.id ? null : p); }}
                        className="w-5 h-5 flex items-center justify-center rounded text-ink-ghost hover:text-accent hover:bg-accent-mist/50 transition-colors"
                        title="编辑"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteProfile(p.id); }}
                        className="w-5 h-5 flex items-center justify-center rounded text-ink-ghost hover:text-danger hover:bg-danger-bg transition-colors"
                        title="删除"
                      >
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2l8 8M10 2l-8 8" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[10px] text-ink-ghost mb-3 py-4 text-center">暂无配置，请点击上方「新建配置」</div>
            )}

            {/* Edit form - only show when editing */}
            {editProfile && (
              <div className="border-t border-paper-deep/25 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] text-ink-soft font-medium">
                    {editProfile.id ? "编辑配置" : "新建配置"}
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditProfile(null as any)}
                    className="text-[10px] text-ink-ghost hover:text-ink-soft transition-colors"
                  >取消</button>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-ink-faint block mb-0.5">配置名称</label>
                    <input
                      type="text"
                      value={editProfile.name}
                      onChange={(e) => setEditProfile((p) => p ? { ...p, name: e.target.value } : p)}
                      placeholder="我的 AI"
                      className="w-full bg-paper-warm/60 border border-paper-deep/30 rounded px-2.5 py-1.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-accent/40"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-ink-faint block mb-0.5">API 地址</label>
                    <input
                      type="text"
                      value={editProfile.base_url}
                      onChange={(e) => setEditProfile((p) => p ? { ...p, base_url: e.target.value } : p)}
                      placeholder="https://api.openai.com/v1"
                      className="w-full bg-paper-warm/60 border border-paper-deep/30 rounded px-2.5 py-1.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-accent/40"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-ink-faint block mb-0.5">API Key</label>
                      <input
                        type="password"
                        value={editProfile.api_key}
                        onChange={(e) => setEditProfile((p) => p ? { ...p, api_key: e.target.value } : p)}
                        placeholder="sk-..."
                        className="w-full bg-paper-warm/60 border border-paper-deep/30 rounded px-2.5 py-1.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-accent/40"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-ink-faint block mb-0.5">模型</label>
                      <input
                        type="text"
                        value={editProfile.model}
                        onChange={(e) => setEditProfile((p) => p ? { ...p, model: e.target.value } : p)}
                        placeholder="gpt-4o"
                        className="w-full bg-paper-warm/60 border border-paper-deep/30 rounded px-2.5 py-1.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-accent/40"
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-2">
                  <label className="text-[10px] text-ink-faint block mb-0.5">系统提示词（可选）</label>
                  <textarea
                    value={editProfile.system_prompt}
                    onChange={(e) => setEditProfile((p) => p ? { ...p, system_prompt: e.target.value } : p)}
                    placeholder="定义 AI 的角色和风格，例如：你是一个温柔的助手，喜欢用可爱的语气回答"
                    rows={3}
                    className="w-full bg-paper-warm/60 border border-paper-deep/30 rounded px-2.5 py-1.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-accent/40 resize-none"
                  />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-ink-faint block mb-0.5">上下文消息数</label>
                    <input
                      type="number"
                      value={editProfile.max_context_messages}
                      onChange={(e) => setEditProfile((p) => p ? { ...p, max_context_messages: Number(e.target.value) } : p)}
                      placeholder="20"
                      min={0}
                      className="w-full bg-paper-warm/60 border border-paper-deep/30 rounded px-2.5 py-1.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-accent/40"
                    />
                    <span className="text-[9px] text-ink-ghost mt-0.5 block">0 表示不限制</span>
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <input
                      type="checkbox"
                      id="enable-summary"
                      checked={editProfile.enable_summary}
                      onChange={(e) => setEditProfile((p) => p ? { ...p, enable_summary: e.target.checked } : p)}
                      className="w-3.5 h-3.5 accent-accent"
                    />
                    <label htmlFor="enable-summary" className="text-[10px] text-ink-faint">摘要记忆</label>
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <input
                      type="checkbox"
                      id="enable-thinking"
                      checked={editProfile.enable_thinking}
                      onChange={(e) => setEditProfile((p) => p ? { ...p, enable_thinking: e.target.checked } : p)}
                      className="w-3.5 h-3.5 accent-accent"
                    />
                    <label htmlFor="enable-thinking" className="text-[10px] text-ink-faint">深度思考</label>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    className="px-3 py-1 text-xs text-white bg-accent rounded hover:opacity-90 transition-opacity"
                  >保存</button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Conversation list dropdown */}
      {showConvList && (
        <div className="absolute left-0 right-0 top-10 z-20 bg-cloud border-b border-paper-deep shadow-lg animate-dropdown rounded-b-xl max-h-60 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          {conversations.length === 0 ? (
            <div className="px-3 py-2 text-xs text-ink-ghost">暂无对话</div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center justify-between px-3 py-1.5 cursor-pointer transition-colors ${conv.id === currentConvId ? "bg-accent-mist/50 text-accent" : "text-ink-soft hover:bg-paper-warm"
                  }`}
                onClick={() => { if (editingConvId !== conv.id) { setCurrentConvId(conv.id); setShowConvList(false); } }}
              >
                {editingConvId === conv.id ? (
                  <input
                    type="text"
                    value={editingConvTitle}
                    onChange={(e) => setEditingConvTitle(e.target.value)}
                    onBlur={handleConfirmRename}
                    onKeyDown={(e) => { if (e.key === "Enter") handleConfirmRename(); if (e.key === "Escape") setEditingConvId(null); }}
                    className="flex-1 text-xs bg-transparent outline-none"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-xs truncate flex-1">{conv.title}</span>
                )}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleStartRename(conv); }}
                    className="w-4 h-4 flex items-center justify-center text-ink-ghost hover:text-accent"
                    title="重命名"
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(conv.id); }}
                    className="w-4 h-4 flex items-center justify-center text-ink-ghost hover:text-danger"
                    title="删除"
                  >
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-ink-ghost">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-2 opacity-30">
              <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
              <path d="M7 10h10a2 2 0 0 1 2 2v2a8 8 0 0 1-16 0v-2a2 2 0 0 1 2-2z" />
            </svg>
            <p className="text-xs">开始和 AI 对话吧</p>
          </div>
        ) : (
          messages.map(renderMessage)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-3 pb-3 pt-1 shrink-0">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={currentConvId ? (activeProfile ? `${activeProfile.name} - 输入消息... (Enter 发送)` : "请先配置 AI") : "请先新建对话"}
            disabled={!currentConvId}
            rows={1}
            className="flex-1 resize-none bg-paper-warm/60 border border-paper-deep/30 rounded-lg px-3 py-2 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-accent/40 disabled:opacity-50"
            style={{ maxHeight: "80px" }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || !currentConvId || loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-30 shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-cloud rounded-xl border border-paper-deep shadow-xl p-4 w-[280px] animate-view-fade" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-ink-soft mb-3">确定删除这个对话吗？删除后无法恢复。</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1 text-xs text-ink-soft bg-paper-warm/60 border border-paper-deep/30 rounded hover:bg-paper-warm transition-colors"
              >取消</button>
              <button
                type="button"
                onClick={() => { handleDeleteConversation(deleteConfirmId); setDeleteConfirmId(null); }}
                className="px-3 py-1 text-xs text-white bg-danger rounded hover:opacity-90 transition-colors"
              >删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
