export const DOCK_INSET = 7;
export const DOCK_TABS = 3;
export const clampDockPosition = (value: number) => Math.max(0, Math.min(DOCK_TABS - 1, value));
export const dockCellWidth = (width: number) => Math.max(0, (width - DOCK_INSET * 2) / DOCK_TABS);
export function dockTabAt(x: number, width: number) {
  const cell = dockCellWidth(width);
  return cell ? clampDockPosition(Math.floor((x - DOCK_INSET) / cell)) : 0;
}
export function dockDragPosition(start: number, dx: number, width: number) {
  const cell = dockCellWidth(width);
  return cell ? clampDockPosition(start + dx / cell) : start;
}
/** A little hysteresis avoids rapid haptics when a finger rests on a boundary. */
export function dockCandidate(position: number, previous: number) {
  return Math.abs(position - previous) > .56 ? Math.round(clampDockPosition(position)) : previous;
}
