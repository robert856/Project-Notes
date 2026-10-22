import { useEffect, useRef } from "react";
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
  onClose,
}: {
  open: boolean;
  count: number;
  total: number;
  canArrange: boolean;
  busy: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onArrange: (direction: Arrangement) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const previousCount = useRef(count);
  useEffect(() => {
    if (open && previousCount.current > 0 && count === 0) onClose();
    previousCount.current = count;
  }, [open, count, onClose]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !panel.current?.contains(target) &&
        !(target instanceof Element && target.closest("[data-arrange-trigger]"))
      )
        onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") onClose();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", onClose);
    };
  }, [open, onClose]);
  const arrange = (direction: Arrangement) => {
    onArrange(direction);
    onClose();
  };
  return (
    <div
      ref={panel}
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
            onClick={() => arrange(direction)}
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
        onClick={() => arrange("horizontal")}
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
        onClick={() => arrange("vertical")}
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
