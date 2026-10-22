import { createClient } from "@supabase/supabase-js";
import type { Card } from "./model";
const env = import.meta.env;
export const db =
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
    ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
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
        ? "This card changed since you opened it. Your edit has not overwritten it. Refresh the board, then reapply your changes."
        : error.message,
    );
  return data as Card;
}
