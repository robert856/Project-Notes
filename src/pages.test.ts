import { it, expect, vi, afterEach } from "vitest";
import {
  blankPage,
  ancestors,
  descendants,
  convertBrowserPages,
  PAGES_KEY,
} from "./pages";
afterEach(() => vi.unstubAllGlobals());
it("walks arbitrarily deep pages and identifies an entire subtree", () => {
  const a = blankPage(null),
    b = blankPage(a),
    c = blankPage(b),
    d = blankPage(c);
  expect(ancestors([a, b, c, d], d.id).map((p) => p.id)).toEqual([
    a.id,
    b.id,
    c.id,
    d.id,
  ]);
  expect(descendants([a, b, c, d], b.id)).toHaveLength(3);
  expect(() => ancestors([{ ...a, parent_id: b.id }, b], a.id)).toThrow(
    "hierarchy",
  );
});
it("converts legacy browser projects, boards and content without changing the originals", () => {
  const state = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => state.get(key) || null,
    setItem: (key: string, value: string) => state.set(key, value),
  });
  const old = JSON.stringify([{ id: "project", title: "Original" }]);
  state.set("stillroom-projects", old);
  state.set(
    "stillroom-boards",
    JSON.stringify([{ id: "board", project_id: "project", title: "Ideas" }]),
  );
  state.set(
    "stillroom-cards",
    JSON.stringify([
      {
        id: "old-card",
        board_id: "board",
        kind: "text",
        title: "Note",
        content: "Keep",
        x: 20,
        y: 30,
        width: 280,
        height: 230,
        color: "white",
        version: 1,
      },
    ]),
  );
  const result = convertBrowserPages();
  expect(result).toHaveLength(3);
  expect(result.find((p) => p.title === "Note")?.parent_id).toBe("board");
  expect(state.get("stillroom-projects")).toBe(old);
  expect(state.has(PAGES_KEY)).toBe(true);
  expect(convertBrowserPages()).toEqual(result);
});
