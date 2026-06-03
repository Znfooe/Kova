import { useState, useCallback } from "react";

interface PanelResizeOptions {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  side?: "left" | "right";
}

export function usePanelResize({ storageKey, defaultWidth, minWidth, maxWidth, side = "right" }: PanelResizeOptions) {
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? Number(saved) : defaultWidth;
  });
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const startWidth = width;
    const onMouseMove = (e: MouseEvent) => {
      const delta = side === "right" ? e.clientX - startX : startX - e.clientX;
      const w = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
      setWidth(w);
    };
    const onMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [width, minWidth, maxWidth, side]);

  // Persist width changes
  const origSetWidth = setWidth;
  const persistWidth = useCallback((w: number | ((prev: number) => number)) => {
    origSetWidth((prev) => {
      const next = typeof w === "function" ? w(prev) : w;
      localStorage.setItem(storageKey, String(next));
      return next;
    });
  }, [storageKey]);

  return { width, setWidth: persistWidth, isDragging, handleMouseDown };
}
