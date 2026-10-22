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
Without environment variables, the app explicitly runs as a **local demo**. Cards, boards and projects are stored in this browser’s localStorage. This is not shared data or an authenticated workspace. Clearing browser storage removes demo edits. Connections are session-only. No account is needed for the demo.

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
