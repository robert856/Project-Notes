import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type DragEvent,
} from "react";
import {
  Home,
  Plus,
  Files,
  Type,
  Image,
  Link,
  CheckSquare,
  Paperclip,
  Search,
  Undo2,
  Trash2,
  SlidersHorizontal,
  Users,
  Pencil,
  ChevronRight,
  RefreshCw,
  LogOut,
  X,
  PanelLeft,
  Copy,
  ArrowUpRight,
} from "lucide-react";
import type { ReactFlowInstance } from "@xyflow/react";
import Markdown from "react-markdown";
import { db, url as projectUrl } from "./api";
import { PageCanvas } from "./PageCanvas";
import { PageEditor } from "./PageEditor";
import { InlineChecklist } from "./InlineChecklist";
import { InlineText } from "./InlineText";
import { ArrangePanel, type Arrangement } from "./ArrangePanel";
import { alignCards, distributeCards } from "./alignment";
import {
  pageSize,
  availablePosition,
  pageTree,
  ancestors,
  visiblePages,
  mergePages,
  convertBrowserPages,
  PAGES_KEY,
  type Page,
  type PageChange,
} from "./pages";
import {
  loadPages,
  createPage,
  savePages,
  movePage,
  trashPages,
  restorePages,
  duplicatePage,
  addFile,
  fileUrl,
} from "./pageRepository";
import { droppedUrl, readLocalFile } from "./drops";
import { safeUrl } from "./model";
export default function PagesApp() {
  const [pages, setPages] = useState<Page[]>([]),
    [current, setCurrent] = useState<string | null>(null),
    [selection, setSelection] = useState<string[]>([]),
    [query, setQuery] = useState("");
  const [user, setUser] = useState<string | null>(null),
    [roles, setRoles] = useState<Record<string, string>>({}),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [editor, setEditor] = useState<Page | null>(null),
    [modal, setModal] = useState<"auth" | "share" | null>(null),
    [sidebar, setSidebar] = useState(false),
    [arrange, setArrange] = useState(false),
    [hover, setHover] = useState<string>(),
    [historyCount, setHistoryCount] = useState(0);
  const [email, setEmail] = useState(""),
    [inviteRole, setInviteRole] = useState("editor"),
    [modalMessage, setModalMessage] = useState(""),
    [importing, setImporting] = useState(false);
  const [movePicker, setMovePicker] = useState(false),
    [moveQuery, setMoveQuery] = useState("");
  const latest = useRef(pages),
    history = useRef<PageChange[]>([]),
    operation = useRef(false),
    flow = useRef<ReactFlowInstance | null>(null),
    fileInput = useRef<HTMLInputElement>(null);
  latest.current = pages;
  const visible = useMemo(() => visiblePages(pages), [pages]);
  const tree = useMemo(() => pageTree(visible), [visible]);
  const active = visible.find((p) => p.id === current) || null;
  const trail = useMemo(() => ancestors(visible, current), [visible, current]);
  const children = useMemo(
    () => visible.filter((p) => p.parent_id === current),
    [visible, current],
  );
  const displayed = useMemo(
    () =>
      query
        ? visible.filter((p) =>
            `${p.title} ${p.content}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
        : children,
    [children, visible, query],
  );
  const canEdit = (p: Page) =>
    !db || ["owner", "editor"].includes(roles[p.project_id]);
  const canCreate = !db || (!!user && (!active || canEdit(active)));
  const selected = visible.filter((p) => selection.includes(p.id));
  const notify = useCallback((s: string) => setMessage(s), []);
  const open = useCallback((id: string | null) => {
    setCurrent(id);
    setQuery("");
    setSelection([]);
    setArrange(false);
    setSidebar(false);
    setHover(undefined);
  }, []);
  const commit = (change: PageChange, record = true) => {
    setPages((previous) => mergePages(previous, change.after));
    latest.current = mergePages(latest.current, change.after);
    if (record && change.after.length) {
      history.current = [...history.current.slice(-29), change];
      setHistoryCount(history.current.length);
    }
  };
  const perform = async <T,>(task: () => Promise<T>): Promise<T> => {
    if (operation.current)
      throw new Error(
        "A change is still saving. Please try again in a moment.",
      );
    operation.current = true;
    setBusy(true);
    try {
      return await task();
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };
  const action = (task: () => Promise<unknown>) =>
    void task().catch((e) => notify((e as Error).message));
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      if (db && !user) {
        setPages([]);
        setRoles({});
        return;
      }
      if (db) {
        const { error } = await db.rpc("claim_invites");
        if (error) throw error;
        const result = await db
          .from("project_members")
          .select("project_id,role")
          .eq("user_id", user!);
        if (result.error) throw result.error;
        setRoles(
          Object.fromEntries(result.data.map((m) => [m.project_id, m.role])),
        );
      }
      const data = await loadPages();
      setPages(data);
      latest.current = data;
      history.current = [];
      setHistoryCount(0);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user, notify]);
  useEffect(() => {
    if (!db) return;
    db.auth
      .getSession()
      .then(({ data }) => setUser(data.session?.user.id || null));
    const { data } = db.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user.id || null),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    open(null);
    void reload();
  }, [reload, open]);
  useEffect(() => {
    setArrange(false);
  }, [current]);
  useEffect(() => {
    if (current && !visible.some((p) => p.id === current)) setCurrent(null);
  }, [visible, current]);
  useEffect(() => {
    const stop = (e: globalThis.DragEvent) => e.preventDefault();
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);
  const save = async (
    edits: (Partial<Page> & { id: string; version: number })[],
  ) => {
    await perform(async () => commit(await savePages(edits)));
  };
  const move = async (page: Page, parentId: string | null) => {
    if (page.parent_id === parentId) return;
    await perform(async () => {
      const parent = latest.current.find((p) => p.id === parentId) || null;
      const position = availablePosition(
        latest.current.filter(
          (p) => !p.deleted_at && p.parent_id === parentId && p.id !== page.id,
        ),
        page.width,
        page.height,
      );
      commit(await movePage(page, parent, position.x, position.y));
      notify(`Moved to ${parent?.title || "Home"}.`);
      setSelection([]);
    });
  };
  const remove = async () => {
    const targets = selected.filter(canEdit);
    if (!targets.length) return;
    await perform(async () => {
      commit(await trashPages(targets));
      setSelection([]);
      notify("Pages deleted. Ctrl+Z to undo.");
    });
  };
  const undo = async () => {
    if (!history.current.length) return;
    await perform(async () => {
      const entry = history.current[history.current.length - 1];
      const result = await restorePages(entry);
      commit(result, false);
      history.current.pop();
      // Rebase only versions written by this Undo, so consecutive undos remain safe.
      const versions = new Map(result.after.map((p) => [p.id, p.version]));
      for (const previous of history.current)
        previous.after = previous.after.map((p) =>
          versions.has(p.id) ? { ...p, version: versions.get(p.id)! } : p,
        );
      setHistoryCount(history.current.length);
      notify("Undone.");
    });
  };
  const duplicate = async () => {
    if (selected.length !== 1) return;
    await perform(async () => {
      const change = await duplicatePage(selected[0]);
      if (db && !selected[0].parent_id)
        setRoles((r) => ({ ...r, [change.after[0].project_id]: "owner" }));
      commit(change);
      notify("Page and nested pages duplicated.");
    });
  };
  const handlers = useRef({ undo, remove });
  handlers.current = { undo, remove };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"],.page-modal',
        )
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        action(() => handlers.current.undo());
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        action(() => handlers.current.remove());
      }
      if (e.key === "Escape") {
        setSelection([]);
        setArrange(false);
        setHover(undefined);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelection(displayed.map((p) => p.id));
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [displayed]);
  const add = async (
    kind: Page["kind"] = "page",
    position?: { x: number; y: number },
    content = "",
  ) => {
    if (!canCreate) {
      setModal("auth");
      return;
    }
    const p = await perform(async () => {
      const xy = position || availablePosition(children);
      const change = await createPage(
        active,
        kind,
        kind === "page"
          ? "Untitled page"
          : kind === "link"
            ? "Link"
            : kind === "image"
              ? "Image"
              : "Untitled page",
        content,
        xy.x,
        xy.y,
      );
      if (!active && db)
        setRoles((r) => ({ ...r, [change.after[0].project_id]: "owner" }));
      commit(change);
      return change.after[0];
    });
    if (!position && kind !== "page" && kind !== "checklist" && kind !== "text")
      setEditor(p);
  };
  const upload = async (files: File[], position?: { x: number; y: number }) => {
    if (!canCreate) {
      setModal("auth");
      return;
    }
    await perform(async () => {
      for (const [i, file] of files.entries()) {
        if (file.size > 20 * 1024 * 1024)
          throw new Error(`${file.name}: files must be 20 MiB or smaller.`);
        const created = await createPage(
          active,
          "file",
          file.name,
          "",
          (position?.x || 100) + i * 35,
          (position?.y || 100) + i * 35,
        );
        if (!active && db)
          setRoles((r) => ({ ...r, [created.after[0].project_id]: "owner" }));
        try {
          const attached = await addFile(created.after[0], file);
          commit({ before: [], after: attached.after });
        } catch (e) {
          await trashPages(created.after);
          throw e;
        }
      }
    });
  };
  const drop = async (event: DragEvent, instance: ReactFlowInstance) => {
    if (!canCreate) return;
    const pos = instance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    const files = Array.from(event.dataTransfer.files);
    if (files.length) {
      await upload(files, pos);
      return;
    }
    const kind = event.dataTransfer.getData(
      "application/x-stillroom-page",
    ) as Page["kind"];
    if (["page", "text", "image", "link", "checklist"].includes(kind)) {
      await add(kind, pos);
      return;
    }
    const url = droppedUrl(
      event.dataTransfer.getData("text/uri-list"),
      event.dataTransfer.getData("text/plain"),
      event.dataTransfer.getData("text/html"),
    );
    if (url) await add("link", pos, url);
  };
  const download = async (p: Page) => {
    const url = await fileUrl(p);
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.click();
    if (url.startsWith("blob:"))
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const arrangePages = async (direction: Arrangement) => {
    const targets = selected
      .filter(canEdit)
      .map((p) => ({ ...p, ...pageSize(p) }));
    const changed =
      direction === "horizontal" || direction === "vertical"
        ? distributeCards(targets, direction)
        : alignCards(targets, direction);
    await save(
      changed.map((p) => ({ id: p.id, version: p.version, x: p.x, y: p.y })),
    );
  };
  const hasBrowserWork = !!(
    localStorage.getItem(PAGES_KEY) ||
    localStorage.getItem("stillroom-projects")
  );
  const importBrowser = async () => {
    if (!db || !user) return;
    setImporting(true);
    try {
      await perform(async () => {
        const source = visiblePages(convertBrowserPages()),
          key = `stillroom-page-import:${user}:${projectUrl}`;
        const map: Record<string, string> = JSON.parse(
          localStorage.getItem(key) || "{}",
        );
        let remaining = [...source];
        let count = 0;
        while (remaining.length) {
          let progress = false;
          for (const old of [...remaining]) {
            if (old.parent_id && !map[old.parent_id]) continue;
            const parent = old.parent_id
              ? ({ id: map[old.parent_id] } as Page)
              : null;
            let copied: Page;
            if (map[old.id]) {
              const { data, error } = await db!
                .from("pages")
                .select("*")
                .eq("id", map[old.id])
                .single();
              if (error) throw error;
              copied = data;
            } else {
              const created = await createPage(
                parent,
                old.kind,
                old.title,
                old.kind === "file" ? "" : old.content,
                old.x,
                old.y,
              );
              copied = created.after[0];
              map[old.id] = copied.id;
              localStorage.setItem(key, JSON.stringify(map));
            }
            if (
              old.kind === "file" &&
              old.content.startsWith("local:") &&
              !copied.content
            ) {
              const blob = await readLocalFile(old.content);
              await addFile(
                copied,
                new File([blob], old.title, { type: blob.type }),
              );
            }
            remaining = remaining.filter((p) => p.id !== old.id);
            progress = true;
            notify(`Importing browser pages: ${++count} copied…`);
          }
          if (!progress)
            throw new Error(
              "The browser hierarchy is incomplete; originals are unchanged.",
            );
        }
      });
      await reload();
      notify("Browser pages imported. Original data is preserved.");
    } catch (e) {
      notify(
        "Import paused: " + (e as Error).message + " You can retry safely.",
      );
    } finally {
      setImporting(false);
    }
  };
  const crumb = (id: string | null, title: string) => (
    <button
      key={id || "home"}
      data-page-destination={id || "home"}
      className={hover === (id || "home") ? "crumb-landing" : ""}
      onClick={() => open(id)}
    >
      {!id && <Home size={14} />} {title}
    </button>
  );
  return (
    <div className="pages-app">
      <nav className="tool-rail" aria-label="Page tools">
        <button
          className="rail-brand"
          title="Home"
          aria-label="Home"
          onClick={() => open(null)}
        >
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
        </button>
        <button
          className="rail-tool"
          aria-label="Browse pages"
          onClick={() => setSidebar((v) => !v)}
        >
          <PanelLeft size={21} />
          <span>Browse</span>
        </button>
        <div className="rail-divider" />
        {(
          [
            { kind: "page", label: "Page", Icon: Files },
            { kind: "text", label: "Text", Icon: Type },
            { kind: "link", label: "Link", Icon: Link },
            { kind: "checklist", label: "To-do", Icon: CheckSquare },
            { kind: "image", label: "Image", Icon: Image },
          ] as const
        ).map(({ kind, label, Icon }) => (
          <button
            key={kind}
            className="rail-tool"
            title={`Add ${label.toLowerCase()}`}
            aria-label={`Add ${label.toLowerCase()}`}
            disabled={busy || !canCreate}
            draggable={canCreate && !busy}
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-stillroom-page", kind);
              e.dataTransfer.effectAllowed = "copy";
              setArrange(false);
            }}
            onClick={() => action(() => add(kind))}
          >
            <Icon size={21} strokeWidth={1.5} />
            <span>{label}</span>
          </button>
        ))}
        <button
          className="rail-tool"
          aria-label="Upload file"
          disabled={busy || !canCreate}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip size={21} />
          <span>File</span>
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          aria-label="Choose files"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            action(() => upload(files));
            e.target.value = "";
          }}
        />
        <div className="rail-divider" />
        <button
          className={`rail-tool ${arrange ? "active" : ""}`}
          data-arrange-trigger
          aria-label="Align and distribute"
          onClick={() => setArrange((v) => !v)}
        >
          <SlidersHorizontal size={21} />
          <span>Arrange</span>
        </button>
        <button
          className="rail-tool"
          aria-label="Move selected page"
          disabled={selected.length !== 1 || busy || !selected.every(canEdit)}
          onClick={() => {
            setMoveQuery("");
            setMovePicker(true);
          }}
        >
          <ArrowUpRight size={21} />
          <span>Move</span>
        </button>
        <button
          className="rail-tool"
          aria-label="Duplicate selected page"
          disabled={selected.length !== 1 || busy || !selected.every(canEdit)}
          onClick={() => action(duplicate)}
        >
          <Copy size={20} />
          <span>Duplicate</span>
        </button>
        <button
          className="rail-tool"
          aria-label="Delete selected pages"
          disabled={!selected.length || busy || !selected.every(canEdit)}
          onClick={() => action(remove)}
        >
          <Trash2 size={20} />
          <span>Delete</span>
        </button>
        <button
          className="rail-tool"
          aria-label="Undo"
          title="Undo (Ctrl+Z / ⌘Z)"
          disabled={!historyCount || busy}
          onClick={() => action(undo)}
        >
          <Undo2 size={21} />
          <span>Undo</span>
        </button>
      </nav>
      {sidebar && (
        <aside className="pages-tree">
          <header>
            <strong>Pages</strong>
            <button
              className="icon-button"
              aria-label="Close navigation"
              onClick={() => setSidebar(false)}
            >
              <X size={17} />
            </button>
          </header>
          {db && user && hasBrowserWork && (
            <button
              className="button"
              disabled={importing || busy}
              onClick={() => void importBrowser()}
            >
              {importing ? "Importing…" : "Import browser pages"}
            </button>
          )}
          {tree.map((p) => (
            <button
              key={p.id}
              style={{
                paddingLeft:
                  12 + Math.min(ancestors(visible, p.id).length - 1, 10) * 14,
              }}
              onClick={() => open(p.id)}
            >
              <Files size={14} />
              {p.title}
            </button>
          ))}
        </aside>
      )}
      <main className="pages-main">
        <header className="pages-topbar">
          <div className="breadcrumbs">
            {crumb(null, "Home")}
            {trail.map((p) => (
              <span className="page-crumb" key={p.id}>
                <ChevronRight size={12} />
                {crumb(p.id, p.title)}
              </span>
            ))}
          </div>
          <div className="pages-search-inline">
            <label>
              <Search size={15} />
              <input
                aria-label="Search pages"
                placeholder="Search pages…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="pages-account">
            <button
              className="icon-button"
              aria-label="Refresh shared pages"
              disabled={busy || loading}
              onClick={() => void reload()}
            >
              <RefreshCw size={16} />
            </button>
            <span>
              {busy
                ? "Saving…"
                : db
                  ? user
                    ? "Connected"
                    : "Sign in to save"
                  : "Local demo"}
            </span>
            {db &&
              (user ? (
                <button
                  className="icon-button"
                  aria-label="Sign out"
                  onClick={() => void db?.auth.signOut()}
                >
                  <LogOut size={17} />
                </button>
              ) : (
                <button
                  className="button"
                  onClick={() => {
                    setModalMessage("");
                    setModal("auth");
                  }}
                >
                  Sign in
                </button>
              ))}
          </div>
        </header>
        <section className="pages-heading">
          <h1>{active?.title || "Home"}</h1>
          <div className="pages-heading-actions">
            {active && (
              <>
                <button
                  className="icon-button"
                  aria-label="Edit page"
                  title="Edit page"
                  disabled={!canEdit(active) || busy}
                  onClick={() => setEditor(active)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Share page"
                  title="Share page"
                  onClick={() => {
                    setModalMessage("");
                    setModal("share");
                  }}
                >
                  <Users size={15} />
                </button>
              </>
            )}
            <button
              className="icon-button"
              aria-label="New page"
              title="New page"
              disabled={busy || !canCreate}
              onClick={() => action(() => add("page"))}
            >
              <Plus size={16} />
            </button>
          </div>
        </section>
        {active &&
          (active.content ||
            active.kind === "checklist" ||
            active.kind === "text") && (
            <section className="page-own-content">
              {active.kind === "text" ? (
                <InlineText
                  key={active.id}
                  page={active}
                  editable={canEdit(active)}
                  onSave={(content, version) =>
                    save([{ id: active.id, version, content }])
                  }
                />
              ) : active.kind === "checklist" ? (
                <InlineChecklist
                  key={active.id}
                  page={active}
                  editable={canEdit(active)}
                  onSave={(content, version) =>
                    save([{ id: active.id, version, content }])
                  }
                />
              ) : active.kind === "image" && safeUrl(active.content) ? (
                <img src={active.content} alt={active.title} />
              ) : active.kind === "file" ? (
                <button
                  className="button"
                  onClick={() => action(() => download(active))}
                >
                  <DownloadIcon />
                  Open attachment
                </button>
              ) : active.kind === "link" ? (
                <a
                  href={safeUrl(active.content) || undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  {active.content}
                </a>
              ) : (
                <Markdown>{active.content}</Markdown>
              )}
            </section>
          )}
        {loading ? (
          <div className="pages-loading">Loading pages…</div>
        ) : (
          <PageCanvas
            pages={displayed}
            all={visible}
            current={current}
            editable={(p) => canEdit(p) && !query}
            busy={busy}
            selection={selection}
            onSelection={(ids) =>
              setSelection((old) =>
                old.join(",") === ids.join(",") ? old : ids,
              )
            }
            onOpen={open}
            onRename={(p, title) =>
              action(() => save([{ id: p.id, version: p.version, title }]))
            }
            onSave={save}
            onMove={move}
            onDrop={(event, instance) => action(() => drop(event, instance))}
            onHover={setHover}
            onDownload={(p) => action(() => download(p))}
            onReady={(instance) => {
              flow.current = instance;
            }}
            onError={notify}
          />
        )}
        {arrange && (
          <ArrangePanel
            open={arrange}
            count={selected.length}
            total={displayed.length}
            canArrange={!query && selected.every(canEdit)}
            busy={busy}
            onSelectAll={() => setSelection(displayed.map((p) => p.id))}
            onClear={() => setSelection([])}
            onArrange={(direction) => action(() => arrangePages(direction))}
            onClose={() => setArrange(false)}
          />
        )}
      </main>
      {message && (
        <div className="pages-toast" role="status">
          {message}
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setMessage("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {editor && (
        <PageEditor
          key={editor.id}
          page={editor}
          onSave={(p) =>
            save([
              {
                id: p.id,
                version: p.version,
                title: p.title,
                content: p.content,
                color: p.color,
              },
            ])
          }
          onClose={() => setEditor(null)}
        />
      )}
      {modal && (
        <div className="page-modal-backdrop">
          <form
            className="page-modal"
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                if (!db) return;
                setModalMessage("");
                if (modal === "auth") {
                  const { error } = await db.auth.signInWithOtp({
                    email: email.trim(),
                    options: {
                      emailRedirectTo: location.origin + location.pathname,
                    },
                  });
                  if (error) {
                    setModalMessage(error.message);
                    return;
                  }
                  setModalMessage("Check your inbox for the sign-in link.");
                } else if (active) {
                  if (roles[active.project_id] !== "owner") {
                    setModalMessage("Only an owner can invite people.");
                    return;
                  }
                  const { error } = await db.from("project_invites").upsert(
                    {
                      project_id: active.project_id,
                      email: email.trim().toLowerCase(),
                      role: inviteRole,
                    },
                    { onConflict: "project_id,email" },
                  );
                  setModalMessage(
                    error
                      ? error.message
                      : "Invitation recorded. Send them the Stillroom address separately; they sign in with this email and refresh.",
                  );
                }
              });
            }}
          >
            <button
              className="icon-button modal-close"
              type="button"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={19} />
            </button>
            <h2>
              {modal === "auth" ? "Your pages, together." : "Share pages"}
            </h2>
            <p>
              {modal === "auth"
                ? "Sign in with a secure email link. Your first sign-in creates your account."
                : "Access applies to this sharing group, including its nested pages. Pages moved into another group inherit its access. Moving to Home keeps the current access."}
            </p>
            {!db ? (
              <p>Connect Supabase to share pages.</p>
            ) : (
              <>
                <label>
                  Email
                  <input
                    type="email"
                    aria-label="Email"
                    value={email}
                    required
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                {modal === "share" && (
                  <label>
                    Permission
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                      <option value="owner">Owner</option>
                    </select>
                  </label>
                )}
                <button className="button primary">
                  {modal === "auth" ? "Send sign-in link" : "Invite"}
                </button>
              </>
            )}
            {modalMessage && <p role="status">{modalMessage}</p>}
          </form>
        </div>
      )}
      {movePicker && (
        <div className="page-modal-backdrop">
          <div className="page-modal" role="dialog" aria-label="Move page">
            <button
              className="icon-button modal-close"
              aria-label="Close move dialog"
              onClick={() => setMovePicker(false)}
            >
              <X size={18} />
            </button>
            <h2>Move page</h2>
            <input
              aria-label="Find destination"
              placeholder="Find a page…"
              value={moveQuery}
              onChange={(e) => setMoveQuery(e.target.value)}
            />
            <div className="page-destinations">
              {[
                { id: null, title: "Home" },
                ...visible.filter(
                  (p) =>
                    canEdit(p) &&
                    !ancestors(visible, p.id).some(
                      (a) => a.id === selected[0]?.id,
                    ) &&
                    p.title.toLowerCase().includes(moveQuery.toLowerCase()),
                ),
              ].map((p) => (
                <button
                  key={p.id || "home"}
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      if (selected[0]) await move(selected[0], p.id);
                      setMovePicker(false);
                    })
                  }
                >
                  {p.id
                    ? ancestors(visible, p.id)
                        .map((p) => p.title)
                        .join(" / ")
                    : "Home"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function DownloadIcon() {
  return <Paperclip size={16} />;
}
