export type Alignment =
  "left" | "center" | "right" | "top" | "middle" | "bottom";
export interface Rectangle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Align against the bounding box of the selected cards, including their sizes. */
export function alignCards<T extends Rectangle>(
  cards: T[],
  alignment: Alignment,
): T[] {
  if (cards.length < 2) return cards;
  const left = Math.min(...cards.map((c) => c.x));
  const right = Math.max(...cards.map((c) => c.x + c.width));
  const top = Math.min(...cards.map((c) => c.y));
  const bottom = Math.max(...cards.map((c) => c.y + c.height));
  return cards.map((c) => ({
    ...c,
    x:
      alignment === "left"
        ? left
        : alignment === "center"
          ? (left + right - c.width) / 2
          : alignment === "right"
            ? right - c.width
            : c.x,
    y:
      alignment === "top"
        ? top
        : alignment === "middle"
          ? (top + bottom - c.height) / 2
          : alignment === "bottom"
            ? bottom - c.height
            : c.y,
  }));
}

/** Equal edge-to-edge gaps in current spatial order; expand to a 24px gap if crowded. */
export function distributeCards<T extends Rectangle>(
  cards: T[],
  axis: "horizontal" | "vertical",
): T[] {
  if (cards.length < 3) return cards;
  const horizontal = axis === "horizontal";
  const start = (c: T) => (horizontal ? c.x : c.y);
  const size = (c: T) => (horizontal ? c.width : c.height);
  const sorted = [...cards].sort(
    (a, b) => start(a) - start(b) || a.id.localeCompare(b.id),
  );
  const first = start(sorted[0]);
  const end = Math.max(...sorted.map((c) => start(c) + size(c)));
  const totalSize = sorted.reduce((sum, c) => sum + size(c), 0);
  const naturalGap = (end - first - totalSize) / (cards.length - 1);
  const gap = naturalGap < 0 ? 24 : naturalGap;
  let cursor = first;
  const positions = new Map<string, number>();
  for (const card of sorted) {
    positions.set(card.id, cursor);
    cursor += size(card) + gap;
  }
  return cards.map((c) => ({
    ...c,
    ...(horizontal ? { x: positions.get(c.id)! } : { y: positions.get(c.id)! }),
  }));
}
