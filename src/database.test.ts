import { afterAll, beforeAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const pg = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const project = "33333333-3333-4333-8333-333333333333",
  board = "44444444-4444-4444-8444-444444444444",
  card = "55555555-5555-4555-8555-555555555555";
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
  ])
    await pg.exec(
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  await pg.exec(`grant usage on schema public,auth,storage to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;revoke update on public.cards from authenticated;grant select on storage.objects to authenticated;
 insert into public.projects(id,title) values('${project}','Test project');insert into public.project_members values('${project}','${owner}','owner');
 insert into public.boards(id,project_id,title) values('${board}','${project}','Test note');
 insert into public.cards(id,board_id,title,kind) values('${card}','${board}','First note','text');
 insert into storage.objects(bucket_id,name) values('attachments','${project}/test.png');
 set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
}, 20000);
afterAll(async () => pg.close());
async function snapshot() {
  const p = await pg.query("select * from public.projects"),
    b = await pg.query("select * from public.boards"),
    c = await pg.query("select * from public.cards");
  return { projects: p.rows, boards: b.rows, cards: c.rows };
}
it("hides a deleted project and descendants, then restores memberships and notes atomically", async () => {
  const before = await snapshot();
  await pg.query("select public.trash_items($1,$2)", ["projects", [project]]);
  const after = await snapshot();
  expect((await pg.query("select * from storage.objects")).rows).toHaveLength(
    0,
  );
  expect(after.projects).toHaveLength(0);
  expect(after.boards).toHaveLength(0);
  expect(after.cards).toHaveLength(0);
  await pg.query("select public.undo_workspace($1,$2)", [
    JSON.stringify(before),
    JSON.stringify(after),
  ]);
  const restored = await snapshot();
  expect(restored.projects).toHaveLength(1);
  expect(restored.boards).toHaveLength(1);
  expect(restored.cards).toHaveLength(1);
  expect((await pg.query("select * from storage.objects")).rows).toHaveLength(
    1,
  );
  expect(
    (await pg.query("select * from public.project_members")).rows,
  ).toHaveLength(1);
});
it("deletes a version-matched note and rejects an outsider restoring it", async () => {
  const before = await snapshot();
  expect(
    (
      await pg.query<{ trash_items: string[] }>(
        "select public.trash_items($1,$2,$3)",
        ["cards", [card], JSON.stringify({ [card]: 99 })],
      )
    ).rows[0].trash_items,
  ).toEqual([]);
  await pg.query("select public.trash_items($1,$2,$3)", [
    "cards",
    [card],
    JSON.stringify({ [card]: 1 }),
  ]);
  const after = await snapshot();
  expect(after.cards).toHaveLength(0);
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [
    other,
  ]);
  await expect(
    pg.query("select public.undo_workspace($1,$2)", [
      JSON.stringify(before),
      JSON.stringify(after),
    ]),
  ).rejects.toThrow("Access denied");
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [
    owner,
  ]);
  await pg.query("select public.undo_workspace($1,$2)", [
    JSON.stringify(before),
    JSON.stringify(after),
  ]);
  expect((await snapshot()).cards).toHaveLength(1);
});
it("rejects a conflicting undo without replacing a newer note edit", async () => {
  const before = await snapshot();
  const version = (before.cards[0] as { version: number }).version;
  const save = async (v: number, title: string) =>
    pg.query("select public.save_card($1,$2,$3,$4,0,0,280,230,$5)", [
      card,
      v,
      title,
      "",
      "white",
    ]);
  await pg.query("update public.boards set title=$1 where id=$2", [
    "Renamed note",
    board,
  ]);
  await save(version, "My change");
  const after = await snapshot();
  await save(version + 1, "Someone else changed it");
  await expect(
    pg.query("select public.undo_workspace($1,$2)", [
      JSON.stringify(before),
      JSON.stringify(after),
    ]),
  ).rejects.toThrow("CONFLICT");
  expect(
    (await pg.query<{ title: string }>("select title from public.cards"))
      .rows[0].title,
  ).toBe("Someone else changed it");
});

it("viewers cannot delete projects or notes through reversible-deletion functions", async () => {
  await pg.exec(
    `reset role;insert into public.project_members values('${project}','${other}','viewer');set role authenticated;`,
  );
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [
    other,
  ]);
  for (const [kind, id] of [
    ["projects", project],
    ["boards", board],
    ["cards", card],
  ]) {
    const current = (
      await pg.query<{ version: number }>(
        "select version from public.cards where id=$1",
        [card],
      )
    ).rows[0].version;
    const result = await pg.query<{ trash_items: string[] }>(
      "select public.trash_items($1,$2,$3)",
      [kind, [id], JSON.stringify({ [card]: current })],
    );
    expect(result.rows[0].trash_items).toEqual([]);
  }
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [
    owner,
  ]);
});

it("creates one authorized shared project canvas and denies viewers", async () => {
  const first = await pg.query<{
    get_project_canvas: { id: string; is_project_canvas: boolean };
  }>("select to_jsonb(public.get_project_canvas($1)) as get_project_canvas", [
    project,
  ]);
  const again = await pg.query<{ get_project_canvas: { id: string } }>(
    "select to_jsonb(public.get_project_canvas($1)) as get_project_canvas",
    [project],
  );
  expect(first.rows[0].get_project_canvas.is_project_canvas).toBe(true);
  expect(first.rows[0].get_project_canvas.id).toBe(
    again.rows[0].get_project_canvas.id,
  );
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [
    other,
  ]);
  await expect(
    pg.query(
      "select to_jsonb(public.get_project_canvas($1)) as get_project_canvas",
      [project],
    ),
  ).rejects.toThrow("Access denied");
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [
    owner,
  ]);
});
