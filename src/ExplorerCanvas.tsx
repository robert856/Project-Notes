import { useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  SelectionMode,
  applyNodeChanges,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Folder, LayoutGrid, Plus, ArrowUpRight, Trash2 } from "lucide-react";
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
}: {
  items: ExplorerItem[];
  scope: string;
  onOpen: (id: string) => void;
  onCreate?: () => void;
  label: string;
  onDelete: (ids: string[]) => Promise<void>;
  canDelete?: boolean;
  recordUndo: (action: () => Promise<void>) => void;
}) {
  const [nodes, setNodes] = useState<Node[]>([]);
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
        onOpen(selected[0].id);
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
    setNodes((previous) =>
      items.map((item, index) => ({
        id: item.id,
        selected: previous.some((n) => n.id === item.id && n.selected),
        type: "tile",
        position: saved[item.id] || {
          x: 100 + (index % 5) * 200,
          y: 95 + Math.floor(index / 5) * 200,
        },
        data: { item, index, open: onOpen },
        style: { width: 155 },
      })),
    );
  }, [items, scope, layoutRevision]);
  return (
    <div className="explorer-canvas">
      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodesChange={(changes) =>
          setNodes((previous) => applyNodeChanges(changes, previous))
        }
        onNodeDragStop={(_event, node) => {
          try {
            const key = `stillroom-layout:${scope}`;
            const oldLayout = localStorage.getItem(key);
            const saved = JSON.parse(oldLayout || "{}");
            saved[node.id] = node.position;
            localStorage.setItem(key, JSON.stringify(saved));
            recordUndo(async () => {
              if (oldLayout === null) localStorage.removeItem(key);
              else localStorage.setItem(key, oldLayout);
              window.dispatchEvent(new Event("stillroom-layout-change"));
            });
          } catch {
            /* Layout is personal; project data is unaffected. */
          }
        }}
        onNodeDoubleClick={(_event, node) => onOpen(node.id)}
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
            <button onClick={() => onOpen(selected[0].id)}>Open</button>
          )}
          <button
            disabled={!canDelete || deleting}
            onClick={() => void deleteSelection()}
          >
            <Trash2 size={15} /> {deleting ? "Deleting…" : "Delete selected"}
          </button>
        </div>
      )}
      {!items.length && (
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
