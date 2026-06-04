import { useState, useCallback, useEffect, type RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import { undo, redo } from "@codemirror/commands";

interface ToolbarGroup {
  label: string;
  items: ToolbarItem[];
}

interface ToolbarItem {
  label: string;
  title: string;
  action: string;
  icon?: React.ReactNode;
  style?: string;
}

const TOOLBAR_GROUPS: ToolbarGroup[] = [
  {
    label: "文字",
    items: [
      { label: "B", title: "粗体 (Ctrl+B)", action: "bold", style: "font-bold" },
      { label: "I", title: "斜体 (Ctrl+I)", action: "italic", style: "italic" },
      { label: "S", title: "删除线", action: "strikethrough", style: "line-through" },
      { label: "`", title: "行内代码", action: "inline_code", style: "font-mono text-[11px]" },
      { label: "==", title: "高亮", action: "highlight" },
    ],
  },
  {
    label: "段落",
    items: [
      { label: "H1", title: "一级标题", action: "h1", style: "font-bold text-[11px]" },
      { label: "H2", title: "二级标题", action: "h2", style: "font-bold text-[11px]" },
      { label: "H3", title: "三级标题", action: "h3", style: "font-bold text-[11px]" },
      { label: "¶", title: "正文", action: "paragraph" },
      { label: "❝", title: "引用", action: "quote" },
      { label: "{ }", title: "代码块", action: "code_block", style: "font-mono text-[10px]" },
    ],
  },
  {
    label: "列表",
    items: [
      { label: "•", title: "无序列表", action: "ul" },
      { label: "1.", title: "有序列表", action: "ol" },
      { label: "☑", title: "任务列表", action: "task" },
    ],
  },
  {
    label: "插入",
    items: [
      { label: "—", title: "分割线", action: "hr" },
      { label: "🔗", title: "链接", action: "link" },
      { label: "🖼", title: "图片", action: "image" },
      { label: "▦", title: "表格", action: "table" },
      { label: "∑", title: "数学公式", action: "math" },
    ],
  },
  {
    label: "编辑",
    items: [
      { label: "↩", title: "撤销 (Ctrl+Z)", action: "undo" },
      { label: "↪", title: "重做 (Ctrl+Shift+Z)", action: "redo" },
      { label: "🔍", title: "查找替换 (Ctrl+H)", action: "find" },
    ],
  },
];

function applyAction(view: EditorView, action: string) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const before = view.state.sliceDoc(0, from);
  const lineStart = before.lastIndexOf("\n") + 1;
  const currentLine = before.slice(lineStart);
  const afterSel = view.state.sliceDoc(to);

  const insert = (text: string, cursorFrom: number, cursorTo: number) => {
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: cursorFrom, head: cursorTo },
    });
    view.focus();
  };

  const toggleLinePrefix = (marker: string) => {
    if (currentLine.startsWith(marker)) {
      view.dispatch({
        changes: { from: lineStart, to: lineStart + marker.length, insert: "" },
      });
    } else {
      view.dispatch({
        changes: { from: lineStart, to: lineStart, insert: marker },
      });
    }
    view.focus();
  };

  switch (action) {
    case "bold": {
      const text = selected || "粗体文本";
      insert(`**${text}**`, from + 2, from + 2 + text.length);
      break;
    }
    case "italic": {
      const text = selected || "斜体文本";
      insert(`*${text}*`, from + 1, from + 1 + text.length);
      break;
    }
    case "strikethrough": {
      const text = selected || "删除线文本";
      insert(`~~${text}~~`, from + 2, from + 2 + text.length);
      break;
    }
    case "inline_code": {
      const text = selected || "代码";
      insert(`\`${text}\``, from + 1, from + 1 + text.length);
      break;
    }
    case "highlight": {
      const text = selected || "高亮文本";
      insert(`==${text}==`, from + 2, from + 2 + text.length);
      break;
    }
    case "h1": toggleLinePrefix("# "); break;
    case "h2": toggleLinePrefix("## "); break;
    case "h3": toggleLinePrefix("### "); break;
    case "paragraph": {
      // Remove heading prefix if any
      const headingMatch = currentLine.match(/^#{1,6}\s/);
      if (headingMatch) {
        view.dispatch({
          changes: { from: lineStart, to: lineStart + headingMatch[0].length, insert: "" },
        });
        view.focus();
      }
      break;
    }
    case "quote": toggleLinePrefix("> "); break;
    case "code_block": {
      const text = selected || "代码";
      insert(`\`\`\`\n${text}\n\`\`\``, from + 4, from + 4 + text.length);
      break;
    }
    case "ul": toggleLinePrefix("- "); break;
    case "ol": toggleLinePrefix("1. "); break;
    case "task": toggleLinePrefix("- [ ] "); break;
    case "hr": {
      const nl1 = before.endsWith("\n") || before === "" ? "" : "\n";
      const nl2 = afterSel.startsWith("\n") || afterSel === "" ? "" : "\n";
      insert(`${nl1}---${nl2}`, from + nl1.length + 3, from + nl1.length + 3);
      break;
    }
    case "link": {
      const text = selected || "链接文本";
      insert(`[${text}](url)`, from + 1, from + 1 + text.length);
      break;
    }
    case "image": {
      const text = selected || "图片描述";
      insert(`![${text}](url)`, from + 2, from + 2 + text.length);
      break;
    }
    case "table": {
      const table = "\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n";
      insert(table, from + 3, from + 5);
      break;
    }
    case "math": {
      const text = selected || "E = mc^2";
      if (selected.includes("\n") || text.length > 30) {
        insert(`$$\n${text}\n$$`, from + 3, from + 3 + text.length);
      } else {
        insert(`$${text}$`, from + 1, from + 1 + text.length);
      }
      break;
    }
    case "undo": undo(view); view.focus(); break;
    case "redo": redo(view); view.focus(); break;
    case "find": {
      // Trigger CodeMirror's search panel
      const dom = view.dom;
      const event = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true });
      dom.dispatchEvent(event);
      break;
    }
  }
}

interface FormatToolbarProps {
  editorViewRef: RefObject<EditorView | null>;
}

export function FormatToolbar({ editorViewRef }: FormatToolbarProps) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  useEffect(() => {
    if (!expandedGroup) return;
    const close = () => setExpandedGroup(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [expandedGroup]);

  const handleAction = useCallback((action: string) => {
    const view = editorViewRef.current;
    if (!view) return;
    applyAction(view, action);
  }, [editorViewRef]);

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 shrink-0 border-b border-paper-deep/10">
      {TOOLBAR_GROUPS.map((group) => (
        <div key={group.label} className="relative flex items-center shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpandedGroup(expandedGroup === group.label ? null : group.label); }}
            className={`flex items-center gap-0.5 px-1.5 py-1 rounded text-[10px] transition-colors whitespace-nowrap ${
              expandedGroup === group.label ? "bg-accent-mist text-accent" : "text-ink-faint hover:text-ink-soft hover:bg-paper-warm"
            }`}
          >
            {group.label}
            <svg width="6" height="6" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${expandedGroup === group.label ? "rotate-90" : ""}`}>
              <path d="M2 1l4 3-4 3z"/>
            </svg>
          </button>
          {expandedGroup === group.label && (
            <div className="absolute top-full left-0 z-30 mt-1 bg-cloud border border-paper-deep shadow-lg rounded-lg p-1.5 flex flex-wrap gap-0.5 min-w-[140px] animate-dropdown"
              onClick={(e) => e.stopPropagation()}>
              {group.items.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  title={item.title}
                  onClick={() => { handleAction(item.action); setExpandedGroup(null); }}
                  className={`px-2 py-1 rounded text-[11px] text-ink-soft hover:bg-paper-warm hover:text-accent transition-colors whitespace-nowrap ${item.style ?? ""}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
