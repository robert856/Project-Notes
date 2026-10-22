import { it, expect } from "vitest";
import { alignCards, type Alignment } from "./alignment";
const cards = [
  { id: "a", x: 20, y: 30, width: 100, height: 80 },
  { id: "b", x: 300, y: 200, width: 200, height: 120 },
];
it("aligns unequal-size rectangles using their actual edges and centers", () => {
  for (const direction of [
    "left",
    "center",
    "right",
    "top",
    "middle",
    "bottom",
  ] as Alignment[]) {
    const [a, b] = alignCards(cards, direction);
    const horizontal = ["left", "center", "right"].includes(direction);
    const value = (c: typeof a) =>
      direction === "left"
        ? c.x
        : direction === "center"
          ? c.x + c.width / 2
          : direction === "right"
            ? c.x + c.width
            : direction === "top"
              ? c.y
              : direction === "middle"
                ? c.y + c.height / 2
                : c.y + c.height;
    expect(value(a)).toBe(value(b));
    expect(horizontal ? a.y : a.x).toBe(horizontal ? cards[0].y : cards[0].x);
  }
  expect(cards[1].x).toBe(300);
});
it("leaves fewer than two cards in place", () => {
  expect(alignCards([], "left")).toEqual([]);
  expect(alignCards(cards.slice(0, 1), "right")).toEqual(cards.slice(0, 1));
});
