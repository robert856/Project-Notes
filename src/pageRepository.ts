import { db } from "./api";
import {
  PAGES_KEY,
  ancestors,
  descendants,
  blankPage,
  convertBrowserPages,
  mergePages,
  type Page,
  type PageChange,
} from "./pages";
import { readLocalFile, storeLocalFile } from "./drops";
async function rpc(
  name: string,
  args: Record<string, unknown>,
): Promise<PageChange> {
  const { data, error } = await db!.rpc(name, args);
  if (error)
    throw new Error(
      error.message.includes("CONFLICT")
        ? "This page changed or access was lost. Your changes were not saved. Refresh to review the latest version."
        : error.message,
    );
  return data as PageChange;
}
export async function loadPages(): Promise<Page[]> {
  if (!db) return convertBrowserPages();
  const rows: Page[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from("pages")
      .select("*")
      .order("id")
      .range(offset, offset + 499);
    if (error) throw new Error("Could not load pages: " + error.message);
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
function localChange(
  ids: string[],
  mutate: (pages: Page[]) => Page[],
): PageChange {
  const pages = convertBrowserPages(),
    before = pages.filter((p) => ids.includes(p.id)),
    after = mutate(pages);
  localStorage.setItem(PAGES_KEY, JSON.stringify(mergePages(pages, after)));
  return { before, after };
}
function check(page: Page | undefined, version: number): asserts page is Page {
  if (!page || page.version !== version)
    throw new Error("This page changed. Refresh before trying again.");
}
export async function createPage(
  parent: Page | null,
  kind: Page["kind"],
  title: string,
  content = "",
  x = 100,
  y = 100,
) {
  if (db)
    return rpc("create_page", {
      p_parent: parent?.id || null,
      p_title: title,
      p_kind: kind,
      p_content: content,
      p_x: x,
      p_y: y,
    });
  return localChange([], () => [
    { ...blankPage(parent, kind, title), content, x, y },
  ]);
}
export async function savePages(
  edits: (Partial<Page> & { id: string; version: number })[],
) {
  if (db) return rpc("save_pages", { p_edits: edits });
  return localChange(
    edits.map((p) => p.id),
    (pages) =>
      edits.map((edit) => {
        const p = pages.find((p) => p.id === edit.id);
        check(p, edit.version);
        return { ...p, ...edit, version: p.version + 1 };
      }),
  );
}
export async function movePage(
  page: Page,
  parent: Page | null,
  x = 100,
  y = 100,
) {
  if (db)
    return rpc("move_page", {
      p_id: page.id,
      p_version: page.version,
      p_parent: parent?.id || null,
      p_x: x,
      p_y: y,
    });
  const all = convertBrowserPages();
  check(
    all.find((p) => p.id === page.id),
    page.version,
  );
  if (parent && ancestors(all, parent.id).some((p) => p.id === page.id))
    throw new Error("A page cannot be moved inside itself or its descendants.");
  const ids = descendants(all, page.id).map((p) => p.id);
  return localChange(ids, (pages) =>
    pages
      .filter((p) => ids.includes(p.id))
      .map((p) => ({
        ...p,
        project_id: parent?.project_id || page.project_id,
        parent_id: p.id === page.id ? parent?.id || null : p.parent_id,
        x: p.id === page.id ? x : p.x,
        y: p.id === page.id ? y : p.y,
        version: p.version + 1,
      })),
  );
}
export async function trashPages(targets: Page[]) {
  if (db)
    return rpc("trash_pages", {
      p_versions: Object.fromEntries(targets.map((p) => [p.id, p.version])),
    });
  const all = convertBrowserPages();
  for (const p of targets)
    check(
      all.find((v) => v.id === p.id),
      p.version,
    );
  const ids = new Set(
    targets.flatMap((p) => descendants(all, p.id).map((p) => p.id)),
  );
  return localChange([...ids], (pages) =>
    pages
      .filter((p) => ids.has(p.id))
      .map((p) => ({
        ...p,
        deleted_at: new Date().toISOString(),
        version: p.version + 1,
      })),
  );
}
export async function restorePages(change: PageChange) {
  if (db)
    return rpc("restore_pages", {
      p_before: change.before,
      p_after: change.after,
    });
  return localChange(
    change.after.map((p) => p.id),
    (pages) =>
      change.after.map((expected) => {
        const p = pages.find((p) => p.id === expected.id);
        check(p, expected.version);
        const before = change.before.find((p) => p.id === expected.id);
        if (
          !before &&
          pages.some(
            (c) =>
              c.parent_id === p.id &&
              !c.deleted_at &&
              !change.after.some((a) => a.id === c.id),
          )
        )
          throw new Error("This page has new children. Undo stopped.");
        return before
          ? { ...before, version: p.version + 1 }
          : {
              ...p,
              deleted_at: new Date().toISOString(),
              version: p.version + 1,
            };
      }),
  );
}
export async function addFile(page: Page, file: File): Promise<PageChange> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Files must be 20 MiB or smaller.");
  if (!db) {
    const path = "local:" + crypto.randomUUID();
    await storeLocalFile(path, file);
    return savePages([{ id: page.id, version: page.version, content: path }]);
  }
  const path = `${page.project_id}/${page.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await db.storage.from("attachments").upload(path, file);
  if (error) throw error;
  try {
    return await rpc("attach_page_file", {
      p_id: page.id,
      p_version: page.version,
      p_path: path,
    });
  } catch (error) {
    await db.storage.from("attachments").remove([path]);
    throw error;
  }
}
export async function fileUrl(page: Page) {
  if (page.content.startsWith("local:"))
    return URL.createObjectURL(await readLocalFile(page.content));
  if (!db) throw new Error("This file requires a connected account.");
  const { data, error } = await db.storage
    .from("attachments")
    .createSignedUrl(page.content, 60);
  if (error) throw error;
  return data.signedUrl;
}
export async function duplicatePage(page: Page) {
  if (db)
    return rpc("duplicate_page", { p_id: page.id, p_version: page.version });
  const all = convertBrowserPages();
  check(
    all.find((p) => p.id === page.id),
    page.version,
  );
  const tree = descendants(all, page.id).filter((p) => !p.deleted_at);
  const ids = new Map(tree.map((p) => [p.id, crypto.randomUUID()]));
  const project = page.parent_id ? page.project_id : ids.get(page.id)!;
  return localChange([], () =>
    tree.map((p) => ({
      ...p,
      id: ids.get(p.id)!,
      parent_id: p.id === page.id ? page.parent_id : ids.get(p.parent_id!)!,
      project_id: project,
      title: p.title + (p.id === page.id ? " — copy" : ""),
      x: p.x + (p.id === page.id ? 35 : 0),
      y: p.y + (p.id === page.id ? 35 : 0),
      version: 1,
    })),
  );
}
