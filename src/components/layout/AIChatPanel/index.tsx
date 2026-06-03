import { useState, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { classifyError, buildToolCallDisplay } from "./utils";
import { ProfileManager } from "./ProfileManager";
import { ConversationList } from "./ConversationList";
import { MessageBubble } from "./MessageBubble";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import type { Conversation, ChatMessage, AIProfile } from "./types";

interface AIChatPanelProps {
  onClose: () => void;
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
  const [deleteProfileConfirmId, setDeleteProfileConfirmId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastUserMsgRef = useRef<string>("");
  const abortRef = useRef<boolean>(false);
  const unlistenRef = useRef<(() => void) | null>(null);

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
    setEditProfile({ id: "", name: "", base_url: "", api_key: "", model: "", system_prompt: "", max_context_messages: 20, enable_summary: true, enable_thinking: true, temperature: 1.0, max_tokens: 0 });
  };

  const handleNewConversation = async () => {
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

  const handleTogglePinned = async (id: string) => {
    const pinned = await invoke<boolean>("toggle_conversation_pinned", { id });
    setConversations((prev) => {
      const updated = prev.map((c) => c.id === id ? { ...c, pinned } : c);
      return [...updated].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    });
  };

  const handleExportConversation = async (id: string) => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const destDir = await open({ directory: true });
    if (!destDir) return;
    const path = await invoke<string>("export_conversation", { id, destDir });
    alert(`已导出到：${path}`);
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
    abortRef.current = false;
    lastUserMsgRef.current = userMsg;

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

    const buildFullContent = () => {
      let parts = "";
      if (thinkingContent) {
        parts += `<!--KOVA_THINKING:${thinkingContent}-->`;
      }
      parts += streamedContent;
      const toolDisplay = buildToolCallDisplay(toolCalls);
      if (toolDisplay) {
        parts += toolDisplay;
        if (toolCalls.some(tc => !tc.done)) {
          parts += "\n\n⏳ 正在处理...";
        }
      }
      return parts;
    };

    const unlisten = await listen<{ type: string; data: string; conversation_id: string }>("ai-stream", (event) => {
      if (abortRef.current) return;
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
        toolCalls.length = 0;
        thinkingContent = "";
        setMessages((prev) => prev.map((m) =>
          m.id === streamingId ? { ...m, content: streamedContent || data } : m
        ));
      }
    });
    unlistenRef.current = unlisten;

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
        temperature: activeProfile.temperature || undefined,
        maxTokens: activeProfile.max_tokens || undefined,
      });
      console.log("[AI Chat] ai_chat_stream completed, streamedContent length:", streamedContent.length);

      const updated = await invoke<ChatMessage[]>("get_messages", { conversationId: convId });
      console.log("[AI Chat] Loaded messages from DB:", updated.map(m => ({
        id: m.id,
        role: m.role,
        contentLength: m.content?.length || 0,
        contentPreview: m.content?.slice(0, 50) || "",
      })));
      setMessages(updated);

      const conv = conversations.find((c) => c.id === convId);
      if (conv && conv.title === "新对话") {
        const shortTitle = userMsg.slice(0, 20) + (userMsg.length > 20 ? "..." : "");
        await invoke("update_conversation_title", { id: convId, title: shortTitle });
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, title: shortTitle } : c))
        );
      }
    } catch (err) {
      const error = classifyError(err);
      setMessages((prev) => prev.filter((m) => m.id !== streamingId));
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        conversation_id: convId,
        role: "system",
        content: `${error.icon} ${error.title}\n${error.message}`,
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

  const handleStop = () => {
    abortRef.current = true;
    unlistenRef.current?.();
    invoke("abort_ai").catch(() => {});
    flushSync(() => {
      setMessages((prev) => prev.map((m) =>
        m.id.startsWith("streaming-") ? { ...m, id: `stopped-${Date.now()}`, content: m.content || "（已停止）" } : m
      ));
      setLoading(false);
    });
    inputRef.current?.focus();
  };

  const handleRegenerate = () => {
    if (!lastUserMsgRef.current || !currentConvId || loading) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === "assistant") return prev.slice(0, -1);
      return prev;
    });
    setInput(lastUserMsgRef.current);
    setTimeout(() => handleSend(), 50);
  };

  const handleCreateNoteFromMsg = async (content: string) => {
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

  const handleContainerClick = () => {
    if (showConvList) setShowConvList(false);
    if (showSettings) { setShowSettings(false); setEditProfile(null); }
  };

  return (
    <div className="w-full h-full flex flex-col border-l border-paper-deep/30 bg-paper/40 relative min-w-[260px]" onClick={handleContainerClick}>
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
            onClick={(e) => { e.stopPropagation(); setShowSearch(!showSearch); if (showSearch) setSearchQuery(""); }}
            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${showSearch ? "bg-accent-mist text-accent" : "text-ink-ghost hover:text-accent hover:bg-accent-mist"}`}
            title="搜索消息"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </button>
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

      {/* Search bar */}
      {showSearch && (
        <div className="px-3 py-1.5 border-b border-paper-deep/25 shrink-0" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1.5 bg-paper-warm/60 border border-paper-deep/30 rounded-lg px-2 py-1">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-ghost shrink-0"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索对话内容..."
              autoFocus
              className="flex-1 min-w-0 bg-transparent text-[11px] text-ink-soft placeholder:text-ink-ghost focus:outline-none"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery("")}
                className="text-ink-ghost hover:text-accent transition-colors">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Settings dropdown */}
      {showSettings && (
        <div className="absolute left-0 right-0 top-10 z-20 bg-cloud border-b border-paper-deep shadow-lg animate-dropdown rounded-b-xl" onClick={(e) => e.stopPropagation()}>
          <ProfileManager
            profiles={profiles}
            activeProfileId={activeProfileId}
            editProfile={editProfile}
            onNewProfile={handleNewProfile}
            onSelectProfile={handleSelectProfile}
            onEditProfile={setEditProfile}
            onSaveProfile={handleSaveProfile}
            onDeleteProfile={(id) => setDeleteProfileConfirmId(id)}
          />
        </div>
      )}

      {/* Conversation list dropdown */}
      {showConvList && (
        <div className="absolute left-0 right-0 top-10 z-20 bg-cloud border-b border-paper-deep shadow-lg animate-dropdown rounded-b-xl max-h-60 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <ConversationList
            conversations={conversations}
            currentConvId={currentConvId}
            editingConvId={editingConvId}
            editingConvTitle={editingConvTitle}
            onSelect={(id) => { setCurrentConvId(id); setShowConvList(false); }}
            onStartRename={handleStartRename}
            onConfirmRename={handleConfirmRename}
            onCancelRename={() => setEditingConvId(null)}
            onEditingTitleChange={setEditingConvTitle}
            onTogglePinned={handleTogglePinned}
            onExport={handleExportConversation}
            onDelete={(id) => setDeleteConfirmId(id)}
          />
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
        ) : searchQuery.trim() ? (() => {
          const filtered = messages.filter(m => m.role !== "system" && m.content.toLowerCase().includes(searchQuery.toLowerCase()));
          return filtered.length > 0 ? (
            <>
              <p className="text-[10px] text-ink-ghost text-center py-1">找到 {filtered.length} 条消息</p>
              {filtered.map((msg, i) => (
                <MessageBubble key={msg.id} msg={msg} index={i} totalMessages={filtered.length} loading={loading} hasLastUserMsg={!!lastUserMsgRef.current} onCopy={(c) => navigator.clipboard.writeText(c)} onCreateNote={handleCreateNoteFromMsg} onRegenerate={handleRegenerate} />
              ))}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-ink-ghost">没有找到匹配的消息</p>
            </div>
          );
        })() : (
          messages.map((msg, i) => (
            <MessageBubble key={msg.id} msg={msg} index={i} totalMessages={messages.length} loading={loading} hasLastUserMsg={!!lastUserMsgRef.current} onCopy={(c) => navigator.clipboard.writeText(c)} onCreateNote={handleCreateNoteFromMsg} onRegenerate={handleRegenerate} />
          ))
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
          {loading ? (
            <button
              type="button"
              onClick={handleStop}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-danger text-white hover:opacity-90 transition-opacity shrink-0"
              title="停止生成"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="3" /></svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || !currentConvId}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-30 shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Delete confirmation dialogs */}
      {deleteConfirmId && (
        <DeleteConfirmDialog
          title="确定删除这个对话吗？删除后无法恢复。"
          onConfirm={() => { handleDeleteConversation(deleteConfirmId); setDeleteConfirmId(null); }}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}

      {deleteProfileConfirmId && (
        <DeleteConfirmDialog
          title="确定删除这个 AI 配置吗？"
          onConfirm={() => { handleDeleteProfile(deleteProfileConfirmId); setDeleteProfileConfirmId(null); }}
          onCancel={() => setDeleteProfileConfirmId(null)}
        />
      )}
    </div>
  );
}
