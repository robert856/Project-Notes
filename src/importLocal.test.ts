import { it, expect, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { importLocalWorkspace } from "./importLocal";
vi.mock("./drops", () => ({
  readLocalFile: async () => new Blob(["private file"], { type: "text/plain" }),
}));
afterEach(() => vi.unstubAllGlobals());
it("imports private browser files, keeps the originals, and resumes without duplicate projects or notes", async () => {
  const state = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => state.get(key) || null,
    setItem: (key: string, value: string) => state.set(key, value),
  });
  const projects = JSON.stringify([{ id: "p", title: "Local project" }]);
  state.set("stillroom-projects", projects);
  state.set(
    "stillroom-boards",
    JSON.stringify([
      { id: "b", project_id: "p", title: "Board", description: "" },
    ]),
  );
  state.set(
    "stillroom-cards",
    JSON.stringify([
      {
        id: "c",
        board_id: "b",
        title: "private.txt",
        content: "local:file",
        kind: "file",
        x: 1,
        y: 2,
        width: 280,
        height: 230,
        color: "white",
        version: 3,
      },
    ]),
  );
  const inserted: { table: string; row: Record<string, unknown> }[] = [];
  let fail = true;
  const remove = vi.fn(async () => ({ error: null }));
  const upload = vi.fn(async () => ({ error: null }));
  const rpc = vi.fn(async () => ({ data: "remote-project", error: null }));
  const client = {
    rpc,
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (table === "cards" && fail) {
          fail = false;
          return { error: new Error("Temporary failure") };
        }
        inserted.push({ table, row });
        return { error: null };
      },
    }),
    storage: { from: () => ({ upload, remove }) },
  } as unknown as SupabaseClient;
  await expect(
    importLocalWorkspace(
      client,
      "user",
      "https://project.supabase.co",
      () => {},
    ),
  ).rejects.toThrow("Temporary failure");
  expect(remove).toHaveBeenCalledOnce();
  expect(state.get("stillroom-projects")).toBe(projects);
  expect(
    await importLocalWorkspace(
      client,
      "user",
      "https://project.supabase.co",
      () => {},
    ),
  ).toBe(1);
  expect(rpc).toHaveBeenCalledOnce();
  expect(inserted.filter((v) => v.table === "boards")).toHaveLength(1);
  const note = inserted.find((v) => v.table === "cards")!.row;
  expect(note.version).toBe(1);
  expect(String(note.content)).toMatch(/^remote-project\//);
  expect(inserted.find((v) => v.table === "attachments")!.row.project_id).toBe(
    "remote-project",
  );
  expect(
    await importLocalWorkspace(
      client,
      "user",
      "https://project.supabase.co",
      () => {},
    ),
  ).toBe(0);
  expect(inserted.filter((v) => v.table === "cards")).toHaveLength(1);
  expect(state.get("stillroom-projects")).toBe(projects);
});
