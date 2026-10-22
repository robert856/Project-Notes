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
1. Create a Supabase project in your own account. In the SQL editor run `supabase/migrations/001_initial.sql` once, or apply it with the Supabase CLI. Do not run it against an existing unrelated schema.
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

No Supabase instance has been provisioned, migrations applied, production authentication verified, or GitHub deployment performed by this implementation.

## Current scope
Movable and resizable cards, Markdown notes (raw HTML disabled), external images, links, checklists, private file uploads, board creation/rename/duplication/deletion, card duplication/deletion, project creation, role-scoped collaboration, and title/content search. Mobile navigation and canvas pan/zoom are supported; desktop is the primary experience.

Group cards are visual headings, not parent containers; move related cards independently. Connections are intentionally session-only and are labeled as such when added. Rich text uses Markdown editing rather than a WYSIWYG toolbar. Image cards use external URLs; use file cards for private image attachments. Deleting cards/boards removes metadata but does not automatically remove stored blobs: plan a server-side orphan cleanup task before large-scale use. No realtime, chat or payments.

Before production, execute two-user acceptance checks against your own Supabase project: outsider cannot select any project data or download files; viewer cannot mutate; editor can edit; only owner can invite; two browser sessions editing version 1 cause the second save to fail without replacing the first. Test private attachment download and auth redirects on the actual Pages URL. Local tests cannot establish those account-specific guarantees.

## Drag content directly onto a board
Drag a web link (including a YouTube video link) or files from your computer onto the canvas. New cards appear at the drop position, accounting for canvas zoom and pan. Multiple files create separate cards. YouTube watch, short, live, and share links create a video embed using youtube-nocookie.com; a normal link remains available if embedding is restricted by the video owner or browser. Drag the video title, thumbnail link, or browser address link rather than the playing video surface, which may not expose a URL to other sites.

Files have a 20 MiB limit per file. In demo mode they persist in this browser’s IndexedDB and can be downloaded from their file cards; they are not shared or uploaded. In connected mode files use the private Supabase bucket and project-scoped attachment records. Viewers cannot add cards through drops. No external URL metadata scraping is performed.

## Select, move, and align cards
Drag across empty canvas with the left mouse button to box-select cards (touching a card is enough). Shift-click, Ctrl-click, or Cmd-click toggles individual cards into the selection. Use **Select all** or Ctrl/Cmd+A outside text inputs to select the currently visible cards; **Clear** or Escape clears selection. Search filters what Select all includes.

Drag a selected card to move the selected set together. The alignment bar offers Left, Center, Right, Top, Middle, and Bottom for two or more selected cards. It aligns their edges or centers against the selection’s bounding rectangle, accounting for different card sizes. Aligning can overlap cards; it does not distribute spacing. Pan using the middle/right mouse button or touch gestures, or hold Space while dragging. Positions are saved with each card’s version check; a partial save reports how many positions succeeded and restores unsaved cards to their prior positions. Viewers can select but cannot move or align.

### Distribute and delete projects
Select at least three cards, then choose **Distribute → Horizontally** (across) or **Vertically** (down). Equal gaps use the cards’ actual dimensions and preserve their spatial order. If the selection is too crowded, distribution expands it with 24px gaps instead of retaining overlaps. Positions use the same version-checked saves as alignment.

To delete a project, select it in the sidebar and click **Delete project** at the top-right, then confirm. This permanently deletes that project and its boards and cards. Only owners can delete shared projects; the database policy enforces this. Cancel leaves the project unchanged. As with board/card deletion, stored file blobs are not automatically purged; attachment metadata is deleted and cloud access is revoked when membership is removed by the project cascade. Server-side orphan cleanup remains a separate storage maintenance task.

## Canvas navigation and minimal tools
Use the small **Home** mark at the top of the left rail for the project canvas. Project tiles open a project's board canvas; board tiles open their cards. Tiles can be freely dragged. Their layout is personal to this browser (`stillroom-layout:*` in localStorage), including when Supabase is connected; project/board records and card contents still use the existing shared data model. Tile positions are not currently shared across collaborators.

The **Browse** button opens the project navigation drawer when needed. Creation tools stay on the left. **Arrange** opens the selection, alignment, and distribution panel. The rail’s Project button creates a project on Home; its Board button creates a board inside the current project. Existing cards and projects are preserved by this layout change.
