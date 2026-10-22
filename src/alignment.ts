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
