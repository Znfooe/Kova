import { useCallback, type RefObject } from "react";

type FormatAction = "bold" | "italic" | "heading" | "hr" | "ul" | "ol" | "code" | "quote";

const BUTTONS: { label: string; title: string; action: FormatAction; style?: string }[] = [
  { label: "B", title: "粗体", action: "bold", style: "font-bold" },
  { label: "I", title: "斜体", action: "italic", style: "italic" },
  { label: "H", title: "标题", action: "heading", style: "font-bold" },
  { label: "—", title: "分割线", action: "hr" },
  { label: "•", title: "无序列表", action: "ul" },
  { label: "1.", title: "有序列表", action: "ol" },
  { label: "<>", title: "代码", action: "code" },
  { label: "\"", title: "引用", action: "quote" },
];

function applyFormat(textarea: HTMLTextAreaElement, action: FormatAction): { text: string; start: number; end: number } {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lineStart = before.lastIndexOf("\n") + 1;
  const currentLine = before.slice(lineStart);

  switch (action) {
    case "bold": {
      const fallback = "粗体文本";
      const wrapped = `**${selected || fallback}**`;
      return { text: before + wrapped + after, start: start + 2, end: start + 2 + (selected || fallback).length };
    }
    case "italic": {
      const fallback = "斜体文本";
      const wrapped = `*${selected || fallback}*`;
      return { text: before + wrapped + after, start: start + 1, end: start + 1 + (selected || fallback).length };
    }
    case "heading": {
      const prefix = currentLine.match(/^(#{1,5})\s/);
      if (prefix) {
        const newLevel = prefix[1].length < 5 ? "#".repeat(prefix[1].length + 1) : "#";
        const beforeLine = value.slice(0, lineStart);
        const afterPrefix = value.slice(lineStart + prefix[0].length);
        const offset = newLevel.length + 1 - prefix[0].length;
        return { text: beforeLine + newLevel + " " + afterPrefix, start: start + offset, end: end + offset };
      }
      if (currentLine.length > 0 && start === end) {
        return { text: value.slice(0, lineStart) + "## " + value.slice(lineStart), start: start + 3, end: start + 3 };
      }
      const fallback = selected || "标题";
      return { text: before + `## ${fallback}` + after, start: start + 3, end: start + 3 + fallback.length };
    }
    case "hr": {
      const nl1 = before.endsWith("\n") || before === "" ? "" : "\n";
      const nl2 = after.startsWith("\n") || after === "" ? "" : "\n";
      return { text: before + `${nl1}---${nl2}` + after, start: start + nl1.length + 3, end: start + nl1.length + 3 };
    }
    case "ul": {
      const fallback = selected || "列表项";
      return { text: before + `- ${fallback}` + after, start: start + 2, end: start + 2 + fallback.length };
    }
    case "ol": {
      const fallback = selected || "列表项";
      return { text: before + `1. ${fallback}` + after, start: start + 3, end: start + 3 + fallback.length };
    }
    case "code": {
      if (selected.includes("\n")) {
        return { text: before + `\`\`\`\n${selected}\n\`\`\`` + after, start: start + 4, end: start + 4 + selected.length };
      }
      const fallback = selected || "代码";
      return { text: before + `\`${fallback}\`` + after, start: start + 1, end: start + 1 + fallback.length };
    }
    case "quote": {
      const fallback = selected || "引用文本";
      return { text: before + `> ${fallback}` + after, start: start + 2, end: start + 2 + fallback.length };
    }
    default:
      return { text: value, start, end };
  }
}

interface FormatToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
}

export function FormatToolbar({ textareaRef, onChange }: FormatToolbarProps) {
  const handleClick = useCallback((action: FormatAction) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const result = applyFormat(textarea, action);
    onChange(result.text);
    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.start, result.end);
    });
  }, [textareaRef, onChange]);

  return (
    <div className="flex items-center gap-0.5 px-4 pt-2 pb-1 shrink-0">
      {BUTTONS.map((btn) => (
        <button
          key={btn.action}
          type="button"
          title={btn.title}
          onClick={() => handleClick(btn.action)}
          className={`w-7 h-7 flex items-center justify-center rounded text-[12px] text-ink-faint hover:text-ink-soft hover:bg-paper-warm transition-colors ${btn.style ?? ""}`}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}
