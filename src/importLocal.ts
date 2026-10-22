import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project, Board, Card, Kind } from "./model";
import { readLocalFile } from "./drops";

export function hasLocalWorkspace() {
  try {
    return (
      (
        JSON.parse(
          localStorage.getItem("stillroom-projects") || "[]",
        ) as unknown[]
      ).length > 0
    );
  } catch {
    return false;
  }
}

/** Copy this browser's demo into the signed-in account; leave the originals intact.
 * Stable ID mappings make a failed import resumable without duplicating projects.
 */
export async function importLocalWorkspace(
  client: SupabaseClient,
  userId: string,
  projectUrl: string,
  onProgress: (count: number) => void,
) {
  const projects = JSON.parse(
    localStorage.getItem("stillroom-projects") || "[]",
  ) as Project[];
  const boards = JSON.parse(
    localStorage.getItem("stillroom-boards") || "[]",
  ) as Board[];
  const cards = JSON.parse(
    localStorage.getItem("stillroom-cards") || "[]",
  ) as Card[];
  if (
    !Array.isArray(projects) ||
    !Array.isArray(boards) ||
    !Array.isArray(cards)
  )
    throw new Error(
      "The browser backup is not valid. The original data was left untouched.",
    );
  const key = `stillroom-import:${userId}:${projectUrl}`;
  const mapping = JSON.parse(
    localStorage.getItem(key) || '{"projects":{},"boards":{},"cards":{}}',
  ) as {
    projects: Record<string, string>;
    boards: Record<string, string>;
    cards: Record<string, string>;
  };
  const checkpoint = () => localStorage.setItem(key, JSON.stringify(mapping));
  const rpcBoard = async (name: string, args?: Record<string, string>) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return (Array.isArray(data) ? data[0] : data) as Board;
  };
  for (const p of projects) {
    if (mapping.projects[p.id]) continue;
    if (p.home_owner) {
      const home = await rpcBoard("get_home_canvas");
      mapping.projects[p.id] = home.project_id;
    } else {
      const { data, error } = await client.rpc("create_project", {
        p_title: p.title,
      });
      if (error) throw error;
      mapping.projects[p.id] = data as string;
    }
    checkpoint();
  }
  for (const b of boards) {
    if (mapping.boards[b.id] || !mapping.projects[b.project_id]) continue;
    const projectId = mapping.projects[b.project_id];
    if (b.is_project_canvas) {
      const result = await rpcBoard("get_project_canvas", {
        p_project: projectId,
      });
      mapping.boards[b.id] = result.id;
    } else {
      const id = crypto.randomUUID();
      const { error } = await client.from("boards").insert({
        id,
        project_id: projectId,
        title: b.title,
        description: b.description || "",
      });
      if (error) throw error;
      mapping.boards[b.id] = id;
    }
    checkpoint();
  }
  let imported = 0;
  for (const c of cards) {
    if (mapping.cards[c.id] || !mapping.boards[c.board_id]) continue;
    const id = crypto.randomUUID(),
      boardId = mapping.boards[c.board_id];
    const oldBoard = boards.find((b) => b.id === c.board_id)!;
    const projectId = mapping.projects[oldBoard.project_id];
    let content = c.content,
      uploadedPath: string | null = null;
    if (c.kind === "file" && c.content.startsWith("local:")) {
      const blob = await readLocalFile(c.content);
      uploadedPath = `${projectId}/${id}/${c.title.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const upload = await client.storage
        .from("attachments")
        .upload(uploadedPath, blob);
      if (upload.error) throw upload.error;
      content = uploadedPath;
    }
    const kinds: Kind[] = [
      "text",
      "image",
      "checklist",
      "link",
      "file",
      "group",
    ];
    if (!kinds.includes(c.kind))
      throw new Error(
        "An unsupported note type was found. The originals are unchanged.",
      );
    const note: Card = {
      id,
      board_id: boardId,
      title: c.title,
      content,
      kind: c.kind,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      color: c.color,
      version: 1,
    };
    const inserted = await client.from("cards").insert(note);
    if (inserted.error) {
      if (uploadedPath)
        await client.storage.from("attachments").remove([uploadedPath]);
      throw inserted.error;
    }
    if (uploadedPath) {
      const record = await client.from("attachments").insert({
        project_id: projectId,
        card_id: id,
        path: uploadedPath,
        name: c.title,
      });
      if (record.error) {
        await client.from("cards").delete().eq("id", id);
        await client.storage.from("attachments").remove([uploadedPath]);
        throw record.error;
      }
    }
    mapping.cards[c.id] = id;
    checkpoint();
    imported++;
    onProgress(imported);
  }
  // Tile layouts remain personal to this browser; remap IDs after copying.
  for (const scope of ["home", ...projects.map((p) => p.id)]) {
    const target = scope === "home" ? "home" : mapping.projects[scope];
    if (!target) continue;
    const sourceKey = `stillroom-layout:${scope}`;
    const targetKey = `stillroom-layout:${target}`;
    try {
      const source = JSON.parse(localStorage.getItem(sourceKey) || "{}");
      const layout = JSON.parse(localStorage.getItem(targetKey) || "{}");
      for (const [id, position] of Object.entries(source)) {
        const copied = mapping.projects[id] || mapping.boards[id];
        if (copied) layout[copied] = position;
      }
      localStorage.setItem(targetKey, JSON.stringify(layout));
    } catch {
      /* Damaged personal layouts do not prevent importing content. */
    }
  }
  localStorage.setItem(`stillroom-imported:${userId}:${projectUrl}`, "true");
  return imported;
}
