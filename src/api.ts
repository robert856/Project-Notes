import { createClient } from "@supabase/supabase-js";
import type { Card } from "./model";
import config from "./supabase-config.json";
const env = import.meta.env;
export const url = env.VITE_SUPABASE_URL || config.url;
const publicKey = env.VITE_SUPABASE_ANON_KEY || config.publishableKey;
export const db =
  env.VITE_LOCAL_DEMO === "true"
    ? null
    : url && publicKey
      ? createClient(url, publicKey)
      : null;
export async function saveCard(card: Card) {
  if (!db) return { ...card, version: card.version + 1 };
  const { data, error } = await db.rpc("save_card", {
    p_id: card.id,
    p_version: card.version,
    p_title: card.title,
    p_content: card.content,
    p_x: card.x,
    p_y: card.y,
    p_width: card.width,
    p_height: card.height,
    p_color: card.color,
  });
  if (error)
    throw new Error(
      error.message.includes("CONFLICT")
        ? "This note changed since you opened it. Your edit has not overwritten it. Refresh the board, then reapply your changes."
        : error.message,
    );
  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved?.id)
    throw new Error(
      "The server did not return the saved note. Refresh before continuing.",
    );
  return saved as Card;
}

import type { WorkspaceSnapshot } from "./undo";
export async function trashItems(
  kind: "projects" | "boards" | "cards",
  ids: string[],
  versions: Record<string, number> = {},
) {
  if (!db) return ids;
  const { data, error } = await db.rpc("trash_items", {
    p_kind: kind,
    p_ids: ids,
    p_versions: versions,
  });
  if (error)
    throw new Error(
      error.message.includes("trash_items")
        ? "Apply Supabase migration 002 to enable reversible deletion. Nothing was deleted."
        : error.message,
    );
  return data as string[];
}
export async function restoreWorkspace(
  before: WorkspaceSnapshot,
  current: WorkspaceSnapshot,
): Promise<WorkspaceSnapshot> {
  if (!db) return before;
  const { error } = await db.rpc("undo_workspace", {
    p_before: before,
    p_after: current,
  });
  if (error)
    throw new Error(
      error.message.includes("CONFLICT")
        ? "Undo stopped because someone changed an affected note. Refresh to review their changes."
        : error.message,
    );
  // Only refresh rows known to this history. Concurrently created rows must never
  // be mistaken for this user's creations by a later undo.
  const ids = (kind: keyof WorkspaceSnapshot) => [
    ...new Set([...before[kind], ...current[kind]].map((row) => row.id)),
  ];
  const [p, b, c] = await Promise.all([
    db.from("projects").select("*").in("id", ids("projects")),
    db.from("boards").select("*").in("id", ids("boards")),
    db.from("cards").select("*").in("id", ids("cards")),
  ]);
  if (p.error || b.error || c.error)
    throw new Error(
      "Undo was applied, but refreshing shared data failed. Refresh the page before continuing.",
    );
  return { projects: p.data, boards: b.data, cards: c.data };
}
