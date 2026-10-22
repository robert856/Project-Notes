import { useState, useEffect, useRef, type DragEvent } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  NodeResizer,
  applyNodeChanges,
  SelectionMode,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import { Files, ArrowUpRight, Download, Link as LinkIcon } from "lucide-react";
import Markdown from "react-markdown";
import type { Page } from "./pages";
import { ancestors, pageSize } from "./pages";
import { safeUrl } from "./model";
import { youtubeId, acceptedDropEffect } from "./drops";
import { fileUrl } from "./pageRepository";
import { InlineChecklist } from "./InlineChecklist";
function PageNode({ data, selected }: NodeProps) {
  const p = data.page as Page,
    [renaming, setRenaming] = useState(false),
    [draft, setDraft] = useState(p.title);
  const [privateImage, setPrivateImage] = useState<string>();
  useEffect(() => {
    let cancelled = false,
      objectUrl: string | undefined;
    setPrivateImage(undefined);
    if (
      p.kind === "file" &&
      p.content &&
      /\.(png|jpe?g|webp|gif|avif)$/i.test(p.title)
    ) {
      void fileUrl(p)
        .then((url) => {
          if (url.startsWith("blob:")) objectUrl = url;
          if (!cancelled) setPrivateImage(url);
          else if (objectUrl) URL.revokeObjectURL(objectUrl);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [p.content, p.title]);
  const rename = () => {
    setRenaming(false);
    if (draft.trim() && draft !== p.title)
      void (data.rename as (p: Page, title: string) => void)(p, draft.trim());
  };
  const video = p.kind === "link" ? youtubeId(p.content) : null;
  return (
    <article
      className={`page-card page-format-${p.kind} page-color-${p.color} page-tile-tone-${[...p.id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 5}`}
    >
      <NodeResizer
        minWidth={170}
        minHeight={120}
        isVisible={
          p.kind !== "page" && !!selected && !!data.editable && !data.busy
        }
        onResizeEnd={(_e, size) =>
          (
            data.resize as (
              p: Page,
              size: { x: number; y: number; width: number; height: number },
            ) => void
          )(p, size)
        }
      />
      {p.kind === "page" && (
        <div className="page-icon-block">
          <Files className="page-symbol" size={30} strokeWidth={1.5} />
        </div>
      )}
      {renaming ? (
        <input
          autoFocus
          className="nodrag nopan page-title-input"
          aria-label="Page title"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onDoubleClick={(e) => e.stopPropagation()}
          onBlur={rename}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(p.title);
              setRenaming(false);
            }
          }}
        />
      ) : (
        <button
          className="nodrag page-card-title"
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label={`Rename ${p.title}`}
          disabled={!data.editable || !!data.busy}
          onClick={() => {
            setDraft(p.title);
            setRenaming(true);
          }}
        >
          {p.title || "Untitled page"}
        </button>
      )}
      <div className="page-preview">
        {p.kind === "image" && safeUrl(p.content) ? (
          <img draggable={false} src={p.content} alt={p.title} />
        ) : p.kind === "link" ? (
          <>
            {video && (
              <img
                draggable={false}
                src={`https://i.ytimg.com/vi/${video}/hqdefault.jpg`}
                alt="Video thumbnail"
              />
            )}
            <a
              className="nodrag"
              href={safeUrl(p.content) || undefined}
              target="_blank"
              rel="noreferrer"
            >
              <LinkIcon size={14} />
              {video
                ? "Watch on YouTube"
                : safeUrl(p.content)
                  ? new URL(p.content).hostname
                  : "Open link"}
            </a>
          </>
        ) : p.kind === "file" ? (
          <button
            className="nodrag page-file"
            disabled={!p.content}
            onClick={() => (data.download as (p: Page) => void)(p)}
          >
            {privateImage && (
              <img src={privateImage} alt={p.title} draggable={false} />
            )}
            <Download size={19} />
            {p.content ? "Open attachment" : "No attachment yet"}
          </button>
        ) : p.kind === "checklist" ? (
          <InlineChecklist
            page={p}
            editable={!!data.editable}
            onSave={(content, version) =>
              (
                data.saveTasks as (
                  content: string,
                  version: number,
                ) => Promise<void>
              )(content, version)
            }
          />
        ) : (
          <Markdown>{p.content.slice(0, 1200)}</Markdown>
        )}
      </div>
      <button
        className="nodrag page-open"
        aria-label={`Open ${p.title}`}
        onClick={() => (data.open as (id: string) => void)(p.id)}
      >
        <span>
          {String(data.children)} {data.children === 1 ? "page" : "pages"}
        </span>
        <ArrowUpRight size={14} />
      </button>
    </article>
  );
}
const nodeTypes = { page: PageNode };
export function PageCanvas({
  pages,
  all,
  current,
  editable,
  selection,
  onSelection,
  onOpen,
  onRename,
  onSave,
  onMove,
  onDrop,
  onHover,
  onDownload,
  busy,
  onReady,
  onError,
}: {
  pages: Page[];
  all: Page[];
  current: string | null;
  editable: (p: Page) => boolean;
  selection: string[];
  onSelection: (ids: string[]) => void;
  onOpen: (id: string) => void;
  onRename: (p: Page, title: string) => void;
  onSave: (
    edits: (Partial<Page> & { id: string; version: number })[],
  ) => Promise<void>;
  onMove: (p: Page, parent: string | null) => Promise<void>;
  onDrop: (event: DragEvent, flow: ReactFlowInstance) => void;
  onHover: (id: string | undefined) => void;
  onDownload: (p: Page) => void;
  busy: boolean;
  onReady: (flow: ReactFlowInstance) => void;
  onError: (message: string) => void;
}) {
  const [nodes, setNodes] = useState<Node[]>([]),
    [hover, setHover] = useState<string>();
  const flow = useRef<ReactFlowInstance | null>(null);
  const clear = () => {
    setHover(undefined);
    onHover(undefined);
    document.documentElement.classList.remove("canvas-dragging");
  };
  useEffect(() => {
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("blur", clear);
      document.documentElement.classList.remove("canvas-dragging");
    };
  }, []);
  const editState = pages.map((p) => editable(p)).join(",");
  useEffect(() => {
    setNodes((previous) =>
      pages.map((p) => ({
        id: p.id,
        type: "page",
        position: { x: p.x, y: p.y },
        ...pageSize(p),
        draggable: editable(p) && !busy,
        selected: previous.find((n) => n.id === p.id)?.selected || false,
        data: {
          page: p,
          children: all.filter((c) => c.parent_id === p.id).length,
          editable: editable(p),
          open: onOpen,
          rename: onRename,
          resize: (
            p: Page,
            size: { x: number; y: number; width: number; height: number },
          ) =>
            void onSave([{ id: p.id, version: p.version, ...size }]).catch(
              (e) => onError(e.message),
            ),
          download: onDownload,
          busy,
          saveTasks: (content: string, version: number) =>
            onSave([{ id: p.id, version, content }]),
        },
      })),
    );
  }, [pages, all, editState, busy]);
  useEffect(() => {
    setNodes((previous) =>
      previous.map((n) => ({ ...n, selected: selection.includes(n.id) })),
    );
  }, [selection]);
  const target = (
    event: MouseEvent | TouchEvent,
    node: Node,
    moved: Node[],
  ) => {
    if (moved.length > 1) return undefined;
    const p = all.find((p) => p.id === node.id);
    if (!p) return undefined;
    const point = "touches" in event ? event.changedTouches[0] : event;
    const crumb = document
      .elementFromPoint(point.clientX, point.clientY)
      ?.closest<HTMLElement>("[data-page-destination]");
    let id = crumb?.dataset.pageDestination;
    if (!id) {
      const center = {
        x: node.position.x + node.width! / 2,
        y: node.position.y + 45,
      };
      id = nodes.find(
        (n) =>
          n.id !== node.id &&
          center.x >= n.position.x &&
          center.x <= n.position.x + (n.width || 260) &&
          center.y >= n.position.y &&
          center.y <= n.position.y + (n.height || 200),
      )?.id;
    }
    if (!id || id === (current || "home") || id === p.id) return undefined;
    const destination = id === "home" ? null : all.find((p) => p.id === id);
    if (
      destination === undefined ||
      (destination &&
        (!editable(destination) ||
          ancestors(all, destination.id).some((a) => a.id === p.id)))
    )
      return undefined;
    return id;
  };
  return (
    <div
      className="pages-canvas"
      aria-label="Page canvas"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = acceptedDropEffect(
          e.dataTransfer.effectAllowed,
        );
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (flow.current) onDrop(e, flow.current);
      }}
    >
      <ReactFlow<Node>
        key={current || "home"}
        nodes={nodes.map((n) => ({
          ...n,
          className: n.id === hover ? "page-landing" : "",
        }))}
        nodeTypes={nodeTypes}
        onInit={(instance) => {
          flow.current = instance;
          onReady(instance);
        }}
        onNodesChange={(changes) =>
          setNodes((previous) => applyNodeChanges(changes, previous))
        }
        onSelectionChange={({ nodes }) => onSelection(nodes.map((n) => n.id))}
        onNodeDoubleClick={(_e, n) => onOpen(n.id)}
        onNodeDragStart={() =>
          document.documentElement.classList.add("canvas-dragging")
        }
        onNodeDrag={(event, node, moved) => {
          const id = target(event, node, moved);
          setHover(id);
          onHover(id);
        }}
        onNodeDragStop={(event, node, moved) => {
          const id = target(event, node, moved);
          clear();
          const restore = () =>
            setNodes((previous) =>
              previous.map((n) => {
                const p = all.find((p) => p.id === n.id);
                return p ? { ...n, position: { x: p.x, y: p.y } } : n;
              }),
            );
          if (id) {
            const p = all.find((p) => p.id === node.id)!;
            void onMove(p, id === "home" ? null : id).catch((e) => {
              restore();
              onError(e.message);
            });
          } else {
            const edits = (moved.length ? moved : [node]).flatMap((n) => {
              const p = all.find((p) => p.id === n.id);
              return p && (p.x !== n.position.x || p.y !== n.position.y)
                ? [
                    {
                      id: p.id,
                      version: p.version,
                      x: n.position.x,
                      y: n.position.y,
                    },
                  ]
                : [];
            });
            if (edits.length)
              void onSave(edits).catch((e) => {
                restore();
                onError(e.message);
              });
          }
        }}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={["Shift", "Meta", "Control"]}
        panOnDrag={[1, 2]}
        minZoom={0.3}
        maxZoom={1.6}
        deleteKeyCode={null}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} color="#d7dcd3" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
