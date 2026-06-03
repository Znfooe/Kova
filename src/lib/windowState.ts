import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

const win = getCurrentWindow();

export function restoreWindowSize() {
  invoke<[number, number]>("get_window_size").then(() => {
    const savedW = localStorage.getItem("fp-window-width");
    const savedH = localStorage.getItem("fp-window-height");
    if (savedW && savedH) {
      const nw = Number(savedW);
      const nh = Number(savedH);
      if (nw >= 400 && nh >= 300) {
        win.setSize(new LogicalSize(nw, nh));
      }
    }
  });
}

export function listenWindowSize() {
  win.onResized(() => {
    invoke<[number, number]>("get_window_size").then(([w, h]) => {
      if (w >= 400 && h >= 300) {
        localStorage.setItem("fp-window-width", String(Math.round(w)));
        localStorage.setItem("fp-window-height", String(Math.round(h)));
      }
    });
  });
}
