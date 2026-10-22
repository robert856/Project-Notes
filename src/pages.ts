import { demoBoards, demoCards, projectId, type Kind } from "./model";
export interface Page {
  id: string;
  parent_id: string | null;
  project_id: string;
  title: string;
  kind: Kind | "page";
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  version: number;
  deleted_at: string | null;
}
export interface PageChange {
  before: Page[];
  after: Page[];
}
export const PAGES_KEY = "stillroom-pages:v1";
export function ancestors(pages: Page[], id: string | null): Page[] {
  const chain: Page[] = [];
  const seen = new Set<string>();
  while (id) {
    if (seen.has(id)) throw new Error("Invalid page hierarchy");
    seen.add(id);
    const p = pages.find((p) => p.id === id);
    if (!p) break;
    chain.unshift(p);
    id = p.parent_id;
  }
  return chain;
}
export function descendants(pages: Page[], id: string): Page[] {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of pages)
      if (p.parent_id && ids.has(p.parent_id) && !ids.has(p.id)) {
        ids.add(p.id);
        changed = true;
      }
  }
  return pages.filter((p) => ids.has(p.id));
}
export function visiblePages(pages: Page[]) {
  return pages.filter(
    (p) => !p.deleted_at && ancestors(pages, p.id).every((a) => !a.deleted_at),
  );
}
export function mergePages(pages: Page[], changed: Page[]) {
  const map = new Map(pages.map((p) => [p.id, p]));
  for (const p of changed) map.set(p.id, p);
  return [...map.values()];
}
export function blankPage(
  parent: Page | null,
  kind: Page["kind"] = "page",
  title = "Untitled page",
): Page {
  const id = crypto.randomUUID();
  return {
    id,
    parent_id: parent?.id || null,
    project_id: parent?.project_id || id,
    title,
    kind,
    content: "",
    x: 100,
    y: 100,
    width: kind === "page" ? 170 : 280,
    height: kind === "page" ? 150 : 230,
    color: "white",
    version: 1,
    deleted_at: null,
  };
}
/** Copy legacy browser data once, without deleting or modifying the originals. */
export function convertBrowserPages(): Page[] {
  const stored = localStorage.getItem(PAGES_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed))
      throw new Error(
        "Browser pages could not be read. The original data is preserved.",
      );
    for (const p of parsed) ancestors(parsed, p.id);
    return parsed;
  }
  const projects = JSON.parse(
    localStorage.getItem("stillroom-projects") || "null",
  ) || [{ id: projectId, title: "True Myth: Addison’s Midnight Walk" }];
  const boards =
    JSON.parse(localStorage.getItem("stillroom-boards") || "null") ||
    demoBoards;
  const cards =
    JSON.parse(localStorage.getItem("stillroom-cards") || "null") || demoCards;
  const result: Page[] = [];
  const layout = (
    scope: string,
    id: string,
    fallback: { x: number; y: number },
  ) => {
    try {
      return (
        JSON.parse(localStorage.getItem(`stillroom-layout:${scope}`) || "{}")[
          id
        ] || fallback
      );
    } catch {
      return fallback;
    }
  };
  for (const p of projects) {
    if (!p.home_owner)
      result.push({
        ...blankPage(null, "page", p.title),
        id: p.id,
        project_id: p.id,
        ...layout("home", p.id, {
          x: 100 + (result.length % 5) * 220,
          y: 100 + Math.floor(result.length / 5) * 200,
        }),
      });
  }
  for (const b of boards) {
    if (b.is_project_canvas) continue;
    const parent = result.find((p) => p.id === b.project_id) || null;
    result.push({
      ...blankPage(parent, "page", b.title),
      id: b.id,
      project_id: b.project_id,
      content: b.description || "",
      ...layout(parent?.id || "home", b.id, {
        x:
          100 +
          (result.filter((p) => p.parent_id === (parent?.id || null)).length %
            5) *
            220,
        y:
          100 +
          Math.floor(
            result.filter((p) => p.parent_id === (parent?.id || null)).length /
              5,
          ) *
            200,
      }),
    });
  }
  for (const c of cards) {
    const b = boards.find((b: { id: string }) => b.id === c.board_id);
    if (!b) continue;
    const parent =
      result.find(
        (p) => p.id === (b.is_project_canvas ? b.project_id : b.id),
      ) || null;
    result.push({
      ...blankPage(parent, c.kind, c.title),
      ...c,
      id: /^[a-f0-9-]{36}$/.test(c.id) ? c.id : crypto.randomUUID(),
      parent_id: parent?.id || null,
      project_id: b.project_id,
      version: 1,
      deleted_at: null,
    });
  }
  localStorage.setItem(PAGES_KEY, JSON.stringify(result));
  return result;
}

/** Depth-first navigation order, without limiting the supported nesting depth. */
export function pageTree(pages: Page[]): Page[] {
  const children = new Map<string | null, Page[]>();
  for (const p of pages)
    children.set(p.parent_id, [...(children.get(p.parent_id) || []), p]);
  const stack = [...(children.get(null) || [])].reverse(),
    result: Page[] = [];
  const seen = new Set<string>();
  while (stack.length) {
    const p = stack.pop()!;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    result.push(p);
    stack.push(...[...(children.get(p.id) || [])].reverse());
  }
  return result;
}

export function availablePosition(siblings: Page[], width = 280, height = 230) {
  let x = 100,
    y = 100;
  while (
    siblings.some(
      (p) =>
        x < p.x + p.width + 24 &&
        x + width + 24 > p.x &&
        y < p.y + p.height + 24 &&
        y + height + 24 > p.y,
    )
  ) {
    x += 340;
    if (x > 1120) {
      x = 100;
      y += 280;
    }
  }
  return { x, y };
}

/** Container pages keep the compact tile presentation at every nesting level. */
export function pageSize(page: Page) {
  return page.kind === "page"
    ? { width: 170, height: 150 }
    : { width: page.width, height: page.height };
}
