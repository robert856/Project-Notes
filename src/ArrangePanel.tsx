import {
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalSpaceBetween,
  AlignVerticalSpaceBetween,
} from "lucide-react";
import type { Alignment } from "./alignment";
export type Arrangement = Alignment | "horizontal" | "vertical";
const icons = {
  left: AlignHorizontalJustifyStart,
  center: AlignHorizontalJustifyCenter,
  right: AlignHorizontalJustifyEnd,
  top: AlignVerticalJustifyStart,
  middle: AlignVerticalJustifyCenter,
  bottom: AlignVerticalJustifyEnd,
};
export function ArrangePanel({
  open,
  count,
  total,
  canArrange,
  busy,
  onSelectAll,
  onClear,
  onArrange,
}: {
  open: boolean;
  count: number;
  total: number;
  canArrange: boolean;
  busy: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onArrange: (direction: Arrangement) => void;
}) {
  return (
    <div
      className={`selection-toolbar ${open ? "expanded" : ""}`}
      aria-label="Selection, alignment and distribution"
      role="toolbar"
    >
      <button onClick={onSelectAll} disabled={!total || busy}>
        Select all
      </button>
      <button onClick={onClear} disabled={!count || busy}>
        Clear
      </button>
      <span className="selection-count" aria-live="polite">
        {count} selected
      </span>
      <span className="alignment-label">Align</span>
      {(Object.keys(icons) as Alignment[]).map((direction) => {
        const Icon = icons[direction];
        return (
          <button
            key={direction}
            aria-label={`Align ${direction}`}
            title={`Align ${direction}`}
            className="arrange-icon"
            disabled={!canArrange || busy || count < 2}
            onClick={() => onArrange(direction)}
          >
            <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
          </button>
        );
      })}
      <span className="alignment-label">Distribute</span>
      <button
        aria-label="Distribute horizontally"
        title="Distribute horizontally — equal gaps across"
        className="arrange-icon"
        disabled={!canArrange || busy || count < 3}
        onClick={() => onArrange("horizontal")}
      >
        <AlignHorizontalSpaceBetween
          size={18}
          strokeWidth={1.7}
          aria-hidden="true"
        />
      </button>
      <button
        aria-label="Distribute vertically"
        title="Distribute vertically — equal gaps down"
        className="arrange-icon"
        disabled={!canArrange || busy || count < 3}
        onClick={() => onArrange("vertical")}
      >
        <AlignVerticalSpaceBetween
          size={18}
          strokeWidth={1.7}
          aria-hidden="true"
        />
      </button>
      <span className="selection-help">
        {busy
          ? "Saving positions…"
          : "Drag empty canvas to select · Shift-click to add"}
      </span>
    </div>
  );
}
