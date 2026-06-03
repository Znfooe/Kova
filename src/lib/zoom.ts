const ZOOM_LEVELS = [0.75, 0.875, 1, 1.125, 1.25, 1.5];

export function loadZoom(): number {
  return Number(localStorage.getItem("fp-zoom")) || 1;
}

export function saveZoom(level: number) {
  localStorage.setItem("fp-zoom", String(level));
  document.documentElement.style.fontSize = `${level * 16}px`;
}

export function getZoomDelta(current: number, direction: number): number {
  const idx = ZOOM_LEVELS.indexOf(current);
  if (direction > 0) {
    return ZOOM_LEVELS[Math.min(idx + 1, ZOOM_LEVELS.length - 1)];
  }
  return ZOOM_LEVELS[Math.max(idx - 1, 0)];
}
