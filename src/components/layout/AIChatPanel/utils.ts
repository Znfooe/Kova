export function classifyError(err: unknown): { icon: string; title: string; message: string } {
  const msg = String(err);
  if (msg.includes("请求失败") || msg.includes("fetch") || msg.includes("network") || msg.includes("ECONNREFUSED") || msg.includes("timeout")) {
    return { icon: "🌐", title: "网络错误", message: "无法连接到 AI 服务器，请检查网络和 API 地址" };
  }
  if (msg.includes("401") || msg.includes("Unauthorized") || msg.includes("invalid_api_key")) {
    return { icon: "🔑", title: "认证失败", message: "API Key 无效，请检查配置" };
  }
  if (msg.includes("429") || msg.includes("rate") || msg.includes("quota") || msg.includes("limit")) {
    return { icon: "⏳", title: "配额不足", message: "API 调用频率超限或余额不足，请稍后再试" };
  }
  if (msg.includes("404") || msg.includes("model")) {
    return { icon: "🤖", title: "模型错误", message: "模型不存在或不可用，请检查模型名称" };
  }
  if (msg.includes("500") || msg.includes("502") || msg.includes("503")) {
    return { icon: "🔧", title: "服务器错误", message: "AI 服务器内部错误，请稍后再试" };
  }
  return { icon: "❌", title: "未知错误", message: msg.replace(/^错误:\s*/, "") };
}

export function getToolDisplayName(name: string, args: string): string {
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
}

export function parseThinkingContent(content: string): { thinking: string | null; main: string } {
  let match = content.match(/^<!--KOVA_THINKING:([\s\S]*?)-->\s*([\s\S]*)$/);
  if (match) {
    return { thinking: match[1].trim(), main: match[2].trim() };
  }
  match = content.match(/^<thinking>([\s\S]*?)<\/thinking>\s*([\s\S]*)$/);
  if (match) {
    return { thinking: match[1].trim(), main: match[2].trim() };
  }
  return { thinking: null, main: content };
}

export function buildToolCallDisplay(toolCalls: Array<{ name: string; args: string; done: boolean; startTime: number }>): string {
  if (toolCalls.length === 0) return "";
  return "\n\n" + toolCalls.map((tc, i) => {
    const icon = tc.done ? "✅" : "⏳";
    const name = getToolDisplayName(tc.name, tc.args);
    const isRunning = !tc.done && (i === toolCalls.length - 1 || !toolCalls[i + 1]?.done);
    return `${icon} ${name}${isRunning ? " 执行中..." : ""}`;
  }).join("\n");
}
