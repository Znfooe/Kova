import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

const win = getCurrentWindow();

export async function restoreWindowSize() {
  try {
    // 清除可能存在的旧物理像素数据（一次性迁移）
    const legacyW = localStorage.getItem("fp-window-width");
    if (legacyW && Number(legacyW) > 1400) {
      // 旧数据是物理像素，清除让窗口用默认尺寸
      localStorage.removeItem("fp-window-width");
      localStorage.removeItem("fp-window-height");
      localStorage.removeItem("fp-window-maximized");
    }

    const maximized = localStorage.getItem("fp-window-maximized") === "true";
    const savedW = localStorage.getItem("fp-window-width");
    const savedH = localStorage.getItem("fp-window-height");

    if (maximized) {
      await win.maximize();
    } else if (savedW && savedH) {
      const nw = Number(savedW);
      const nh = Number(savedH);
      // 额外检查：尺寸不能超过合理范围（逻辑像素一般不超过 2000）
      if (nw >= 400 && nh >= 300 && nw <= 2000 && nh <= 1400) {
        await win.setSize(new LogicalSize(nw, nh));
      }
      await win.center();
    } else {
      await win.center();
    }
  } catch (e) {
    console.error("restoreWindowSize error:", e);
  }

  // 无论如何都要显示窗口
  await win.show();
  await win.setFocus();
  // 通知后端窗口已显示，安全网不再触发
  await invoke("mark_window_shown");
}

export function listenWindowSize() {
  win.onResized(async () => {
    const isMaximized = await win.isMaximized();
    localStorage.setItem("fp-window-maximized", String(isMaximized));
    if (!isMaximized) {
      const size = await win.outerSize();
      const factor = await win.scaleFactor();
      // 物理像素转逻辑像素
      const logicalW = Math.round(size.width / factor);
      const logicalH = Math.round(size.height / factor);
      if (logicalW >= 400 && logicalH >= 300) {
        localStorage.setItem("fp-window-width", String(logicalW));
        localStorage.setItem("fp-window-height", String(logicalH));
      }
    }
  });
}
