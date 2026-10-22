import { useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  applyNodeChanges,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Folder, LayoutGrid, Plus, ArrowUpRight } from "lucide-react";
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
        onClick={(event) => {
          if (event.detail === 0)
            void (data.open as (id: string) => void)(item.id);
        }}
        aria-label={`Open ${item.title}`}
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
}: {
  items: ExplorerItem[];
  scope: string;
  onOpen: (id: string) => void;
  onCreate?: () => void;
  label: string;
}) {
  const [nodes, setNodes] = useState<Node[]>([]);
  useEffect(() => {
    let saved: Record<string, { x: number; y: number }> = {};
    try {
      saved = JSON.parse(
        localStorage.getItem(`stillroom-layout:${scope}`) || "{}",
      );
    } catch {
      /* A damaged layout does not affect project data. */
    }
    setNodes(
      items.map((item, index) => ({
        id: item.id,
        type: "tile",
        position: saved[item.id] || {
          x: 100 + (index % 5) * 200,
          y: 95 + Math.floor(index / 5) * 200,
        },
        data: { item, index, open: onOpen },
        style: { width: 155 },
      })),
    );
  }, [items, scope]);
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
            const saved = JSON.parse(localStorage.getItem(key) || "{}");
            saved[node.id] = node.position;
            localStorage.setItem(key, JSON.stringify(saved));
          } catch {
            /* Layout is personal; project data is unaffected. */
          }
        }}
        onNodeClick={(_event, node) => onOpen(node.id)}
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
        Drag to arrange · Click a tile to open
      </div>
    </div>
  );
}
