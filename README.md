# Stillroom
A light, spacious visual planning workspace built with React, TypeScript, Vite and React Flow. The initial local example is **True Myth: Addison’s Midnight Walk**.

## Run locally
Use Node 24 and npm:

```sh
npm ci
npm run dev
npm test
npm run build
```
Without environment variables, the app explicitly runs as a **local demo**. Cards, boards and projects are stored in this browser’s localStorage. This is not shared data or an authenticated workspace. Clearing browser storage removes demo edits. Connections are session-only. Dropped files are kept in this browser’s IndexedDB, not on a shared server. Clearing site data removes those files. No account is needed for the demo.

## Connect Supabase
1. Create a Supabase project in your own account. In the SQL editor run `supabase/migrations/001_initial.sql` then `002_reversible_delete.sql`, `003_project_canvas.sql`, `004_project_title_undo.sql`, and `005_home_canvas.sql` in order, or apply them with the Supabase CLI. Existing installations must apply migration 002 before using deletion/undo. Do not run it against an existing unrelated schema.
2. Copy `.env.example` to `.env.local`. Set `VITE_SUPABASE_URL` and the public anon/publishable client key from the project API settings. Never use a service-role or secret key. Vite variables are embedded in the public bundle.
3. In Authentication → URL configuration, set Site URL to your production repository URL, for example `https://robert856.github.io/Project-Notes/`. Add that exact URL and `http://localhost:5173/` to the permitted redirect URLs. Enable email authentication and configure production SMTP for reliable magic-link delivery. Keep email verification enabled.
4. Restart Vite. Use the sign-in dialog to request a magic link. Once signed in, use the + beside Projects to create your first project, then create boards. Demo content is intentionally not uploaded to your account.
5. The migration creates a private `attachments` bucket with a 20 MiB limit. File paths are scoped to project IDs; downloads use 60-second signed URLs. Public image URL cards are a separate option: their external hosts receive normal browser requests.
6. Owners can create invitations with owner, editor, or viewer roles. Invitation creation records an email in the database; it does **not** send an invitation email. Share the application URL separately. The collaborator signs in with the matching verified email, and the app claims the invitation. Existing members retain their current role; this MVP does not provide member removal or role changes.

## Sharing and security
All six application tables have RLS enabled. Project membership controls board, card, attachment and invite access. Only owners manage invitations. Editors can change boards and cards; viewers have read access. Initial project ownership is assigned atomically by `create_project`. Invite claims use `auth.users` verified email rather than user-editable profile metadata. Storage policies independently check project membership.

Card updates go exclusively through `save_card`, which checks edit permission and atomically compares the expected version, increments it and returns the saved row. Direct client UPDATE privileges on cards are revoked. A stale write fails with a clear conflict warning and preserves the editor text. Close the editor and refresh the browser to load the current version before reconciling manually. Deletion also includes the expected version. Board renames do not currently have version checks. Concurrent requests on the same card may yield a conflict; the app never automatically forces an overwrite.

Data model: projects → boards → cards; project_members joins authenticated users to projects; project_invites joins verified emails to projects; attachments belong to a project and a card. No realtime subscriptions are used. Refresh loads the latest saved data.

## GitHub Pages
The frontend is static; **GitHub Pages hosts the frontend while Supabase stores shared data, authenticates users, and serves private files**.

1. Commit and push to `main` in `robert856/Project-Notes`.
2. In GitHub Settings → Pages choose **GitHub Actions** as the source.
3. Add repository Actions variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. These are public client configuration, not service credentials. Leaving them unset deploys the local demo.
4. The included workflow installs the lockfile, tests, builds, and deploys `dist`. Vite uses `base: './'`, generating relative asset paths suitable for `/Project-Notes/` and custom domains. The app does not require server-side route rewrites.
5. Verify the deployed URL and sign-in redirect after the workflow succeeds.

Hosted Supabase provisioning, migration application, and production authentication have not been verified. GitHub Pages deployment is handled by the included workflow; check the latest run for its current result.

## Current scope
Movable and resizable cards, Markdown notes (raw HTML disabled), external images, links, checklists, private file uploads, board creation/rename/duplication/deletion, card duplication/deletion, project creation, role-scoped collaboration, and title/content search. Mobile navigation and canvas pan/zoom are supported; desktop is the primary experience.

Group cards are visual headings, not parent containers; move related cards independently. Connections are intentionally session-only and are labeled as such when added. Rich text uses Markdown editing rather than a WYSIWYG toolbar. Image cards use external URLs; use file cards for private image attachments. Deletion hides records but retains their data and stored blobs for authorized undo; a separate retention/purge policy is needed for permanent cleanup. No realtime, chat or payments.

Before production, execute two-user acceptance checks against your own Supabase project: outsider cannot select any project data or download files; viewer cannot mutate; editor can edit; only owner can invite; two browser sessions editing version 1 cause the second save to fail without replacing the first. Test private attachment download and auth redirects on the actual Pages URL. Local tests cannot establish those account-specific guarantees.

## Drag content directly onto a board
Drag a web link (including a YouTube video link) or files from your computer onto the canvas. New cards appear at the drop position, accounting for canvas zoom and pan. Multiple files create separate cards. YouTube watch, short, live, and share links create a video embed using youtube-nocookie.com; a normal link remains available if embedding is restricted by the video owner or browser. Drag the video title, thumbnail link, or browser address link rather than the playing video surface, which may not expose a URL to other sites.

Files have a 20 MiB limit per file. In demo mode they persist in this browser’s IndexedDB and can be downloaded from their file cards; they are not shared or uploaded. In connected mode files use the private Supabase bucket and project-scoped attachment records. Viewers cannot add cards through drops. No external URL metadata scraping is performed.

## Select, move, and align cards
Drag across empty canvas with the left mouse button to box-select cards (touching a card is enough). Shift-click, Ctrl-click, or Cmd-click toggles individual cards into the selection. Use **Select all** or Ctrl/Cmd+A outside text inputs to select the currently visible cards; **Clear** or Escape clears selection. Search filters what Select all includes.

Drag a selected card to move the selected set together. The alignment bar offers Left, Center, Right, Top, Middle, and Bottom for two or more selected cards. It aligns their edges or centers against the selection’s bounding rectangle, accounting for different card sizes. Aligning can overlap cards; it does not distribute spacing. Pan using the middle/right mouse button or touch gestures, or hold Space while dragging. Positions are saved with each card’s version check; a partial save reports how many positions succeeded and restores unsaved cards to their prior positions. Viewers can select but cannot move or align.

### Distribute and delete projects
Select at least three cards, then choose **Distribute → Horizontally** (across) or **Vertically** (down). Equal gaps use the cards’ actual dimensions and preserve their spatial order. If the selection is too crowded, distribution expands it with 24px gaps instead of retaining overlaps. Positions use the same version-checked saves as alignment.

Click a project or note once to select it, then press Delete/Backspace or click its selection Delete button. Deletion is immediate, without confirmation. Double-click or press Enter to open a selected project/note. Only owners can delete shared projects; editors can delete notes. RLS and the reversible deletion RPC enforce permissions.

## Canvas navigation and minimal tools
Use the small **Home** mark at the top of the left rail for the project canvas. Double-click project tiles to open their notes; double-click a container note to open the notes inside. Tiles can be freely dragged. Their layout is personal to this browser (`stillroom-layout:*` in localStorage), including when Supabase is connected; project/board records and card contents still use the existing shared data model. Tile positions are not currently shared across collaborators.

The **Browse** button opens the project navigation drawer when needed. Creation tools stay on the left. **Arrange** opens the selection, alignment, and distribution panel. The rail’s Project button creates a project on Home; its Note button creates a container note inside the current project. Existing cards and projects are preserved by this layout change.

## Immediate deletion and Undo
The interface calls both container canvases and content items **notes**. The database retains its original `boards` and `cards` names for compatibility. Projects keep their name.

Single-click to select/highlight. Shift-click or box selection selects several items. Delete or Backspace removes selected items immediately with no confirmation. The left rail has a Delete action for content notes; selected project/container tiles show a Delete action on the canvas. Double-click or Enter opens selected containers. Deleting a container hides its contained notes as well.

Use the left **Undo** button, **Ctrl+Z**, or **Cmd+Z** to reverse up to 30 workspace changes in this session: deletion, saved edits, creation/duplication, movement, resizing, alignment and distribution. Project/note tile movement also supports undo. Text inputs keep their native typing undo. History is in memory and clears on reload; connected-mode data refresh/project switching resets data history so remote changes are not treated as local edits. There is no redo yet. Links/connections and invitation management are outside workspace history.

Migration 002 uses `deleted_at` to hide data while retaining memberships, attachments and child notes. Undo runs in one PostgreSQL transaction and version-checks note edits; conflicts fail instead of overwriting newer changes. Do not physically purge deleted records until any desired recovery period has passed. Hosted Supabase validation is still required; local PostgreSQL-compatible tests validate the migrations and permission/version behavior.

## Direct drops onto project canvases
The project canvas (where its container-note tiles appear) also accepts dragged web links, YouTube URLs, and local files. Notes can be created there using the left rail without first opening a container note. Dropped content renders alongside the tiles and supports editing, dragging, resizing, deletion and Undo. Existing open-note drops keep working. Home also accepts direct content drops and toolbar-created boards/notes (migration 005 in connected mode).

Migration 003 adds a hidden backing container per project (`boards.is_project_canvas`) with an authorized, idempotent `get_project_canvas` function. It reuses the existing project membership, note version checking, storage, and Undo policies. Existing connected installations must apply migrations 002 and 003; no hosted migration was applied automatically. Local demo mode needs no configuration.

Alignment and distribution are available through **Arrange** on Home project tiles, project note tiles, mixed tile/content selections, and opened content notes. Align requires at least two selected items; distribute requires three. Tile positions remain personal browser layout, while shared content-note positions use version-checked database saves.

The Arrange panel dismisses after applying an alignment/distribution, clicking outside, pressing Escape, clearing the selection, navigating to another canvas, or switching away from the browser tab/window. Use Arrange again for another operation; selection stays available after an action.

Drag the left **Note** tool (or another content tool) onto a project/opened-note canvas to create an item at the exact drop location, including when zoomed or panned. The editor opens for the new item. Clicking a tool still works. On the project canvas, click the text beneath a container note's icon to rename it inline: Enter or clicking elsewhere saves, Escape cancels. Renames are permission-checked; connected saves compare the previously loaded title to detect concurrent changes. Undo also reverses renames.

Stillroom starts on **Home** on every fresh load or refresh, including first use. Opening a project or note does not change this startup behavior. Saved projects, notes, attachments and personal tile layouts remain available.

On Home, click a project title beneath its icon to rename it inline. Enter or clicking elsewhere saves; Escape cancels. Shared project renames are owner-only and compare the previously loaded title to detect concurrent changes. Migration 004 adds conflict-safe Undo for project titles; demo mode needs no migration.

## Drag tools onto Home or project canvases
Both **Note** and **Board** tools can be dragged from the left rail. Drop a Note to create content at that exact position; its editor opens. Drop a Board to create an “Untitled board” tile without a naming dialog. Click the tile title to rename it later. Both work directly on Home and on project canvases. Dropping a Board while inside a content canvas creates it on the enclosing project canvas.

Migration 005 supplies a personal Home storage container through `get_home_canvas`, using existing RLS and storage policies. The backing project is excluded from the project tile list. Each signed-in user gets their own Home container; ownership is assigned by the server, not client project edits. Home content and boards persist in browser storage in demo mode, and Supabase when configured. Apply migration 005 after the earlier migrations for connected use; it has not been applied to a hosted account here.

Dragging onto a canvas is intentionally quiet: no drop-here wording, tinted overlay, dashed border, or drag-triggered layout changes. Releasing a supported item places it on the canvas. Embedded-player hit testing is temporarily disabled invisibly during external drags so players do not swallow the drop.
