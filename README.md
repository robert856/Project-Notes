# Stillroom

A minimal visual workspace built with React, TypeScript, Vite, React Flow and Supabase. **Everything is a page. Pages can contain content and more pages at any depth.** The Home canvas contains your top-level pages. Text, images, links, checklists and files are content formats of a page, not separate hierarchy levels.

## Use pages

- Click **New page** or drag **Page** from the left toolbar onto the canvas. Click its title to rename it. Open it with its arrow or a double-click to see its content and nested pages.
- To-do pages edit directly in their blocks: click the title or a task to edit, type into **Add a to-do…** and press Enter (or click away) to add, and drag the grip beside a task up or down to reorder it. Completion marks move with tasks; Alt+↑/↓ on a grip also reorders. Changes save automatically, support Undo, and retain your draft on a version conflict.
- Use the text, image, link, checklist and private-file shortcuts to create pages with those content formats. Every format can contain child pages.
- Drag a page onto another page to nest it. The destination gets a subtle outline. **Only releasing the mouse commits the move.** Dragging away removes the highlight and leaves the page on the current canvas.
- Drag onto a breadcrumb at the top to move a page to that ancestor. Drop onto **Home** to make it top-level. Use **Move** for a searchable destination picker across other branches. Self/descendant destinations are excluded, and the database prevents cycles even for concurrent moves.
- Single-click selects. Shift-click or drag empty canvas to select multiple pages. **Arrange** aligns or distributes them. Drag or resize selected pages; positions and sizes are saved, including top-level pages.
- **Delete/Backspace deletes immediately**, without confirmation. Deleting a page hides all its descendants. **Ctrl+Z / Cmd+Z** or **Undo** restores it. Up to 30 operations are retained in the current session; reload/sign-out clears history. Text inputs retain native text undo. There is no redo.
- Duplicate copies a page and its complete subtree. Search covers titles and content at every accessible level; opening a result shows its full breadcrumb trail. Each fresh visit starts on Home.
- Drop URLs, YouTube links and computer files directly onto a canvas. YouTube pages show the standard thumbnail. Files are limited to 20 MiB. Supported private image attachments show a preview. Link metadata is not fetched from arbitrary sites.

## Development

Use Node 24 and npm:

```sh
npm ci
VITE_LOCAL_DEMO=true npm run dev
npm test
npx playwright test
npm run build
```

`VITE_LOCAL_DEMO=true` explicitly selects browser-local mode, even when public Supabase settings are present. Pages use `stillroom-pages:v1` in localStorage; files use IndexedDB `stillroom-files`. Clearing site data deletes local work and files. Demo data is not shared or authenticated.

The first local visit copies the older projects/boards/cards into nested pages without changing the originals. Existing positions and file keys are retained. An explicit **Import browser pages** action copies browser pages and files into a signed-in account. Imports keep their ID mapping so an interrupted import can resume without duplicating completed pages; originals remain intact.

Code is separated into the page model (`pages.ts`), persistence (`pageRepository.ts`), canvas/cards (`PageCanvas.tsx`), content editor (`PageEditor.tsx`), and application/navigation (`PagesApp.tsx`). The former project/board helpers and migrations remain as compatibility code and database backups; the active interface uses pages exclusively.

## Supabase setup

1. Create a Supabase project with the Data API enabled. Apply **all SQL migrations in order**, `001_initial.sql` through `007_nested_pages.sql`. Never run them against an unrelated schema. Migration 007 copies active legacy projects, boards and notes into `public.pages`, preserving their UUIDs and content. Original tables are retained as a backup; legacy mutation endpoints are disabled so cached clients fail visibly rather than writing to the old hierarchy. Run the conversion only once through the migration system.
2. Supply `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`, or use the generated public `src/supabase-config.json`. Only an anon/publishable client key belongs here. **Never put a service-role key or Supabase management token into Vite variables or client code.**
3. Enable email authentication and keep email verification enabled. In Authentication → URL Configuration, set Site URL and an allowed redirect URL to `https://robert856.github.io/Project-Notes/`. Add your local development URL separately if needed.
4. Configure custom SMTP before inviting external testers. Supabase's default sender restricts sign-in emails to project-team addresses. A first email-link sign-in creates a user's account. Every collaborator should use their own email and session.
5. Sign in, create a page, open it, create child pages, refresh, and test a private file download. Verify the email link returns to the deployed site.

The **Connect Supabase and deploy** GitHub Actions workflow can apply pending migrations using the repository secret `SUPABASE_ACCESS_TOKEN`, then verify RLS/private storage and deploy. The scoped token needs database/migration writes and API-key read access. Configuring authentication through the management API also requires `auth_config_write` and `project_admin_write`; when those are absent, set the dashboard URLs manually. The script preserves existing SMTP credentials and writes only the public frontend URL/key. Do not paste management tokens into chat.

## Sharing and permissions

New top-level pages start their own sharing group. Child pages inherit that group's **owner/editor/viewer** access. Only owners invite people. Editors create, edit, nest, move and delete pages; viewers read. The internal `projects` and `project_members` tables retain the sharing groups to preserve existing memberships and invitations.

Moving a page into another page transfers its **entire subtree** to the destination's sharing group in one transaction. You need edit permission in both groups. Moving to Home retains the current sharing group; it does not silently make shared pages private. Sharing changes apply to every page in the group, including pages later moved to Home. A newly duplicated top-level subtree starts its own owner-controlled group.

An invitation records the recipient's email; it does **not** send an invitation email. Send the Stillroom address separately. The recipient signs in with that verified email and refreshes to claim access. Existing members retain their current role. Member removal and role changes are not exposed in the MVP.

## Database and safety

`pages.parent_id` points to another page or is null for a top-level page. `pages.project_id` points to its inherited sharing group. `kind` controls content presentation only. RLS is enabled on all nine application/compatibility tables, including `pages`, `page_files` and the internal file-path registry. Clients have SELECT access to pages through RLS; changes go through permission-checked database functions.

- Creation, subtree moves/deletion, batch edits, duplication and Undo run transactionally. Hierarchy mutations share a transaction lock, preventing simultaneous moves from creating cycles.
- Every page has a version. Saves and moves compare it atomically. A stale edit fails with a visible warning and does not overwrite someone else's work. The content editor keeps the unsaved draft for reconciliation. Refresh to load saved changes. No real-time synchronization is used.
- Undo checks the versions of all affected pages and fails if another user changed them. It also refuses to Undo creation over newly added children. Multi-page saves fail atomically.
- Files live in the private `attachments` bucket. `page_files` binds private paths to pages; storage access follows their current sharing group after subtree moves. File-path ownership is assigned by a checked upload function, not arbitrary client input. Duplication safely retains authorized file references. Signed download URLs expire after 60 seconds; an already-issued URL may remain usable until expiry after a move.
- Deletion is soft so Undo can restore content and files. No automatic physical purge is performed; design a retention policy before permanently removing old rows/blobs.

Tests cover local conversion, nesting/cycles, inherited access, stale versions, subtree moves and private-file access, duplication and Undo. Browser tests cover page creation/editing, breadcrumb hover/release/cancel, cross-branch moves, deletion/Undo, files/URLs, alignment, resizing, search and responsive navigation. Signed-in email delivery and full multi-user acceptance testing still require actual accounts and a configured email provider.

## GitHub Pages

**GitHub Pages hosts the frontend. Supabase authenticates users and stores shared pages and private files.**

Choose **GitHub Actions** under repository Settings → Pages. Push to `main` to build and deploy; the Vite relative base supports `/Project-Notes/`. Repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` override the committed public client settings. Migration/setup commits marked `[connect-supabase]` use the setup workflow so schema changes complete before the new frontend deploys.

No real-time collaboration, chat or payments are included.
