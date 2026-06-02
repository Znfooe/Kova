// Theme color utilities

export const DEFAULT_ACCENT_LIGHT = "#2d5a3d";
export const DEFAULT_PAPER_LIGHT = "#faf9f5";
export const DEFAULT_ACCENT_DARK = "#4ade80";
export const DEFAULT_PAPER_DARK = "#1a1a1e";

// Editor defaults
export const DEFAULT_FONT_SIZE = 14;
export const DEFAULT_LINE_HEIGHT = 1.9;
export const DEFAULT_FONT_WEIGHT = 400;
export const DEFAULT_FONT = "";
export const DEFAULT_AUTO_SAVE = true;
export const DEFAULT_AUTO_SAVE_DELAY = 800;
export const DEFAULT_TAB_SIZE = 2;
export const DEFAULT_VIEW_MODE = "split";
export const DEFAULT_SPLIT_RATIO = 50;
export const DEFAULT_QUICK_PINNED = true;
export const DEFAULT_QUICK_SHORTCUT = "Ctrl+Shift+N";

// Preset fonts (only system default)
export const PRESET_FONTS = [
  { name: "系统默认", value: "" },
];

// Downloadable fonts (open source)
export const DOWNLOADABLE_FONTS = [
  { name: "LXGW WenKai", file: "LXGWWenKai-Regular.woff2", url: "https://github.com/lxgw/LxgwWenKai/releases/download/v1.501/LXGWWenKai-Regular.woff2" },
];

export type ThemeMode = "light" | "dark";

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function applyAccentVars(hex: string, mode: ThemeMode) {
  const [h, s, l] = hexToHsl(hex);
  const root = document.documentElement;
  root.style.setProperty("--color-accent", hex);
  root.style.setProperty("--color-accent-light", hslToHex(h, Math.max(s - 5, 0), Math.min(l + 15, 85)));
  if (mode === "dark") {
    // 深色模式：mist 和 glow 更暗
    root.style.setProperty("--color-accent-mist", hslToHex(h, Math.min(s, 30), 20));
    root.style.setProperty("--color-accent-glow", hslToHex(h, Math.min(s, 25), 15));
  } else {
    root.style.setProperty("--color-accent-mist", hslToHex(h, Math.min(s, 30), 93));
    root.style.setProperty("--color-accent-glow", hslToHex(h, Math.min(s, 25), 88));
  }
}

function applyPaperVars(hex: string, mode: ThemeMode) {
  const [h, s, l] = hexToHsl(hex);
  const root = document.documentElement;
  root.style.setProperty("--color-paper", hex);
  if (mode === "dark") {
    // 深色模式：paper-warm 更浅（悬停用），paper-deep 更深
    root.style.setProperty("--color-paper-warm", hslToHex(h, Math.min(s + 2, 40), Math.min(l + 4, 25)));
    root.style.setProperty("--color-paper-deep", hslToHex(h, Math.min(s + 4, 45), Math.max(l - 3, 5)));
  } else {
    // 浅色模式：paper-warm 和 paper-deep 更深
    root.style.setProperty("--color-paper-warm", hslToHex(h, Math.min(s + 2, 40), Math.max(l - 2, 85)));
    root.style.setProperty("--color-paper-deep", hslToHex(h, Math.min(s + 4, 45), Math.max(l - 5, 80)));
  }
}

// Mode management
export function loadMode(): ThemeMode {
  return localStorage.getItem("fp-mode") === "dark" ? "dark" : "light";
}

export function saveMode(mode: ThemeMode) {
  localStorage.setItem("fp-mode", mode);
}

// Per-mode color storage
export function loadAccent(mode: ThemeMode): string {
  return localStorage.getItem(`fp-accent-${mode}`) || (mode === "dark" ? DEFAULT_ACCENT_DARK : DEFAULT_ACCENT_LIGHT);
}

export function saveAccent(mode: ThemeMode, hex: string) {
  localStorage.setItem(`fp-accent-${mode}`, hex);
}

export function loadPaper(mode: ThemeMode): string {
  return localStorage.getItem(`fp-paper-${mode}`) || (mode === "dark" ? DEFAULT_PAPER_DARK : DEFAULT_PAPER_LIGHT);
}

export function savePaper(mode: ThemeMode, hex: string) {
  localStorage.setItem(`fp-paper-${mode}`, hex);
}

// Editor settings
export function loadFontSize(): number {
  return Number(localStorage.getItem("fp-font-size")) || DEFAULT_FONT_SIZE;
}

export function saveFontSize(size: number) {
  localStorage.setItem("fp-font-size", String(size));
}

export function loadLineHeight(): number {
  return Number(localStorage.getItem("fp-line-height")) || DEFAULT_LINE_HEIGHT;
}

export function saveLineHeight(height: number) {
  localStorage.setItem("fp-line-height", String(height));
}

// Font settings
export function loadFont(): string {
  return localStorage.getItem("fp-font") || DEFAULT_FONT;
}

export function saveFont(font: string) {
  localStorage.setItem("fp-font", font);
}

export function loadFontWeight(): number {
  return Number(localStorage.getItem("fp-font-weight")) || DEFAULT_FONT_WEIGHT;
}

export function saveFontWeight(weight: number) {
  localStorage.setItem("fp-font-weight", String(weight));
}

export function loadCustomFonts(): string[] {
  try {
    return JSON.parse(localStorage.getItem("fp-custom-fonts") || "[]");
  } catch {
    return [];
  }
}

export function saveCustomFonts(fonts: string[]) {
  localStorage.setItem("fp-custom-fonts", JSON.stringify(fonts));
}

// Auto-save settings
export function loadAutoSave(): boolean {
  const val = localStorage.getItem("fp-auto-save");
  return val === null ? DEFAULT_AUTO_SAVE : val === "true";
}

export function saveAutoSave(enabled: boolean) {
  localStorage.setItem("fp-auto-save", String(enabled));
}

export function loadAutoSaveDelay(): number {
  return Number(localStorage.getItem("fp-auto-save-delay")) || DEFAULT_AUTO_SAVE_DELAY;
}

export function saveAutoSaveDelay(delay: number) {
  localStorage.setItem("fp-auto-save-delay", String(delay));
}

export function loadTabSize(): number {
  return Number(localStorage.getItem("fp-tab-size")) || DEFAULT_TAB_SIZE;
}

export function saveTabSize(size: number) {
  localStorage.setItem("fp-tab-size", String(size));
}

// View mode settings
export function loadViewMode(): string {
  return localStorage.getItem("fp-view-mode") || DEFAULT_VIEW_MODE;
}

export function saveViewMode(mode: string) {
  localStorage.setItem("fp-view-mode", mode);
}

export function loadSplitRatio(): number {
  return Number(localStorage.getItem("fp-split-ratio")) || DEFAULT_SPLIT_RATIO;
}

export function saveSplitRatio(ratio: number) {
  localStorage.setItem("fp-split-ratio", String(ratio));
}

// Quick note settings
export function loadQuickPinned(): boolean {
  const val = localStorage.getItem("fp-quick-pinned");
  return val === null ? DEFAULT_QUICK_PINNED : val === "true";
}

export function saveQuickPinned(pinned: boolean) {
  localStorage.setItem("fp-quick-pinned", String(pinned));
}

// Quick note shortcut
export function loadQuickShortcut(): string {
  return localStorage.getItem("fp-quick-shortcut") || DEFAULT_QUICK_SHORTCUT;
}

export function saveQuickShortcut(shortcut: string) {
  localStorage.setItem("fp-quick-shortcut", shortcut);
}

// Apply full theme for a mode
export function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
  applyPaperVars(loadPaper(mode), mode);
  applyAccentVars(loadAccent(mode), mode);
  // Apply editor settings
  const root = document.documentElement;
  root.style.setProperty("--editor-font-size", `${loadFontSize()}px`);
  root.style.setProperty("--editor-line-height", String(loadLineHeight()));
  root.style.setProperty("--editor-font-weight", String(loadFontWeight()));
  // Apply font
  const font = loadFont();
  const fallback = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif';
  root.style.setProperty("--app-font", font ? `"${font}", ${fallback}` : fallback);
}

// Load custom font file
export async function loadCustomFont(name: string, path: string): Promise<void> {
  const fontFace = new FontFace(name, `url(${path})`);
  await fontFace.load();
  document.fonts.add(fontFace);
}

// Load all custom fonts on startup, remove invalid ones
export async function loadAllCustomFonts(dataDir: string): Promise<void> {
  const fonts = loadCustomFonts();
  const valid: string[] = [];
  for (const fontName of fonts) {
    try {
      const path = `${dataDir}/fonts/${fontName}`;
      await loadCustomFont(fontName, path);
      valid.push(fontName);
    } catch {
      // Font file not found, skip
    }
  }
  if (valid.length !== fonts.length) {
    saveCustomFonts(valid);
  }
}
