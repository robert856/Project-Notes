export type Kind = "text" | "image" | "checklist" | "link" | "file" | "group";
export interface Card {
  id: string;
  board_id: string;
  title: string;
  content: string;
  kind: Kind;
  x: number;
  y: number;
  width: number;
  height: number;
  version: number;
  color: string;
}
export interface Board {
  is_project_canvas?: boolean;
  id: string;
  project_id: string;
  title: string;
  description: string;
}
export interface Project {
  home_owner?: string | null;
  id: string;
  title: string;
}
export const projectId = "10000000-0000-4000-8000-000000000001";
export const boardId = "20000000-0000-4000-8000-000000000001";
export const demoBoards: Board[] = [
  {
    id: boardId,
    project_id: projectId,
    title: "The story room",
    description: "A place for the world, the words, and everything in between.",
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    project_id: projectId,
    title: "Characters & creatures",
    description: "The souls that bring our story to life.",
  },
  {
    id: "20000000-0000-4000-8000-000000000003",
    project_id: projectId,
    title: "Visual direction",
    description: "Color, atmosphere, and a little bit of magic.",
  },
];
const card = (
  id: string,
  kind: Kind,
  title: string,
  content: string,
  x: number,
  y: number,
  width = 270,
  height = 220,
  color = "white",
): Card => ({
  id,
  board_id: boardId,
  kind,
  title,
  content,
  x,
  y,
  width,
  height,
  version: 1,
  color,
});
export const demoCards: Card[] = [
  card(
    "a",
    "text",
    "A small adventure.\nAn extraordinary night.",
    "When the world falls asleep, Addison steps outside. A familiar path becomes an unfamiliar world — and one quiet walk changes everything.",
    40,
    35,
    285,
    258,
    "cream",
  ),
  card(
    "b",
    "image",
    "The world after midnight",
    new URL("../public/images/midnight.svg", import.meta.url).href,
    365,
    35,
    285,
    310,
  ),
  card(
    "c",
    "text",
    "What if the forest remembered?",
    "The trees know stories we have forgotten. The moon is a little closer here. And the shadows are not quite what they seem.\n\nLet wonder lead. Let the answers arrive slowly.",
    690,
    35,
    270,
    250,
  ),
  card(
    "d",
    "checklist",
    "Before the next chapter",
    "[x] Find the heart of the story\n[x] Collect a little midnight inspiration\n[ ] Explore Addison’s backstory\n[ ] Sketch the first encounter\n[ ] Map the walk home",
    1000,
    35,
    285,
    290,
  ),
  card(
    "e",
    "text",
    "Addison",
    "Curious, even when afraid.\n\nAn old sweater. Mud on her shoes. A pocket full of things that might be useful.\n\n“Maybe getting lost is how you find it.”",
    40,
    335,
    285,
    285,
  ),
  card(
    "f",
    "link",
    "A soundtrack for wandering",
    "https://open.spotify.com",
    365,
    385,
    285,
    170,
    "lavender",
  ),
  card(
    "g",
    "image",
    "A light to follow",
    new URL("../public/images/moonlight.svg", import.meta.url).href,
    690,
    325,
    270,
    300,
  ),
  card(
    "h",
    "text",
    "Keep this feeling",
    "The hush just before something happens.\n\nNostalgic, but never old-fashioned. Magical, but always grounded in something real.",
    1000,
    365,
    285,
    220,
    "pink",
  ),
];
export function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function matches(title: string, content: string, query: string) {
  return `${title} ${content}`.toLowerCase().includes(query.toLowerCase());
}
