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

import { distributeCards } from "./alignment";
it("distributes unequal-size cards with equal edge gaps without reordering the result", () => {
  const input = [
    { id: "c", x: 600, y: 600, width: 100, height: 100 },
    { id: "a", x: 0, y: 0, width: 100, height: 50 },
    { id: "b", x: 130, y: 100, width: 200, height: 150 },
  ];
  for (const axis of ["horizontal", "vertical"] as const) {
    const result = distributeCards(input, axis);
    expect(result.map((c) => c.id)).toEqual(["c", "a", "b"]);
    const [a, b, c] = [result[1], result[2], result[0]];
    if (axis === "horizontal") {
      expect(b.x - a.x - a.width).toBe(c.x - b.x - b.width);
      expect(c.x).toBe(600);
      expect(b.y).toBe(100);
    } else {
      expect(b.y - a.y - a.height).toBe(c.y - b.y - b.height);
      expect(c.y).toBe(600);
      expect(b.x).toBe(130);
    }
  }
  expect(input[2].x).toBe(130);
});
it("gives crowded cards positive gaps and ignores fewer than three cards", () => {
  const overlapping = [
    cards[0],
    { ...cards[1], x: 50 },
    { ...cards[0], id: "c", x: 25 },
  ];
  const result = distributeCards(overlapping, "horizontal").sort(
    (a, b) => a.x - b.x,
  );
  expect(result[1].x - result[0].x - result[0].width).toBe(24);
  expect(result[2].x - result[1].x - result[1].width).toBe(24);
  expect(distributeCards(cards, "horizontal")).toEqual(cards);
});
