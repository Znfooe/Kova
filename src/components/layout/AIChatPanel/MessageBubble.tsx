import { MarkdownPreview } from "../../shared/MarkdownPreview";
import { ThinkingBlock } from "./ThinkingBlock";
import { parseThinkingContent } from "./utils";
import type { ChatMessage } from "./types";

interface MessageBubbleProps {
  msg: ChatMessage;
  index: number;
  totalMessages: number;
  loading: boolean;
  hasLastUserMsg: boolean;
  onCopy: (content: string) => void;
  onCreateNote: (content: string) => void;
  onRegenerate: () => void;
}

export function MessageBubble({ msg, index, totalMessages, loading, hasLastUserMsg, onCopy, onCreateNote, onRegenerate }: MessageBubbleProps) {
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
            ) : loading ? (
              <span className="text-ink-ghost animate-pulse">正在思考...</span>
            ) : (
              <span className="text-ink-ghost">（已停止）</span>
            )
          )}
        </div>
        {/* Action buttons below the bubble, shown on hover */}
        <div className={`flex items-center gap-0.5 mt-1 opacity-0 group-hover/msg:opacity-100 transition-opacity ${isUser ? "justify-end" : "justify-start"}`}>
          <button
            type="button"
            onClick={() => onCopy(msg.content)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-ink-ghost hover:text-accent hover:bg-accent-mist/50 transition-colors"
            title="复制"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            复制
          </button>
          {!isUser && (
            <>
              <button
                type="button"
                onClick={() => onCreateNote(msg.content)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-ink-ghost hover:text-accent hover:bg-accent-mist/50 transition-colors"
                title="创建笔记"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                创建笔记
              </button>
              {index === totalMessages - 1 && !loading && hasLastUserMsg && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-ink-ghost hover:text-accent hover:bg-accent-mist/50 transition-colors"
                  title="重新生成"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                  重新生成
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
