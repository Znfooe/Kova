import { useCallback, useRef, useState } from "react";

export function useDraggable() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const start = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    start.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setOffset({ x: e.clientX - start.current.x, y: e.clientY - start.current.y });
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [offset]);

  return { offset, onMouseDown };
}
