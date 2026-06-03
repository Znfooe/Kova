import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownPreviewProps {
  content: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button type="button" onClick={handleCopy}
      className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] text-ink-ghost bg-paper-deep/40 hover:text-accent hover:bg-accent-mist/60 transition-colors opacity-0 group-hover/code:opacity-100">
      {copied ? "✓" : "复制"}
    </button>
  );
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  if (!content.trim()) {
    return <p className="text-ink-ghost leading-[1.9]">暂无内容</p>;
  }

  return (
    <div className="markdown-body">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            const codeChild = Array.isArray(children) ? children.find((c: React.ReactNode) => c && (c as React.ReactElement).type === "code") as React.ReactElement | undefined : undefined;
            const codeText = codeChild?.props?.children?.[0] ?? (typeof children === "string" ? children : "");
            return (
              <div className="relative group/code">
                <CopyButton text={typeof codeText === "string" ? codeText : ""} />
                <pre>{children}</pre>
              </div>
            );
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
