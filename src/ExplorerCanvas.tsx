import { useEffect, useState, type DragEvent } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  SelectionMode,
  applyNodeChanges,
  type Node,
  type NodeProps,
  type NodeTypes,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import { Folder, LayoutGrid, Plus, ArrowUpRight, Trash2 } from "lucide-react";
import { acceptedDropEffect } from "./drops";
export interface ExplorerItem {
  id: string;
  title: string;
  detail: string;
  kind: "project" | "board";
}
function Tile({ data }: NodeProps) {
  const item = data.item as ExplorerItem;
  const Icon = item.kind === "project" ? Folder : LayoutGrid;
  return (
    <div className="explorer-tile">
      <button
        className={`explorer-open tile-color-${Number(data.index) % 5}`}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.stopPropagation();
            void (data.open as (id: string) => void)(item.id);
          }
        }}
        aria-label={`Select ${item.title}`}
      >
        <Icon size={30} strokeWidth={1.5} />
        <ArrowUpRight className="tile-arrow" size={13} />
      </button>
      <strong>{item.title}</strong>
      <small>{item.detail}</small>
    </div>
  );
}
const nodeTypes = { tile: Tile };
export function ExplorerCanvas({
  items,
  scope,
  onOpen,
  onCreate,
  label,
  onDelete,
  canDelete = true,
  recordUndo,
  contentNodes = [],
  contentTypes = {},
  onInit,
  onContentChange,
  onContentMove,
  onDrop,
  canDrop = false,
  dropping = false,
}: {
  items: ExplorerItem[];
  scope: string;
  onOpen: (id: string) => void;
  onCreate?: () => void;
  label: string;
  onDelete: (ids: string[]) => Promise<void>;
  canDelete?: boolean;
  recordUndo: (action: () => Promise<void>) => void;
  contentNodes?: Node[];
  contentTypes?: NodeTypes;
  onInit?: (flow: ReactFlowInstance) => void;
  onContentChange?: (changes: NodeChange[]) => void;
  onContentMove?: (nodes: Node[]) => void;
  onDrop?: (event: DragEvent) => Promise<void>;
  canDrop?: boolean;
  dropping?: boolean;
}) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const openNode = (node: Node) => {
    if (node.type === "tile") onOpen(node.id);
    else (node.data.edit as (card: unknown) => void)(node.data.card);
  };
  const [layoutRevision, setLayoutRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setLayoutRevision((v) => v + 1);
    window.addEventListener("stillroom-layout-change", refresh);
    return () => window.removeEventListener("stillroom-layout-change", refresh);
  }, []);
  const [deleting, setDeleting] = useState(false);
  const selected = nodes.filter((n) => n.selected);
  const deleteSelection = async () => {
    if (deleting || !canDelete || !selected.length) return;
    setDeleting(true);
    try {
      await onDelete(selected.map((n) => n.id));
    } finally {
      setDeleting(false);
    }
  };
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"],[role="dialog"],.modal-backdrop',
        )
      )
        return;
      if (event.repeat) return;
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selected.length
      ) {
        event.preventDefault();
        void deleteSelection();
      }
      if (event.key === "Enter" && selected.length === 1) {
        event.preventDefault();
        openNode(selected[0]);
      }
      if (event.key === "Escape")
        setNodes((previous) =>
          previous.map((n) => ({ ...n, selected: false })),
        );
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setNodes((previous) => previous.map((n) => ({ ...n, selected: true })));
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, [nodes, deleting, canDelete, onDelete, onOpen]);
  useEffect(() => {
    let saved: Record<string, { x: number; y: number }> = {};
    try {
      saved = JSON.parse(
        localStorage.getItem(`stillroom-layout:${scope}`) || "{}",
      );
    } catch {
      /* A damaged layout does not affect project data. */
    }
    setNodes((previous) => [
      ...items.map((item, index) => ({
        id: item.id,
        selected: previous.some((n) => n.id === item.id && n.selected),
        type: "tile" as const,
        position: saved[item.id] || {
          x: 100 + (index % 5) * 200,
          y: 95 + Math.floor(index / 5) * 200,
        },
        data: { item, index, open: onOpen },
        style: { width: 155 },
      })),
      ...contentNodes.map((node) => ({
        ...node,
        selected:
          node.selected ?? previous.some((n) => n.id === node.id && n.selected),
      })),
    ]);
  }, [items, scope, layoutRevision, contentNodes]);
  return (
    <div
      className={`explorer-canvas ${dragActive ? "drop-active" : ""}`}
      data-drop-enabled={canDrop ? "true" : "false"}
      onDragEnterCapture={(event) => {
        if (canDrop) {
          event.preventDefault();
          setDragActive(true);
        }
      }}
      onDragOverCapture={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = canDrop
          ? acceptedDropEffect(event.dataTransfer.effectAllowed)
          : "none";
        if (canDrop) setDragActive(true);
      }}
      onDragLeave={(event) => {
        const r = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX <= r.left ||
          event.clientX >= r.right ||
          event.clientY <= r.top ||
          event.clientY >= r.bottom
        )
          setDragActive(false);
      }}
      onDropCapture={(event) => {
        event.preventDefault();
        setDragActive(false);
        if (canDrop && onDrop) void onDrop(event);
      }}
    >
      {(dragActive || dropping) && (
        <div className="drop-overlay" role="status">
          <Plus size={28} />
          <strong>{dropping ? "Adding your notes…" : "Drop it here"}</strong>
          <span>Web links, YouTube videos, and files up to 20 MB</span>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        nodeTypes={{ ...nodeTypes, ...contentTypes }}
        onInit={onInit}
        onNodesChange={(changes) => {
          setNodes((previous) => applyNodeChanges(changes, previous));
          const contentChanges = changes.filter(
            (change) =>
              "id" in change && contentNodes.some((n) => n.id === change.id),
          );
          if (contentChanges.length) onContentChange?.(contentChanges);
        }}
        onNodeDragStop={(_event, node, moved) => {
          const movedNodes = moved.length ? moved : [node];
          const content = movedNodes.filter((n) => n.type !== "tile");
          if (content.length) onContentMove?.(content);
          const tiles = movedNodes.filter((n) => n.type === "tile");
          if (!tiles.length) return;
          try {
            const key = `stillroom-layout:${scope}`;
            const oldLayout = localStorage.getItem(key);
            const saved = JSON.parse(oldLayout || "{}");
            for (const tile of tiles) saved[tile.id] = tile.position;
            localStorage.setItem(key, JSON.stringify(saved));
            recordUndo(async () => {
              if (oldLayout === null) localStorage.removeItem(key);
              else localStorage.setItem(key, oldLayout);
              window.dispatchEvent(new Event("stillroom-layout-change"));
            });
          } catch {
            /* Tile positions remain personal. */
          }
        }}
        onNodeDoubleClick={(_event, node) => openNode(node)}
        multiSelectionKeyCode={["Shift", "Meta", "Control"]}
        selectionMode={SelectionMode.Partial}
        panOnDrag={[1, 2]}
        selectionOnDrag
        minZoom={0.3}
        maxZoom={1.6}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        deleteKeyCode={null}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="#d7dcd3"
          gap={18}
          size={1}
        />
        <Controls showInteractive={false} />
      </ReactFlow>
      {!!selected.length && (
        <div
          className="explorer-selection"
          role="toolbar"
          aria-label="Selected items"
        >
          <span>{selected.length} selected</span>
          {selected.length === 1 && (
            <button onClick={() => openNode(selected[0])}>Open</button>
          )}
          <button
            disabled={!canDelete || deleting}
            onClick={() => void deleteSelection()}
          >
            <Trash2 size={15} /> {deleting ? "Deleting…" : "Delete selected"}
          </button>
        </div>
      )}
      {!items.length && !contentNodes.length && !dragActive && !dropping && (
        <div className="explorer-empty">
          <Folder size={32} strokeWidth={1} />
          <h2>A little space to begin.</h2>
          <p>{label}</p>
          {onCreate && (
            <button className="button" onClick={onCreate}>
              <Plus size={16} /> {label}
            </button>
          )}
        </div>
      )}
      <div className="explorer-caption">
        Click to select · Double-click or Enter to open · Delete to remove
      </div>
    </div>
  );
}
