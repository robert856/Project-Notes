import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  SelectionMode,
  Controls,
  NodeResizer,
  Handle,
  Position,
  applyNodeChanges,
  type NodeProps,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  Undo2,
  Home,
  SlidersHorizontal,
  ArrowUpRight,
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  Image as ImageIcon,
  Type,
  CheckSquare,
  Link as LinkIcon,
  Paperclip,
  MoreHorizontal,
  ArrowLeft,
  Users,
  X,
  Copy,
  Trash2,
  Check,
  PanelLeftClose,
  Sun,
  Moon,
  Folder,
  HelpCircle,
  LogOut,
} from "lucide-react";
import "@xyflow/react/dist/style.css";
import "./style.css";
import Markdown from "react-markdown";
import { ArrangePanel } from "./ArrangePanel";
import { ExplorerCanvas } from "./ExplorerCanvas";
import { useWorkspaceUndo } from "./undo";
import { db, saveCard, trashItems, restoreWorkspace } from "./api";
import { alignCards, distributeCards, type Alignment } from "./alignment";
import {
  droppedUrl,
  youtubeId,
  acceptedDropEffect,
  storeLocalFile,
  readLocalFile,
} from "./drops";
import {
  demoBoards,
  demoCards,
  projectId,
  safeUrl,
  matches,
  type Card,
  type Board,
  type Project,
  type Kind,
} from "./model";
function CanvasCard({ data, selected }: NodeProps) {
  const c = data.card as Card;
  const edit = data.edit as (c: Card) => void;
  const videoId = c.kind === "link" ? youtubeId(c.content) : null;
  const toggle = data.toggle as (c: Card, i: number) => void;
  return (
    <>
      <NodeResizer
        isVisible={selected && Boolean(data.canEdit)}
        minWidth={210}
        minHeight={150}
        onResizeEnd={(_e, p) =>
          void (data.resize as (c: Card, w: number, h: number) => void)(
            c,
            p.width,
            p.height,
          )
        }
      />
      <Handle type="target" position={Position.Left} className="connection" />
      <article
        className={`canvas-card ${c.color} ${c.kind}`}
        onDoubleClick={() => edit(c)}
      >
        <div className="card-top">
          <span>
            {c.kind === "text"
              ? "NOTE"
              : c.kind === "image"
                ? "INSPIRATION"
                : c.kind === "checklist"
                  ? "TO-DO LIST"
                  : c.kind === "link"
                    ? "BOOKMARK"
                    : c.kind.toUpperCase()}
          </span>
          <button
            className="nodrag icon-button"
            onClick={() => edit(c)}
            aria-label={`Edit ${c.title}`}
          >
            <MoreHorizontal size={17} />
          </button>
        </div>
        {c.kind === "image" && safeUrl(c.content) && (
          <img className="card-image" src={safeUrl(c.content)!} alt={c.title} />
        )}
        <h3>{c.title}</h3>
        {c.kind === "checklist" ? (
          <div className="checklist">
            {c.content.split("\n").map((line, i) => (
              <label key={i} className="nodrag">
                <input
                  disabled={!data.canEdit}
                  type="checkbox"
                  checked={line.startsWith("[x]")}
                  onChange={() => toggle(c, i)}
                />
                <span className={line.startsWith("[x]") ? "done" : ""}>
                  {line.replace(/^\[[ x]\]\s*/, "")}
                </span>
              </label>
            ))}
          </div>
        ) : c.kind === "link" ? (
          <>
            {videoId && (
              <iframe
                className="nodrag nowheel video-embed"
                src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                title={`YouTube video: ${c.title}`}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            )}
            <a
              className="nodrag bookmark"
              href={safeUrl(c.content) || undefined}
              target="_blank"
              rel="noreferrer"
            >
              <span>
                <LinkIcon size={19} /> Open inspiration
              </span>
              <ArrowUpRight size={16} />
              <small>
                {safeUrl(c.content)
                  ? new URL(c.content).hostname
                  : "Add a valid URL"}
              </small>
            </a>
          </>
        ) : c.kind === "file" ? (
          <button
            className="nodrag file-button"
            onClick={() => void (data.download as (c: Card) => void)(c)}
          >
            <Paperclip size={18} /> Download attachment
          </button>
        ) : (
          c.kind !== "image" && (
            <div className="rich-content">
              <Markdown
                components={{
                  a: ({ children, href }) => (
                    <a
                      className="nodrag"
                      href={safeUrl(href || "") || undefined}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {c.content}
              </Markdown>
            </div>
          )
        )}
      </article>
      <Handle type="source" position={Position.Right} className="connection" />
    </>
  );
}
const nodeTypes = { card: CanvasCard };
function App() {
  const [user, setUser] = useState<string | null>(null),
    [email, setEmail] = useState(""),
    [modal, setModal] = useState<"auth" | "invite" | null>(null);
  const [projects, setProjects] = useState<Project[]>(() =>
      db
        ? []
        : JSON.parse(localStorage.getItem("stillroom-projects") || "null") || [
            { id: projectId, title: "True Myth: Addison’s Midnight Walk" },
          ],
    ),
    [project, setProject] = useState(projectId);
  const [boards, setBoards] = useState<Board[]>(() =>
      db
        ? []
        : JSON.parse(localStorage.getItem("stillroom-boards") || "null") ||
          demoBoards,
    ),
    [cards, setCards] = useState<Card[]>(() => {
      try {
        if (db) return [];
        return (
          JSON.parse(localStorage.getItem("stillroom-cards") || "null") ||
          demoCards
        );
      } catch {
        return demoCards;
      }
    });
  const [board, setBoard] = useState(demoBoards[0].id),
    [dashboard, setDashboard] = useState(false),
    [query, setQuery] = useState(""),
    [editing, setEditing] = useState<Card | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [role, setRole] = useState("owner"),
    [inviteRole, setInviteRole] = useState("editor"),
    [sidebar, setSidebar] = useState(false),
    [edges, setEdges] = useState<
      { id: string; source: string; target: string }[]
    >([]);
  useEffect(() => {
    if (db) return;
    if (!projects.some((p) => p.id === project)) {
      setProject(projects[0]?.id || "");
      return;
    }
    if (!boards.some((b) => b.id === board && b.project_id === project)) {
      const next = boards.find(
        (b) => b.project_id === project && !b.is_project_canvas,
      );
      setBoard(next?.id || "");
      if (!next) setDashboard(true);
    }
  }, [projects, boards, project, board]);
  const [workspaceHome, setWorkspaceHome] = useState(false);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const canEdit = !db || role === "owner" || role === "editor";
  const current = boards.find((b) => b.id === board);
  const notify = (s: string) => setMessage(s);
  const undoHistory = useWorkspaceUndo(
    { projects, boards, cards },
    restoreWorkspace,
    (snapshot) => {
      setProjects(snapshot.projects);
      setBoards(snapshot.boards);
      setCards(snapshot.cards);
      setEditing(null);
      setMessage("Undone.");
    },
    notify,
  );
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z" &&
        !event.shiftKey &&
        !event.repeat
      ) {
        if (
          (event.target as HTMLElement).closest(
            'input,textarea,select,[contenteditable="true"]',
          )
        )
          return;
        event.preventDefault();
        if (!busy && !deleting && !arranging && !dropping)
          void undoHistory.undo();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, [undoHistory]);

  // Capture native drops before any canvas/card handlers or browser default navigation.
  useEffect(() => {
    const protectPage = (event: DragEvent) => {
      const types = Array.from(event.dataTransfer?.types || []);
      const external =
        types.includes("Files") || types.includes("text/uri-list");
      if (!external) return;
      event.preventDefault();
      const target = event.target;
      const canvas =
        target instanceof Element &&
        target.closest(
          '.canvas-wrap,.explorer-canvas[data-drop-enabled="true"]',
        );
      if (!canvas) {
        if (event.type === "dragover" && event.dataTransfer)
          event.dataTransfer.dropEffect = "none";
        if (event.type === "drop")
          setMessage(
            "File not added. Drop inside the note canvas, below the toolbars. Your workspace has stayed open.",
          );
      }
    };
    window.addEventListener("dragover", protectPage, true);
    window.addEventListener("drop", protectPage, true);
    return () => {
      window.removeEventListener("dragover", protectPage, true);
      window.removeEventListener("drop", protectPage, true);
    };
  }, []);

  useEffect(() => {
    if (!db) return;
    void db.auth.getSession().then(({ data }) => {
      setUser(data.session?.user.id || null);
      if (!data.session) setModal("auth");
    });
    const { data } = db.auth.onAuthStateChange((_e, s) =>
      setUser(s?.user.id || null),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  const load = useCallback(async () => {
    if (!db || !user) return;
    const claim = await db.rpc("claim_invites");
    if (claim.error) notify(claim.error.message);
    const p = await db.from("projects").select("*");
    if (p.error) {
      notify(p.error.message);
      return;
    }
    setProjects(p.data || []);
    if (!p.data?.length) {
      setBoards([]);
      setCards([]);
      setDashboard(true);
      return;
    }
    const selected = p.data.find((v) => v.id === project)?.id || p.data[0].id;
    setProject(selected);
    const [b, c, m] = await Promise.all([
      db.from("boards").select("*").eq("project_id", selected),
      db.from("cards").select("*"),
      db
        .from("project_members")
        .select("role")
        .eq("project_id", selected)
        .eq("user_id", user)
        .maybeSingle(),
    ]);
    if (b.error || c.error || m.error) {
      notify((b.error || c.error || m.error)!.message);
      return;
    }
    undoHistory.reset({
      projects: p.data || [],
      boards: b.data || [],
      cards: c.data || [],
    });
    setBoards(b.data || []);
    setCards(c.data || []);
    setRole(m.data?.role || "viewer");
    setBoard((old) =>
      b.data?.some((v) => v.id === old) ? old : b.data?.[0]?.id || "",
    );
  }, [user, project]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!db) {
      localStorage.setItem("stillroom-cards", JSON.stringify(cards));
      localStorage.setItem("stillroom-boards", JSON.stringify(boards));
      localStorage.setItem("stillroom-projects", JSON.stringify(projects));
    }
  }, [cards, boards, projects]);
  const persist = async (c: Card) => {
    try {
      const saved = await saveCard(c);
      setCards((old) => old.map((v) => (v.id === c.id ? saved : v)));
      return true;
    } catch (e) {
      notify((e as Error).message);
      return false;
    }
  };
  const edit = (c: Card) => setEditing({ ...c });
  const toggle = (c: Card, i: number) => {
    const lines = c.content.split("\n");
    lines[i] = lines[i].startsWith("[x]")
      ? lines[i].replace("[x]", "[ ]")
      : lines[i].replace(/^\[ \]/, "[x]");
    void persist({ ...c, content: lines.join("\n") });
  };
  const download = async (c: Card) => {
    if (!db) {
      try {
        const blob = await readLocalFile(c.content);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = c.title;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) {
        notify((error as Error).message);
      }
      return;
    }
    const { data, error } = await db.storage
      .from("attachments")
      .createSignedUrl(c.content, 60);
    if (error) notify(error.message);
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  const projectCanvas = boards.find(
    (b) => b.project_id === project && b.is_project_canvas,
  );
  const contentBoardId =
    dashboard && !workspaceHome ? projectCanvas?.id : board;
  const visible = cards.filter(
    (c) => c.board_id === contentBoardId && matches(c.title, c.content, query),
  );
  const ensureContentBoard = async () => {
    if (!dashboard) return board;
    if (workspaceHome)
      throw new Error("Open a project to add notes, links, or files.");
    if (projectCanvas) return projectCanvas.id;
    let container: Board;
    if (db) {
      const { data, error } = await db.rpc("get_project_canvas", {
        p_project: project,
      });
      if (error)
        throw new Error(
          "Project canvas setup is missing. Apply migration 003 in Supabase. " +
            error.message,
        );
      container = (Array.isArray(data) ? data[0] : data) as Board;
      if (!container?.id)
        throw new Error("The project canvas could not be loaded.");
    } else
      container = {
        id: crypto.randomUUID(),
        project_id: project,
        title: "Project canvas",
        description: "",
        is_project_canvas: true,
      };
    setBoards((previous) =>
      previous.some((b) => b.id === container.id)
        ? previous
        : [...previous, container],
    );
    return container.id;
  };
  const makeNodes = () =>
    visible.map((c) => ({
      id: c.id,
      type: "card",
      position: { x: c.x, y: c.y },
      style: { width: c.width, height: c.height },
      data: {
        card: c,
        edit,
        toggle,
        download,
        canEdit,
        resize: (card: Card, width: number, height: number) =>
          persist({ ...card, width, height }),
      },
      draggable: canEdit,
    }));
  const [flow, setFlow] = useState<Pick<
    ReactFlowInstance,
    "screenToFlowPosition"
  > | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [dropping, setDropping] = useState(false);
  const dropOnCanvas = async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDropActive(false);
    if (!canEdit) {
      notify("You need editor access to add files to this note.");
      return;
    }
    if ((!dashboard && !current) || workspaceHome || !flow) {
      notify("Open a note before dropping files.");
      return;
    }
    if (dropping) {
      notify("Please wait for the current files to finish saving.");
      return;
    }
    const point = flow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) {
      for (const item of Array.from(event.dataTransfer.items)) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }
    const url = droppedUrl(
      event.dataTransfer.getData("text/uri-list"),
      event.dataTransfer.getData("text/plain"),
      event.dataTransfer.getData("text/html"),
    );
    if (!files.length && !url) {
      notify("Drop a file or a web link onto the canvas.");
      return;
    }
    setDropping(true);
    let added = 0;
    const rejected: string[] = [];
    try {
      const targetBoard = await ensureContentBoard();
      const items: (File | string)[] = files.length ? files : [url!];
      for (const [index, item] of items.entries()) {
        const id = crypto.randomUUID();
        const c: Card = {
          id,
          board_id: targetBoard,
          title: "",
          content: "",
          kind: typeof item === "string" ? "link" : "file",
          x: point.x + index * 35,
          y: point.y + index * 35,
          width: 330,
          height: typeof item === "string" && youtubeId(item) ? 340 : 190,
          version: 1,
          color: "white",
        };
        let uploadedPath: string | null = null;
        if (typeof item === "string") {
          c.title = youtubeId(item) ? "YouTube video" : new URL(item).hostname;
          c.content = item;
        } else {
          if (item.size > 20 * 1024 * 1024) {
            rejected.push(`${item.name} exceeds the 20 MB file limit.`);
            continue;
          }
          c.title = item.name;
          c.content = db
            ? `${project}/${id}/${item.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
            : `local:${id}`;
          if (db) {
            const { error } = await db.storage
              .from("attachments")
              .upload(c.content, item);
            if (error) throw error;
            uploadedPath = c.content;
          } else await storeLocalFile(c.content, item);
        }
        if (db) {
          const inserted = await db.from("cards").insert(c);
          if (inserted.error) {
            if (uploadedPath)
              await db.storage.from("attachments").remove([uploadedPath]);
            throw inserted.error;
          }
          if (uploadedPath && typeof item !== "string") {
            const attachment = await db.from("attachments").insert({
              project_id: project,
              card_id: id,
              path: uploadedPath,
              name: item.name,
            });
            if (attachment.error) {
              await db.from("cards").delete().eq("id", id);
              await db.storage.from("attachments").remove([uploadedPath]);
              throw attachment.error;
            }
          }
        }
        setCards((previous) => [...previous, c]);
        added += 1;
        setQuery("");
      }
      if (files.length)
        notify(
          [
            added
              ? `${added} file${added === 1 ? "" : "s"} added.${!db ? " Saved in this browser only." : ""}`
              : "",
            ...rejected,
          ]
            .filter(Boolean)
            .join(" "),
        );
    } catch (error) {
      notify(`Drop could not be completed: ${(error as Error).message}`);
    } finally {
      setDropping(false);
    }
  };
  const [nodes, setNodes] = useState<Node[]>([]);
  useEffect(
    () =>
      setNodes((previous) => {
        const selected = new Set(
          previous.filter((n) => n.selected).map((n) => n.id),
        );
        return makeNodes().map((n) => ({ ...n, selected: selected.has(n.id) }));
      }),
    [cards, board, query, canEdit, dashboard, workspaceHome, boards],
  );
  const [arranging, setArranging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const selectedNodes = nodes.filter((n) => n.selected);
  const selectAll = () =>
    setNodes((previous) => previous.map((n) => ({ ...n, selected: true })));
  const clearSelection = () =>
    setNodes((previous) => previous.map((n) => ({ ...n, selected: false })));
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        dashboard ||
        editing ||
        modal ||
        target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        selectAll();
      }
      if (event.key === "Escape") clearSelection();
      if (
        !event.repeat &&
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedNodes.length
      ) {
        event.preventDefault();
        void deleteNotes(
          cards.filter((c) => selectedNodes.some((n) => n.id === c.id)),
        );
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, [dashboard, editing, modal, nodes, cards, canEdit, deleting, arranging]);
  const savePositions = async (moved: Node[]) => {
    if (!canEdit || arranging) return;
    const changes = moved.flatMap((n) => {
      const c = cards.find((c) => c.id === n.id);
      return c && (c.x !== n.position.x || c.y !== n.position.y)
        ? [{ ...c, x: n.position.x, y: n.position.y }]
        : [];
    });
    if (!changes.length) return;
    setArranging(true);
    const results = await Promise.allSettled(changes.map((c) => saveCard(c)));
    const saved = new Map<string, Card>();
    const failures: string[] = [];
    results.forEach((result) => {
      if (result.status === "fulfilled")
        saved.set(result.value.id, result.value);
      else
        failures.push(
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
        );
    });
    setCards((previous) => previous.map((c) => saved.get(c.id) || c));
    if (failures.length)
      notify(
        `${saved.size} of ${changes.length} note positions saved. ${failures[0]} Unsaved notes returned to their previous positions.`,
      );
    setArranging(false);
  };
  const alignSelection = (direction: Alignment | "horizontal" | "vertical") => {
    if (!canEdit || arranging) return;
    const rectangles = selectedNodes.map((n) => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      width: cards.find((c) => c.id === n.id)!.width,
      height: cards.find((c) => c.id === n.id)!.height,
    }));
    const aligned = new Map(
      (direction === "horizontal" || direction === "vertical"
        ? distributeCards(rectangles, direction)
        : alignCards(rectangles, direction)
      ).map((c) => [c.id, c]),
    );
    const moved = selectedNodes.map((n) => ({
      ...n,
      position: { x: aligned.get(n.id)!.x, y: aligned.get(n.id)!.y },
    }));
    setNodes((previous) =>
      previous.map((n) => moved.find((v) => v.id === n.id) || n),
    );
    void savePositions(moved);
  };
  const onChanges = (changes: NodeChange[]) =>
    setNodes((nds) => applyNodeChanges(changes, nds));
  const add = async (kind: Kind) => {
    if (!canEdit) return;
    if (workspaceHome) {
      notify("Open a project to add notes.");
      return;
    }
    let targetBoard: string;
    try {
      targetBoard = await ensureContentBoard();
    } catch (error) {
      notify((error as Error).message);
      return;
    }
    const c: Card = {
      id: crypto.randomUUID(),
      board_id: targetBoard,
      title: kind === "checklist" ? "A fresh list" : "Untitled " + kind,
      content: kind === "checklist" ? "[ ] Your first task" : "",
      kind,
      x: 160 + Math.random() * 200,
      y: 120 + Math.random() * 150,
      width: 280,
      height: 230,
      version: 1,
      color: "white",
    };
    if (db) {
      const { error } = await db.from("cards").insert(c);
      if (error) {
        notify(error.message);
        return;
      }
    }
    setCards((v) => [...v, c]);
    setEditing(c);
  };
  const newProject = async () => {
    setWorkspaceHome(false);
    const title = prompt("Project name");
    if (!title?.trim()) return;
    if (db) {
      const { data, error } = await db.rpc("create_project", {
        p_title: title.trim(),
      });
      if (error) {
        notify(error.message);
        return;
      }
      setProject(data);
      setDashboard(true);
    } else {
      const p = { id: crypto.randomUUID(), title: title.trim() };
      setProjects((v) => [...v, p]);
      setProject(p.id);
      setDashboard(true);
    }
  };
  const deleteProjects = async (ids: string[]) => {
    if (deleting || !ids.length) return;
    const targets = projects.filter((p) => ids.includes(p.id));
    if (!targets.length) return;
    setDeleting(true);
    try {
      let deleted = targets.map((p) => p.id);
      if (db) deleted = await trashItems("projects", deleted);
      const removed = new Set(deleted);
      const boardIds = new Set(
        boards.filter((b) => removed.has(b.project_id)).map((b) => b.id),
      );
      const remaining = projects.filter((p) => !removed.has(p.id));
      setProjects(remaining);
      setBoards((previous) =>
        previous.filter((b) => !removed.has(b.project_id)),
      );
      setCards((previous) => previous.filter((c) => !boardIds.has(c.board_id)));
      if (removed.has(project)) {
        setProject(remaining[0]?.id || "");
        setBoard("");
        setQuery("");
        setDashboard(true);
        setEditing(null);
        setEdges([]);
        if (db) setRole("viewer");
      }
      notify(
        deleted.length === targets.length
          ? "Project deletion completed."
          : `${deleted.length} of ${targets.length} projects deleted. Only project owners can delete projects.`,
      );
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setDeleting(false);
    }
  };
  const deleteProject = () => deleteProjects([project]);
  const deleteBoards = async (ids: string[]) => {
    if (!canEdit || deleting || !ids.length) return;
    setDeleting(true);
    try {
      let deleted = ids;
      if (db) deleted = await trashItems("boards", ids);
      const removed = new Set(deleted);
      setBoards((previous) => previous.filter((b) => !removed.has(b.id)));
      setCards((previous) => previous.filter((c) => !removed.has(c.board_id)));
      if (removed.has(board)) {
        setBoard("");
        setDashboard(true);
        setEditing(null);
      }
      notify(
        `${deleted.length} of ${ids.length} notes deleted.${deleted.length < ids.length ? " Some notes could not be deleted; check your permissions." : ""}`,
      );
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setDeleting(false);
    }
  };
  const createBoard = async (source?: Board) => {
    setWorkspaceHome(false);
    if (!projects.some((p) => p.id === project)) {
      notify("Create a project first using the + beside Projects.");
      return;
    }

    const title = source ? source.title + " — copy" : prompt("Note name");
    if (!title?.trim()) return;
    const b: Board = {
      id: crypto.randomUUID(),
      project_id: project,
      title: title.trim(),
      description: source?.description || "Make room for a new idea.",
    };
    if (db) {
      const { error } = await db.from("boards").insert(b);
      if (error) {
        notify(error.message);
        return;
      }
    }
    setBoards((v) => [...v, b]);
    if (source) {
      const copies = cards
        .filter((c) => c.board_id === source.id)
        .map((c) => ({
          ...c,
          id: crypto.randomUUID(),
          board_id: b.id,
          version: 1,
        }));
      if (db && copies.length) {
        const { error } = await db.from("cards").insert(copies);
        if (error) {
          notify(
            "Note created, but its contents could not be copied: " +
              error.message,
          );
          return;
        }
      }
      setCards((v) => [...v, ...copies]);
    }
    setBoard(b.id);
    setDashboard(false);
  };
  const removeBoard = () => deleteBoards([board]);
  const duplicateCard = async (c: Card) => {
    const copy = {
      ...c,
      id: crypto.randomUUID(),
      title: c.title + " — copy",
      x: c.x + 35,
      y: c.y + 35,
      version: 1,
    };
    if (db) {
      const { error } = await db.from("cards").insert(copy);
      if (error) {
        notify(error.message);
        return;
      }
    }
    setCards((v) => [...v, copy]);
    setEditing(null);
  };
  const deleteNotes = async (targets: Card[]) => {
    if (!canEdit || deleting || arranging || !targets.length) return;
    setDeleting(true);
    try {
      const results = await Promise.allSettled(
        targets.map(async (c) => {
          if (db) {
            const removed = await trashItems("cards", [c.id], {
              [c.id]: c.version,
            });
            if (!removed.includes(c.id))
              throw new Error(
                "A note changed or access was denied. Refresh before deleting it.",
              );
          }
          return c.id;
        }),
      );
      const removed = new Set(
        results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
      );
      setCards((previous) => previous.filter((c) => !removed.has(c.id)));
      if (editing && removed.has(editing.id)) setEditing(null);
      const failed = results.find((r) => r.status === "rejected");
      notify(
        `${removed.size} of ${targets.length} notes deleted.${failed?.status === "rejected" ? " " + String(failed.reason instanceof Error ? failed.reason.message : failed.reason) : ""}`,
      );
    } finally {
      setDeleting(false);
    }
  };
  const deleteCard = (c: Card) => deleteNotes([c]);
  return (
    <div className="app minimal-workspace">
      <nav className="tool-rail" aria-label="Canvas tools">
        <button
          className="rail-brand"
          title="Home"
          aria-label="Home"
          onClick={() => {
            setWorkspaceHome(true);
            setDashboard(true);
            setSidebar(false);
            setQuery("");
          }}
        >
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
        </button>
        <button
          className="rail-tool"
          title="Browse projects"
          aria-label="Toggle navigation"
          onClick={() => setSidebar(!sidebar)}
        >
          <Folder size={21} strokeWidth={1.5} />
          <span>Browse</span>
        </button>
        <div className="rail-divider" />
        {(
          ["text", "link", "checklist", "image", "file", "group"] as Kind[]
        ).map((kind, index) => {
          const Icon = [
            Type,
            LinkIcon,
            CheckSquare,
            ImageIcon,
            Paperclip,
            LayoutGrid,
          ][index];
          return (
            <button
              className="rail-tool"
              key={kind}
              title={`Add ${kind}`}
              disabled={workspaceHome || !canEdit}
              onClick={() => void add(kind)}
            >
              <Icon size={21} strokeWidth={1.5} />
              <span>
                {["Note", "Link", "To-do", "Image", "File", "Group"][index]}
              </span>
            </button>
          );
        })}
        <button
          className="rail-tool"
          title={workspaceHome ? "Create project" : "New note"}
          aria-label={workspaceHome ? "Create project" : "New note"}
          disabled={!workspaceHome && !canEdit}
          onClick={() =>
            workspaceHome ? void newProject() : void createBoard()
          }
        >
          <Folder size={21} strokeWidth={1.5} />
          <span>{workspaceHome ? "Project" : "Note"}</span>
        </button>
        <div className="rail-divider" />
        <button
          className={`rail-tool ${arrangeOpen ? "active" : ""}`}
          title="Align and distribute"
          aria-label="Align and distribute"
          onClick={() => setArrangeOpen(!arrangeOpen)}
          aria-expanded={arrangeOpen}
        >
          <SlidersHorizontal size={21} strokeWidth={1.5} />
          <span>Arrange</span>
        </button>
        {!dashboard && (
          <button
            className="rail-tool danger"
            title="Delete selected notes"
            aria-label="Delete selected notes"
            disabled={
              !canEdit || !selectedNodes.length || deleting || arranging
            }
            onClick={() =>
              void deleteNotes(
                cards.filter((c) => selectedNodes.some((n) => n.id === c.id)),
              )
            }
          >
            <Trash2 size={20} strokeWidth={1.5} />
            <span>Delete</span>
          </button>
        )}
        <button
          className="rail-tool"
          title="Undo (Ctrl+Z / ⌘Z)"
          aria-label="Undo"
          disabled={
            !undoHistory.canUndo ||
            undoHistory.undoing ||
            deleting ||
            arranging ||
            busy ||
            dropping
          }
          onClick={() => void undoHistory.undo()}
        >
          <Undo2 size={21} strokeWidth={1.5} />
          <span>{undoHistory.undoing ? "Undoing…" : "Undo"}</span>
        </button>
        <button
          className="rail-tool rail-help"
          title="Canvas help"
          onClick={() =>
            notify(
              "Drag empty canvas to select. Shift-click adds notes. Arrange aligns or distributes your selection. Hold Space to pan. Drop files and links directly onto an open note.",
            )
          }
        >
          <HelpCircle size={20} strokeWidth={1.5} />
          <span>Help</span>
        </button>
      </nav>
      {sidebar && (
        <button
          className="drawer-dismiss"
          aria-label="Close navigation"
          onClick={() => setSidebar(false)}
        />
      )}

      <aside className={sidebar ? "sidebar open" : "sidebar"}>
        <a className="brand" href="#" onClick={() => setDashboard(true)}>
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          stillroom<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <button
          className={`nav-item ${dashboard ? "active" : ""}`}
          onClick={() => {
            setDashboard(true);
            setWorkspaceHome(true);
            setSidebar(false);
          }}
        >
          <LayoutGrid size={17} /> All projects
          <span className="count">{projects.length}</span>
        </button>
        <button
          className="nav-item"
          onClick={() => {
            setQuery("");
            setDashboard(true);
          }}
        >
          <Folder size={17} /> Project library
        </button>
        <div className="nav-section">
          <span>PROJECTS</span>
          <button
            aria-label="Create project from navigation"
            onClick={() => void newProject()}
          >
            <Plus size={15} />
          </button>
        </div>
        {projects.map((p) => (
          <div key={p.id}>
            <button
              className={`project-nav ${project === p.id ? "selected" : ""}`}
              onClick={() => {
                setProject(p.id);
                setWorkspaceHome(false);
                setDashboard(true);
                setSidebar(false);
              }}
            >
              <span className="project-avatar">
                <Moon size={16} />
              </span>
              <span>{p.title}</span>
              <ChevronDown size={14} />
            </button>
            {project === p.id && (
              <div className="board-nav">
                {boards
                  .filter(
                    (b) => b.project_id === project && !b.is_project_canvas,
                  )
                  .map((b) => (
                    <button
                      key={b.id}
                      className={board === b.id && !dashboard ? "selected" : ""}
                      onClick={() => {
                        setBoard(b.id);
                        setDashboard(false);
                        setSidebar(false);
                      }}
                    >
                      <span className="board-dot" />
                      {b.title}
                    </button>
                  ))}
                {canEdit && (
                  <button onClick={() => void createBoard()}>
                    <Plus size={14} /> New note
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        <div className="sidebar-bottom">
          <div className="quiet-box">
            <span>Good ideas need a little space.</span>
            <span className="sprout">✳</span>
          </div>
          <button
            className="nav-item"
            onClick={() =>
              notify(
                "Drag notes by their body. Select a note to resize it. Double-click to edit. Use the left tools to add ideas.",
              )
            }
          >
            <HelpCircle size={17} /> A little help <ArrowUpRight size={14} />
          </button>
          <div className="profile">
            <span className="avatar">{user ? "Y" : "A"}</span>
            <div>
              <strong>{user ? "Your workspace" : "Addison’s workspace"}</strong>
              <small>
                {db ? "Connected workspace" : "Local demo · this browser"}
              </small>
            </div>
            <button
              aria-label={user ? "Sign out" : "Sign in"}
              onClick={() =>
                user ? void db?.auth.signOut() : setModal("auth")
              }
            >
              {user ? <LogOut size={15} /> : <ChevronDown size={15} />}
            </button>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            onClick={() => setSidebar(!sidebar)}
            aria-label="Toggle navigation"
          >
            <PanelLeftClose size={19} />
          </button>
          <div className="breadcrumbs">
            <button
              onClick={() => {
                setWorkspaceHome(true);
                setDashboard(true);
                setQuery("");
              }}
            >
              <Home size={14} /> Home
            </button>
            {!workspaceHome && (
              <>
                <ChevronRight size={12} />
                <button
                  onClick={() => {
                    setWorkspaceHome(false);
                    setDashboard(true);
                  }}
                >
                  {projects.find((p) => p.id === project)?.title || "Projects"}
                </button>
                {!dashboard && (
                  <>
                    <ChevronRight size={12} />
                    <strong>{current?.title}</strong>
                  </>
                )}
              </>
            )}
          </div>
          <div className="top-actions">
            <label className="search">
              <Search size={15} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find an idea…"
                aria-label="Search notes"
              />
            </label>
            <span className="save-state">
              <span />
              {db ? "Cloud workspace" : "Local demo"}
            </span>
            <button
              className="icon-button"
              onClick={() => notify("Light mode is currently enabled.")}
              aria-label="Light mode"
            >
              <Sun size={18} />
            </button>
          </div>
        </header>
        <section className="board-header">
          <div>
            <button
              className="back-link"
              onClick={() => {
                setWorkspaceHome(true);
                setDashboard(true);
              }}
            >
              <ArrowLeft size={13} /> ALL PROJECTS
            </button>
            <div className="title-row">
              <h1>
                {dashboard
                  ? workspaceHome
                    ? "Home"
                    : projects.find((p) => p.id === project)?.title ||
                      "Your creative space"
                  : current?.title || "Start with a note"}
              </h1>
              <span className="private-tag">
                <Moon size={11} /> PRIVATE
              </span>
            </div>
            <p>
              {dashboard
                ? "A home for your stories, your inspiration, and your next big idea."
                : current?.description}
            </p>
          </div>
          <div className="header-buttons">
            {!workspaceHome &&
              projects.some((p) => p.id === project) &&
              (!db || role === "owner") && (
                <button
                  className="button danger"
                  onClick={() => void deleteProject()}
                  aria-label="Delete project"
                >
                  <Trash2 size={15} />
                  <span>Delete project</span>
                </button>
              )}

            <div className="collaborator-stack">
              <span className="avatar">A</span>
            </div>
            <button
              className="button"
              onClick={() => {
                setEmail("");
                setModal("invite");
              }}
            >
              <Users size={15} /> Share project
            </button>
            <button
              className="icon-button"
              aria-label="Refresh saved changes"
              onClick={() => {
                if (db) void load();
                else notify("Your local changes are saved in this browser.");
              }}
            >
              <MoreHorizontal size={21} />
            </button>
          </div>
        </section>
        {!dashboard && (
          <ArrangePanel
            open={arrangeOpen}
            count={selectedNodes.length}
            total={nodes.length}
            canArrange={canEdit}
            busy={arranging || deleting || undoHistory.undoing}
            onSelectAll={selectAll}
            onClear={clearSelection}
            onArrange={alignSelection}
          />
        )}
        {dashboard ? (
          <ExplorerCanvas
            key={workspaceHome ? "home" : project}
            scope={workspaceHome ? "home" : project}
            arrangeOpen={arrangeOpen}
            onError={notify}
            onDelete={
              workspaceHome
                ? deleteProjects
                : async (ids) => {
                    const containerIds = ids.filter((id) =>
                      boards.some((b) => b.id === id && !b.is_project_canvas),
                    );
                    const content = cards.filter(
                      (c) =>
                        ids.includes(c.id) &&
                        !containerIds.includes(c.board_id),
                    );
                    if (containerIds.length) await deleteBoards(containerIds);
                    if (content.length) await deleteNotes(content);
                  }
            }
            contentNodes={workspaceHome ? [] : nodes}
            contentTypes={nodeTypes}
            onInit={setFlow}
            onContentChange={onChanges}
            onContentMove={savePositions}
            onDrop={workspaceHome ? undefined : dropOnCanvas}
            canDrop={!workspaceHome && canEdit}
            dropping={dropping}
            canDelete={workspaceHome || canEdit}
            recordUndo={undoHistory.recordExternal}
            label={workspaceHome ? "Create a project" : "Create a note"}
            onCreate={
              workspaceHome
                ? () => void newProject()
                : canEdit
                  ? () => void createBoard()
                  : undefined
            }
            items={
              workspaceHome
                ? projects
                    .filter(
                      (p) =>
                        matches(p.title, "", query) ||
                        boards.some(
                          (b) =>
                            b.project_id === p.id &&
                            matches(b.title, b.description, query),
                        ),
                    )
                    .map((p) => ({
                      id: p.id,
                      title: p.title,
                      detail: `${boards.filter((b) => b.project_id === p.id && !b.is_project_canvas).length} notes`,
                      kind: "project" as const,
                    }))
                : boards
                    .filter(
                      (b) =>
                        b.project_id === project &&
                        !b.is_project_canvas &&
                        (matches(b.title, b.description, query) ||
                          cards.some(
                            (c) =>
                              c.board_id === b.id &&
                              matches(c.title, c.content, query),
                          )),
                    )
                    .map((b) => ({
                      id: b.id,
                      title: b.title,
                      detail: `${cards.filter((c) => c.board_id === b.id).length} notes`,
                      kind: "board" as const,
                    }))
            }
            onOpen={(id) => {
              setQuery("");
              if (workspaceHome) {
                setProject(id);
                setWorkspaceHome(false);
                setDashboard(true);
              } else {
                setBoard(id);
                setDashboard(false);
              }
            }}
          />
        ) : (
          <div
            className={`canvas-wrap ${dropActive ? "drop-active" : ""}`}
            onPointerDownCapture={(event) => {
              if (arranging) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onDragEnterCapture={(event) => {
              event.preventDefault();
              if (canEdit) setDropActive(true);
            }}
            onDragOverCapture={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = canEdit
                ? acceptedDropEffect(event.dataTransfer.effectAllowed)
                : "none";
              if (canEdit) setDropActive(true);
            }}
            onDragLeave={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              if (
                event.clientX <= rect.left ||
                event.clientX >= rect.right ||
                event.clientY <= rect.top ||
                event.clientY >= rect.bottom
              )
                setDropActive(false);
            }}
            onDropCapture={(event) => void dropOnCanvas(event)}
          >
            {(dropActive || dropping) && (
              <div className="drop-overlay" role="status">
                <Plus size={28} />
                <strong>
                  {dropping ? "Adding your notes…" : "Drop it here"}
                </strong>
                <span>Web links, YouTube videos, and files up to 20 MB</span>
              </div>
            )}
            <ReactFlow
              onInit={setFlow}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onChanges}
              selectionOnDrag
              selectionMode={SelectionMode.Partial}
              panOnDrag={[1, 2]}
              multiSelectionKeyCode={["Shift", "Meta", "Control"]}
              onNodeDragStop={(_event, node, moved) =>
                void savePositions(moved.length ? moved : [node])
              }
              onSelectionDragStop={(_event, moved) => void savePositions(moved)}
              onNodeClick={() => {}}
              onNodesDelete={() => {}}
              deleteKeyCode={null}
              onConnect={(connection) => {
                if (canEdit) {
                  setEdges((v) => [
                    ...v,
                    {
                      id: crypto.randomUUID(),
                      source: connection.source,
                      target: connection.target,
                    },
                  ]);
                  notify("Visual connection added for this session.");
                }
              }}
              onNodeDoubleClick={(_e, n) => {
                const c = cards.find((c) => c.id === n.id);
                if (c) edit(c);
              }}
              onNodeDragStart={() => setMessage("")}
              onMoveEnd={() => {}}
              defaultViewport={{ x: 35, y: 30, zoom: 0.85 }}
              minZoom={0.25}
              maxZoom={1.6}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={22}
                size={1}
                color="#deddd5"
              />
              <Controls showInteractive={false} />
            </ReactFlow>
            <div className="canvas-caption">
              <span className="tiny-star">✳</span> A little space for a big
              story. Drag links & files here.
            </div>
            <div className="board-options">
              {canEdit && current && (
                <>
                  <button
                    onClick={() => {
                      const name = prompt("Note title", current.title);
                      if (!name?.trim()) return;
                      void (async () => {
                        if (db) {
                          const { error } = await db
                            .from("boards")
                            .update({ title: name.trim() })
                            .eq("id", board);
                          if (error) {
                            notify(error.message);
                            return;
                          }
                        }
                        setBoards((v) =>
                          v.map((b) =>
                            b.id === board ? { ...b, title: name.trim() } : b,
                          ),
                        );
                      })();
                    }}
                  >
                    Rename
                  </button>
                  <button onClick={() => void createBoard(current)}>
                    Duplicate
                  </button>
                  <button onClick={() => void removeBoard()}>Delete</button>
                </>
              )}
            </div>
          </div>
        )}
      </main>
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setMessage("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {editing && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              void persist(editing).then((ok) => {
                setBusy(false);
                if (ok) setEditing(null);
              });
            }}
          >
            <div className="modal-heading">
              <div>
                <small>{canEdit ? "MAKE IT YOURS" : "VIEW NOTE"}</small>
                <h2>{editing.kind === "group" ? "Idea group" : "Edit note"}</h2>
              </div>
              <button
                type="button"
                aria-label="Close editor"
                onClick={() => setEditing(null)}
              >
                <X size={20} />
              </button>
            </div>
            <label>
              Title
              <input
                disabled={!canEdit}
                required
                value={editing.title}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
              />
            </label>
            <label>
              {editing.kind === "image" || editing.kind === "link"
                ? "URL"
                : editing.kind === "checklist"
                  ? "Tasks · one per line, starting with [ ] or [x]"
                  : "Content · Markdown formatting supported"}
              <textarea
                disabled={!canEdit}
                rows={8}
                value={editing.content}
                onChange={(e) =>
                  setEditing({ ...editing, content: e.target.value })
                }
              />
            </label>
            {editing.kind === "file" && canEdit && (
              <label>
                Upload a private attachment
                <input
                  type="file"
                  disabled={!db || busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !db) return;
                    setBusy(true);
                    const path = `${project}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
                    const up = await db.storage
                      .from("attachments")
                      .upload(path, file);
                    if (up.error) notify(up.error.message);
                    else {
                      const record = await db.from("attachments").insert({
                        project_id: project,
                        card_id: editing.id,
                        path,
                        name: file.name,
                      });
                      if (record.error) {
                        await db.storage.from("attachments").remove([path]);
                        notify(record.error.message);
                      } else
                        setEditing({
                          ...editing,
                          content: path,
                          title: file.name,
                        });
                    }
                    setBusy(false);
                  }}
                />
                {!db && <small>Connect Supabase to upload files.</small>}
              </label>
            )}
            <label>
              Note color
              <select
                disabled={!canEdit}
                value={editing.color}
                onChange={(e) =>
                  setEditing({ ...editing, color: e.target.value })
                }
              >
                {["white", "cream", "lavender", "pink"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <div className="modal-footer">
              {canEdit && (
                <>
                  <button
                    type="button"
                    className="icon-button danger"
                    title="Delete note"
                    onClick={() => void deleteCard(editing)}
                  >
                    <Trash2 size={18} />
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => void duplicateCard(editing)}
                  >
                    <Copy size={15} /> Duplicate
                  </button>
                  <button className="primary" disabled={busy}>
                    {busy ? "Saving…" : "Save changes"}
                    <Check size={15} />
                  </button>
                </>
              )}
            </div>
            <small className="editor-hint">
              Plain text preserves your words safely. Version {editing.version}{" "}
              · changes save when you choose Save.
            </small>
          </form>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop">
          <form
            className="modal small-modal"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!db) {
                notify(
                  "This is a local demo. Follow the setup guide to connect Supabase for accounts and sharing.",
                );
                return;
              }
              setBusy(true);
              if (modal === "auth") {
                const { error } = await db.auth.signInWithOtp({
                  email,
                  options: {
                    emailRedirectTo:
                      window.location.origin + window.location.pathname,
                  },
                });
                notify(
                  error
                    ? error.message
                    : "Check your email for your sign-in link.",
                );
              } else {
                const { error } = await db.from("project_invites").insert({
                  project_id: project,
                  email: email.trim().toLowerCase(),
                  role: inviteRole,
                });
                notify(
                  error
                    ? error.message
                    : "Invitation recorded. Ask your collaborator to sign in at this app using that email. Email delivery is not configured.",
                );
                if (!error) setModal(null);
              }
              setBusy(false);
            }}
          >
            <div className="modal-heading">
              <h2>
                {modal === "auth"
                  ? "Your ideas, together."
                  : "Make room for someone."}
              </h2>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={() => setModal(null)}
              >
                <X size={20} />
              </button>
            </div>
            <p>
              {modal === "auth"
                ? "Sign in with a secure email link to access your shared projects."
                : "Invite a collaborator to this project. Permissions apply to every note in the project."}
            </p>
            <label>
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            {modal === "invite" && (
              <label>
                Permission
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                >
                  <option value="editor">Editor · can create and edit</option>
                  <option value="viewer">Viewer · read only</option>
                  <option value="owner">Owner · can manage access</option>
                </select>
              </label>
            )}
            <button
              className="primary"
              disabled={
                busy || (modal === "invite" && db !== null && role !== "owner")
              }
            >
              {busy
                ? "Please wait…"
                : modal === "auth"
                  ? "Send sign-in link"
                  : "Create invitation"}
              <ArrowUpRight size={16} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
