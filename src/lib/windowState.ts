import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

const win = getCurrentWindow();

export function restoreWindowSize() {
  const maximized = localStorage.getItem("fp-window-maximized") === "true";
  const savedW = localStorage.getItem("fp-window-width");
  const savedH = localStorage.getItem("fp-window-height");

  if (maximized) {
    win.maximize();
    return;
  }

  if (savedW && savedH) {
    const nw = Number(savedW);
    const nh = Number(savedH);
    if (nw >= 400 && nh >= 300) {
      win.setSize(new LogicalSize(nw, nh));
      win.center();
    }
  }
}

export function listenWindowSize() {
  win.onResized(async () => {
    const isMaximized = await win.isMaximized();
    localStorage.setItem("fp-window-maximized", String(isMaximized));
    if (!isMaximized) {
      const size = await win.outerSize();
      const w = size.width;
      const h = size.height;
      if (w >= 400 && h >= 300) {
        localStorage.setItem("fp-window-width", String(Math.round(w)));
        localStorage.setItem("fp-window-height", String(Math.round(h)));
      }
    }
  });
}
