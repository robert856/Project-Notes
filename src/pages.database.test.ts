import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type { PageChange } from "./pages";
const pg = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const legacyRoot = "33333333-3333-4333-8333-333333333333",
  legacyBoard = "44444444-4444-4444-8444-444444444444",
  legacyCard = "55555555-5555-4555-8555-555555555555";
beforeAll(async () => {
  await pg.exec(`create schema auth;create schema storage;create role anon;create role authenticated;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 insert into auth.users values('${owner}','owner@example.com',now()),('${other}','other@example.com',now());`);
  for (const file of [
    "001_initial.sql",
    "002_reversible_delete.sql",
    "003_project_canvas.sql",
    "004_project_title_undo.sql",
    "005_home_canvas.sql",
    "006_move_boards.sql",
  ])
    await pg.exec(
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  await pg.exec(
    `insert into public.projects(id,title) values('${legacyRoot}','Existing project');insert into public.project_members values('${legacyRoot}','${owner}','owner');insert into public.boards(id,project_id,title) values('${legacyBoard}','${legacyRoot}','Existing board');insert into public.cards(id,board_id,title,kind,content) values('${legacyCard}','${legacyBoard}','Existing note','text','Keep this content');`,
  );
  await pg.exec(
    await readFile(
      new URL("../supabase/migrations/007_nested_pages.sql", import.meta.url),
      "utf8",
    ),
  );
  await pg.exec(
    `grant usage on schema public,auth,storage to authenticated;grant select on storage.objects to authenticated;set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`,
  );
}, 20000);
afterAll(() => pg.close());
async function rpc(sql: string, args: unknown[] = []) {
  return (
    await pg.query<{ result: PageChange }>(
      `select public.${sql} as result`,
      args,
    )
  ).rows[0].result;
}
async function make(parent: string | null, title = "Page", kind = "page") {
  return (await rpc("create_page($1,$2,$3)", [parent, title, kind])).after[0];
}
it("preserves existing project, board and note IDs as one page hierarchy", async () => {
  const rows = (
    await pg.query<{ id: string; parent_id: string | null; content: string }>(
      "select * from public.pages",
    )
  ).rows;
  expect(rows.find((p) => p.id === legacyRoot)?.parent_id).toBeNull();
  expect(rows.find((p) => p.id === legacyBoard)?.parent_id).toBe(legacyRoot);
  expect(rows.find((p) => p.id === legacyCard)?.content).toBe(
    "Keep this content",
  );
});
it("creates arbitrary nesting and prevents descendant/self cycles and stale moves", async () => {
  const a = await make(null),
    b = await make(a.id),
    c = await make(b.id),
    d = await make(c.id);
  await expect(
    rpc("move_page($1,$2,$3)", [a.id, a.version, d.id]),
  ).rejects.toThrow("descendants");
  const moved = await rpc("move_page($1,$2,$3)", [c.id, c.version, null]);
  expect(moved.after.find((p) => p.id === c.id)?.parent_id).toBeNull();
  expect(moved.after.find((p) => p.id === d.id)?.parent_id).toBe(c.id);
  await expect(
    rpc("move_page($1,$2,$3)", [c.id, c.version, a.id]),
  ).rejects.toThrow("CONFLICT");
});
it("atomically saves text, rejects stale edits and does not partially save a batch", async () => {
  const a = await make(null),
    b = await make(a.id);
  await rpc("save_pages($1)", [
    JSON.stringify([{ id: a.id, version: a.version, title: "New title" }]),
  ]);
  await expect(
    rpc("save_pages($1)", [
      JSON.stringify([
        { id: b.id, version: b.version, title: "Should roll back" },
        { id: a.id, version: a.version, title: "Stale" },
      ]),
    ]),
  ).rejects.toThrow("CONFLICT");
  expect(
    (
      await pg.query<{ title: string }>(
        "select title from public.pages where id=$1",
        [b.id],
      )
    ).rows[0].title,
  ).toBe("Page");
});
it("inherits viewer/editor permissions and hides outsider data", async () => {
  const a = await make(null),
    b = await make(a.id);
  await pg.exec(
    `reset role;insert into public.project_members values('${a.project_id}','${other}','viewer');set role authenticated;select set_config('request.jwt.claim.sub','${other}',false);`,
  );
  expect(
    (await pg.query("select * from public.pages where id=$1", [b.id])).rows,
  ).toHaveLength(1);
  await expect(make(b.id)).rejects.toThrow("Edit access");
  await expect(
    rpc("save_pages($1)", [
      JSON.stringify([{ id: b.id, version: b.version, title: "Forbidden" }]),
    ]),
  ).rejects.toThrow("CONFLICT");
  await pg.exec(
    `reset role;delete from public.project_members where project_id='${a.project_id}' and user_id='${other}';set role authenticated;`,
  );
  expect(
    (await pg.query("select * from public.pages where id=$1", [b.id])).rows,
  ).toHaveLength(0);
  await pg.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
});
it("moves complete subtrees and transfers private file access without copying blobs", async () => {
  const source = await make(null),
    target = await make(null),
    child = await make(source.id),
    file = await make(child.id, "Private.pdf", "file");
  const path = `${source.project_id}/${file.id}/private.pdf`;
  await pg.exec(
    `reset role;insert into public.project_members values('${source.project_id}','${other}','editor');insert into storage.objects(bucket_id,name) values('attachments','${path}');set role authenticated;`,
  );
  const attached = await rpc("attach_page_file($1,$2,$3)", [
    file.id,
    file.version,
    path,
  ]);
  const moved = await rpc("move_page($1,$2,$3)", [
    child.id,
    child.version,
    target.id,
  ]);
  expect(moved.after.every((p) => p.project_id === target.project_id)).toBe(
    true,
  );
  await pg.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
  expect(
    (await pg.query("select * from storage.objects where name=$1", [path]))
      .rows,
  ).toHaveLength(0);
  await pg.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
  expect(
    (await pg.query("select * from storage.objects where name=$1", [path]))
      .rows,
  ).toHaveLength(1);
  await rpc("restore_pages($1,$2)", [
    JSON.stringify(moved.before),
    JSON.stringify(moved.after),
  ]);
  await pg.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
  expect(
    (await pg.query("select * from storage.objects where name=$1", [path]))
      .rows,
  ).toHaveLength(1);
  await pg.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
  expect(attached.after[0].content).toBe(path);
});
it("deletes nested pages without confirmation, restores them, and refuses conflicting Undo", async () => {
  const a = await make(null),
    b = await make(a.id),
    c = await make(b.id);
  const deletion = await rpc("trash_pages($1)", [
    JSON.stringify({ [b.id]: b.version }),
  ]);
  expect(deletion.after).toHaveLength(2);
  expect(
    (await pg.query("select * from public.pages where id=$1", [c.id])).rows,
  ).toHaveLength(0);
  const undone = await rpc("restore_pages($1,$2)", [
    JSON.stringify(deletion.before),
    JSON.stringify(deletion.after),
  ]);
  expect(undone.after.every((p) => !p.deleted_at)).toBe(true);
  await expect(
    rpc("restore_pages($1,$2)", [
      JSON.stringify(deletion.before),
      JSON.stringify(deletion.after),
    ]),
  ).rejects.toThrow("CONFLICT");
});
it("rejects forged Undo cycles and direct table updates", async () => {
  const a = await make(null),
    b = await make(a.id);
  await expect(
    pg.query("update public.pages set parent_id=$1 where id=$2", [b.id, a.id]),
  ).rejects.toThrow("permission denied");
  await expect(
    rpc("restore_pages($1,$2)", [
      JSON.stringify([{ ...a, parent_id: b.id }]),
      JSON.stringify([a]),
    ]),
  ).rejects.toThrow("itself");
});
it("does not Undo a creation over a newly created child", async () => {
  const created = await rpc("create_page($1,$2)", [null, "New root"]);
  await make(created.after[0].id);
  await expect(
    rpc("restore_pages($1,$2)", [
      JSON.stringify(created.before),
      JSON.stringify(created.after),
    ]),
  ).rejects.toThrow("new children");
});
it("duplicates all nested pages atomically and Undo removes only the copy", async () => {
  const root = await make(null, "Original"),
    child = await make(root.id, "Child"),
    grandchild = await make(child.id, "Grandchild");
  const copy = await rpc("duplicate_page($1,$2)", [root.id, root.version]);
  expect(copy.after).toHaveLength(3);
  const newRoot = copy.after.find((p) => p.parent_id === null)!;
  expect(newRoot.title).toBe("Original — copy");
  expect(newRoot.project_id).not.toBe(root.project_id);
  expect(copy.after.every((p) => p.project_id === newRoot.project_id)).toBe(
    true,
  );
  await rpc("restore_pages($1,$2)", [
    JSON.stringify(copy.before),
    JSON.stringify(copy.after),
  ]);
  expect(
    (await pg.query("select * from public.pages where id=$1", [grandchild.id]))
      .rows,
  ).toHaveLength(1);
  expect(
    (await pg.query("select * from public.pages where id=$1", [newRoot.id]))
      .rows,
  ).toHaveLength(0);
});
it("blocks cached legacy clients from changing the preserved backup", async () => {
  await expect(
    pg.query("select public.create_project($1)", ["Legacy write"]),
  ).rejects.toThrow("permission denied");
  await expect(
    pg.query("select public.move_board($1,$2,$3)", [
      legacyBoard,
      legacyRoot,
      legacyRoot,
    ]),
  ).rejects.toThrow("permission denied");
  const page = await make(null, "New page after legacy freeze");
  expect(page.title).toBe("New page after legacy freeze");
});
