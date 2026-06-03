import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { db } from "../../../lib/db";
import { ConfirmDialog } from "../../dialog/ConfirmDialog";
import { ColorRow, ToggleRow, SliderRow, FontRow, TabSizeRow, ViewModeRow } from "./ui-rows";
import {
  loadAccent, saveAccent,
  loadPaper, savePaper, applyTheme,
  loadFontSize, saveFontSize, loadLineHeight, saveLineHeight,
  loadFont, saveFont, loadFontWeight, saveFontWeight,
  loadCustomFonts, saveCustomFonts, loadCustomFont,
  loadAutoSave, saveAutoSave, loadAutoSaveDelay, saveAutoSaveDelay,
  loadTabSize, saveTabSize,
  loadViewMode, saveViewMode, loadSplitRatio, saveSplitRatio,
  loadQuickPinned, saveQuickPinned,
  loadQuickShortcut, saveQuickShortcut,
  DEFAULT_ACCENT_LIGHT, DEFAULT_PAPER_LIGHT, DEFAULT_ACCENT_DARK, DEFAULT_PAPER_DARK,
  DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT, DEFAULT_FONT_WEIGHT, DEFAULT_FONT,
  PRESET_FONTS, DOWNLOADABLE_FONTS,
  DEFAULT_AUTO_SAVE_DELAY, DEFAULT_TAB_SIZE,
  DEFAULT_VIEW_MODE, DEFAULT_SPLIT_RATIO, DEFAULT_QUICK_SHORTCUT,
  type ThemeMode,
} from "../../../lib/theme";

interface SettingsPanelProps {
  onClose: () => void;
  onImported?: () => void;
  mode: ThemeMode;
}

export function SettingsPanel({ onClose, mode }: SettingsPanelProps) {
  const [autoStart, setAutoStart] = useState(() => localStorage.getItem("fp-autostart") === "true");
  const [closeToTray, setCloseToTray] = useState(() => localStorage.getItem("fp-close-to-tray") !== "false");
  const [dataDir, setDataDir] = useState("");
  const [accent, setAccent] = useState(() => loadAccent(mode));
  const [paper, setPaper] = useState(() => loadPaper(mode));
  const [fontSize, setFontSize] = useState(loadFontSize);
  const [lineHeight, setLineHeight] = useState(loadLineHeight);
  const [font, setFont] = useState(loadFont);
  const [fontWeight, setFontWeight] = useState(loadFontWeight);
  const [customFonts, setCustomFonts] = useState(loadCustomFonts);
  const [autoSave, setAutoSave] = useState(loadAutoSave);
  const [autoSaveDelay, setAutoSaveDelay] = useState(loadAutoSaveDelay);
  const [tabSize, setTabSize] = useState(loadTabSize);
  const [viewMode, setViewMode] = useState(loadViewMode);
  const [splitRatio, setSplitRatio] = useState(loadSplitRatio);
  const [quickPinned, setQuickPinned] = useState(loadQuickPinned);
  const [quickShortcut, setQuickShortcut] = useState(loadQuickShortcut);
  const [recording, setRecording] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "ok" | "err" } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [restorePath, setRestorePath] = useState<string | null>(null);

  useEffect(() => {
    db.getDataDir().then(setDataDir);
  }, []);

  useEffect(() => {
    localStorage.setItem("fp-autostart", String(autoStart));
  }, [autoStart]);

  useEffect(() => {
    localStorage.setItem("fp-close-to-tray", String(closeToTray));
  }, [closeToTray]);

  useEffect(() => {
    setAccent(loadAccent(mode));
    setPaper(loadPaper(mode));
  }, [mode]);

  const showMsg = (text: string, type: "ok" | "err") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 2000);
  };

  const handleAccentChange = (hex: string) => {
    setAccent(hex);
    saveAccent(mode, hex);
    applyTheme(mode);
  };

  const handlePaperChange = (hex: string) => {
    setPaper(hex);
    savePaper(mode, hex);
    applyTheme(mode);
  };

  const handleFontSizeChange = (size: number) => {
    setFontSize(size);
    saveFontSize(size);
    applyTheme(mode);
  };

  const handleLineHeightChange = (height: number) => {
    setLineHeight(height);
    saveLineHeight(height);
    applyTheme(mode);
  };

  const handleFontChange = (fontName: string) => {
    setFont(fontName);
    saveFont(fontName);
    const isCustom = customFonts.includes(fontName);
    if (isCustom) {
      showMsg("切换自定义字体需重启生效", "ok");
    } else {
      applyTheme(mode);
    }
  };

  const handleFontWeightChange = (weight: number) => {
    setFontWeight(weight);
    saveFontWeight(weight);
    applyTheme(mode);
  };

  const handleAutoSaveChange = (enabled: boolean) => {
    setAutoSave(enabled);
    saveAutoSave(enabled);
  };

  const handleAutoSaveDelayChange = (delay: number) => {
    setAutoSaveDelay(delay);
    saveAutoSaveDelay(delay);
  };

  const handleTabSizeChange = (size: number) => {
    setTabSize(size);
    saveTabSize(size);
  };

  useEffect(() => {
    if (!recording) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      const key = e.key.toUpperCase();
      if (!["CONTROL", "SHIFT", "ALT", "META"].includes(key)) {
        parts.push(key === " " ? "Space" : key);
        const combo = parts.join("+");
        setQuickShortcut(combo);
        saveQuickShortcut(combo);
        setRecording(false);
        invoke("update_quick_shortcut", { shortcut: combo }).catch(() => { });
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [recording]);

  const handleViewModeChange = (m: string) => {
    setViewMode(m);
    saveViewMode(m);
    window.dispatchEvent(new CustomEvent("fp-settings-changed", { detail: { key: "view-mode", value: m } }));
  };

  const handleSplitRatioChange = (r: number) => {
    setSplitRatio(r);
    saveSplitRatio(r);
    window.dispatchEvent(new CustomEvent("fp-settings-changed", { detail: { key: "split-ratio", value: r } }));
  };

  const handleQuickPinnedChange = (pinned: boolean) => {
    setQuickPinned(pinned);
    saveQuickPinned(pinned);
  };

  const handleImportFont = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "字体文件", extensions: ["ttf", "otf", "woff", "woff2"] }],
    });
    if (!selected) return;
    try {
      const fontName = `Custom-${Date.now()}`;
      const dataDir = await db.getDataDir();
      const fileName = (selected as string).split(/[/\\]/).pop() || "font.ttf";
      const destPath = `${dataDir}/fonts/${fileName}`;
      await invoke("copy_file", { src: selected, dest: destPath });
      await loadCustomFont(fontName, destPath);
      const updated = [...customFonts, fontName];
      setCustomFonts(updated);
      saveCustomFonts(updated);
      setFont(fontName);
      saveFont(fontName);
      applyTheme(mode);
      showMsg("字体导入成功", "ok");
    } catch (e) {
      showMsg(String(e), "err");
    }
  };

  const handleDownloadFont = async (font: { name: string; file: string; url: string }) => {
    try {
      const dataDir = await db.getDataDir();
      const destPath = `${dataDir}/fonts/${font.file}`;
      await invoke("download_font", { url: font.url, dest: destPath });
      const fontName = font.name.replace(/\s+/g, "-");
      const updated = [...customFonts, fontName];
      setCustomFonts(updated);
      saveCustomFonts(updated);
      showMsg(`${font.name} 下载成功，选择后需重启生效`, "ok");
    } catch (e) {
      showMsg(String(e), "err");
    }
  };

  const handleChooseDir = async () => {
    const selected = await open({ directory: true });
    if (selected) {
      const newPath = await db.setDataDir(selected);
      setDataDir(newPath);
    }
  };

  const handleBackup = async () => {
    const destDir = await open({ directory: true });
    if (!destDir) return;
    try {
      const settings: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("fp-")) {
          settings[key] = localStorage.getItem(key) || "";
        }
      }
      const dataDir = await invoke<string>("get_data_dir");
      await invoke("write_file", { path: `${dataDir}/kova-settings.json`, content: JSON.stringify(settings, null, 2) });
      const zipPath = await invoke<string>("backup_data", { destDir });
      showMsg(`已备份到 ${zipPath}`, "ok");
    } catch (e) {
      showMsg(String(e), "err");
    }
  };

  const handleRestore = async () => {
    const selected = await open({
      filters: [{ name: "备份文件", extensions: ["zip", "db", "json"] }],
    });
    if (!selected) return;
    setRestorePath(selected as string);
    setConfirmRestore(selected as string);
  };

  const doRestore = async () => {
    if (!restorePath) return;
    try {
      if (restorePath.endsWith(".zip")) {
        await invoke("restore_data", { srcPath: restorePath });
        try {
          const dataDir = await invoke<string>("get_data_dir");
          const settingsPath = `${dataDir}/kova-settings.json`;
          const content = await invoke<string>("read_file", { path: settingsPath });
          const settings = JSON.parse(content);
          if (settings && typeof settings === "object" && !Array.isArray(settings)) {
            for (const [key, value] of Object.entries(settings)) {
              if (key.startsWith("fp-") && typeof value === "string") {
                localStorage.setItem(key, value);
              }
            }
          }
        } catch {
          // Settings file not in zip, skip
        }
      } else {
        const dir = restorePath.replace(/[^/\\]+$/, "");
        const dbPath = restorePath.endsWith(".db") ? restorePath : `${dir}kova.db`;
        try {
          await invoke("restore_data", { srcPath: dbPath });
        } catch {
          // DB not found, skip
        }
        const settingsPath = restorePath.endsWith(".json") ? restorePath : `${dir}kova-settings.json`;
        try {
          const content = await invoke<string>("read_file", { path: settingsPath });
          const settings = JSON.parse(content);
          if (settings && typeof settings === "object" && !Array.isArray(settings)) {
            for (const [key, value] of Object.entries(settings)) {
              if (key.startsWith("fp-") && typeof value === "string") {
                localStorage.setItem(key, value);
              }
            }
          }
        } catch {
          // Settings file not found or invalid, skip
        }
      }
      setConfirmRestore(null);
      setRestorePath(null);
      await relaunch();
    } catch (e) {
      showMsg(String(e), "err");
    }
  };

  const defaultAccent = mode === "dark" ? DEFAULT_ACCENT_DARK : DEFAULT_ACCENT_LIGHT;
  const defaultPaper = mode === "dark" ? DEFAULT_PAPER_DARK : DEFAULT_PAPER_LIGHT;

  return (
    <aside className="w-full h-full shrink-0 border-l-2 border-paper-deep/60 bg-paper/92 backdrop-blur-sm flex flex-col min-w-[260px]">
      <div className="flex items-center justify-between h-11 px-4 border-b border-paper-deep/25 shrink-0">
        <h2 className="text-[13px] font-medium text-ink-soft">应用设置</h2>
        <button type="button" onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-ghost hover:text-ink-soft hover:bg-paper-warm transition-colors" title="关闭设置">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-5 min-h-0 min-w-[260px]">
        {/* 通用 */}
        <section className="space-y-2">
          <label className="block text-[11px] text-ink-faint">通用</label>
          <ToggleRow label="开机自启动" checked={autoStart} onChange={setAutoStart} />
          <ToggleRow label="关闭时最小化到托盘" checked={closeToTray} onChange={setCloseToTray} />
        </section>

        {/* 外观 */}
        <section className="space-y-2">
          <label className="block text-[11px] text-ink-faint">外观</label>
          <div className="flex items-center justify-between h-9 rounded-lg px-2.5 bg-paper-warm/45 border border-paper-deep/25">
            <span className="text-[12px] text-ink-soft">当前模式</span>
            <span className="text-[11px] text-ink-faint">{mode === "light" ? "浅色" : "深色"}</span>
          </div>
          <ColorRow label="背景色" value={paper} defaultVal={defaultPaper} onChange={handlePaperChange} />
          <ColorRow label="主题色" value={accent} defaultVal={defaultAccent} onChange={handleAccentChange} />
          <FontRow label="字体" value={font} presetFonts={PRESET_FONTS} customFonts={customFonts} downloadableFonts={DOWNLOADABLE_FONTS} defaultVal={DEFAULT_FONT} onChange={handleFontChange} onImport={handleImportFont} onDownload={handleDownloadFont} />
          <SliderRow label="字体大小" value={fontSize} min={12} max={20} step={1} unit="px" defaultVal={DEFAULT_FONT_SIZE} onChange={handleFontSizeChange} />
          <SliderRow label="字体粗细" value={fontWeight} min={100} max={900} step={100} unit="" defaultVal={DEFAULT_FONT_WEIGHT} onChange={handleFontWeightChange} />
          <SliderRow label="行高" value={lineHeight} min={1.4} max={2.4} step={0.1} unit="" defaultVal={DEFAULT_LINE_HEIGHT} onChange={handleLineHeightChange} />
          <p className="text-[10px] text-ink-ghost/75">通过标题栏月亮图标切换深浅色模式</p>
        </section>

        {/* 编辑器 */}
        <section className="space-y-2">
          <label className="block text-[11px] text-ink-faint">编辑器</label>
          <ToggleRow label="自动保存" checked={autoSave} onChange={handleAutoSaveChange} />
          {autoSave && (
            <SliderRow label="保存延迟" value={autoSaveDelay} min={500} max={2000} step={100} unit="ms" defaultVal={DEFAULT_AUTO_SAVE_DELAY} onChange={handleAutoSaveDelayChange} />
          )}
          <TabSizeRow label="Tab 缩进" value={tabSize} defaultVal={DEFAULT_TAB_SIZE} onChange={handleTabSizeChange} />
        </section>

        {/* 窗口 */}
        <section className="space-y-2">
          <label className="block text-[11px] text-ink-faint">窗口</label>
          <ViewModeRow label="默认视图" value={viewMode} defaultVal={DEFAULT_VIEW_MODE} onChange={handleViewModeChange} />
          <SliderRow label="分栏比例" value={splitRatio} min={30} max={70} step={5} unit="%" defaultVal={DEFAULT_SPLIT_RATIO} onChange={handleSplitRatioChange} />
        </section>

        {/* 便签 */}
        <section className="space-y-2">
          <label className="block text-[11px] text-ink-faint">便签</label>
          <ToggleRow label="默认钉住" checked={quickPinned} onChange={handleQuickPinnedChange} />
        </section>

        {/* 快捷键 */}
        <section className="space-y-2">
          <label className="block text-[11px] text-ink-faint">快捷键</label>
          <div className="flex items-center justify-between h-9 rounded-lg px-2.5 bg-paper-warm/45 border border-paper-deep/25">
            <span className="text-[12px] text-ink-soft">打开便签</span>
            <div className="flex items-center gap-1.5">
              <span className={`text-[12px] font-mono px-2 py-0.5 rounded ${recording ? "bg-accent-mist text-accent animate-pulse" : "text-ink-soft"}`}>
                {recording ? "按下快捷键..." : quickShortcut}
              </span>
              {recording ? (
                <button type="button" onClick={() => setRecording(false)}
                  className="text-[10px] text-ink-ghost hover:text-danger transition-colors">
                  取消
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => setRecording(true)}
                    className="text-[10px] text-ink-ghost hover:text-accent transition-colors">
                    录制
                  </button>
                  {quickShortcut !== DEFAULT_QUICK_SHORTCUT && (
                    <button type="button" onClick={() => { setQuickShortcut(DEFAULT_QUICK_SHORTCUT); saveQuickShortcut(DEFAULT_QUICK_SHORTCUT); invoke("update_quick_shortcut", { shortcut: DEFAULT_QUICK_SHORTCUT }).catch(() => { }); }}
                      className="text-[10px] text-ink-ghost hover:text-accent transition-colors">
                      重置
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between h-9 rounded-lg px-2.5 bg-paper-warm/45 border border-paper-deep/25">
            <span className="text-[12px] text-ink-soft">放大/缩小/重置</span>
            <span className="text-[12px] font-mono text-ink-soft">Ctrl+滚轮/0</span>
          </div>
        </section>

        {/* 数据存储 */}
        <section className="space-y-2">
          <label className="block text-[11px] text-ink-faint">数据存储</label>
          <div className="flex gap-2">
            <input type="text" value={dataDir} readOnly title="数据存储目录"
              className="min-w-0 flex-1 h-8 px-2.5 rounded-lg bg-paper-warm/45 border border-paper-deep/25 text-[11px] font-mono text-ink-soft truncate" />
            <button type="button" onClick={handleChooseDir}
              className="h-8 px-3 rounded-lg border border-paper-deep/45 text-[11px] text-ink-faint hover:text-accent hover:bg-accent-mist/50 transition-colors">
              更改
            </button>
          </div>
        </section>

        {/* 备份与恢复 */}
        <section className="space-y-2">
          <label className="block text-[11px] text-ink-faint">备份与恢复</label>
          <div className="flex gap-2">
            <button type="button" onClick={handleBackup}
              className="flex-1 h-9 rounded-lg border border-paper-deep/45 text-[12px] text-ink-faint hover:text-accent hover:bg-accent-mist/50 transition-colors flex items-center justify-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              备份数据
            </button>
            <button type="button" onClick={handleRestore}
              className="flex-1 h-9 rounded-lg border border-paper-deep/45 text-[12px] text-ink-faint hover:text-accent hover:bg-accent-mist/50 transition-colors flex items-center justify-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              恢复数据
            </button>
          </div>
        </section>

        {msg && (
          <div className={`text-[11px] px-3 py-2 rounded-lg ${msg.type === "ok" ? "text-accent bg-accent-mist" : "text-danger bg-danger-bg"}`}>
            {msg.text}
          </div>
        )}

        <section className="pt-2 border-t border-paper-deep/25">
          <p className="text-[10px] leading-relaxed text-ink-ghost/75">Kova v0.1.0 — 灵感来了，记一笔。</p>
        </section>
      </div>

      {confirmRestore && (
        <ConfirmDialog
          title="恢复数据"
          message="恢复将覆盖当前所有数据，确定继续吗？"
          danger
          confirmLabel="恢复"
          onConfirm={doRestore}
          onCancel={() => setConfirmRestore(null)}
        />
      )}
    </aside>
  );
}
