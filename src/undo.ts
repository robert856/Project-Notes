import { useEffect, useRef, useState } from "react";
import type { Project, Board, Card } from "./model";
export interface WorkspaceSnapshot {
  projects: Project[];
  boards: Board[];
  cards: Card[];
}
export function useWorkspaceUndo(
  snapshot: WorkspaceSnapshot,
  restore: (
    before: WorkspaceSnapshot,
    current: WorkspaceSnapshot,
  ) => Promise<WorkspaceSnapshot>,
  apply: (snapshot: WorkspaceSnapshot) => void,
  onError: (message: string) => void,
) {
  const history = useRef<(WorkspaceSnapshot | (() => Promise<void>))[]>([]);
  const latest = useRef(snapshot);
  const [count, setCount] = useState(0);
  const [undoing, setUndoing] = useState(false);
  const running = useRef(false);
  useEffect(() => {
    if (JSON.stringify(latest.current) === JSON.stringify(snapshot)) return;
    if (!running.current) {
      history.current = [...history.current.slice(-29), latest.current];
      setCount(history.current.length);
    }
    latest.current = snapshot;
  }, [snapshot]);
  const reset = (next: WorkspaceSnapshot) => {
    history.current = [];
    latest.current = next;
    setCount(0);
  };
  const undo = async () => {
    if (running.current || !history.current.length) return;
    running.current = true;
    setUndoing(true);
    try {
      const previous = history.current[history.current.length - 1];
      if (typeof previous === "function") await previous();
      else {
        const restored = await restore(previous, latest.current);
        latest.current = restored;
        apply(restored);
      }
      history.current.pop();
      setCount(history.current.length);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      running.current = false;
      setUndoing(false);
    }
  };
  const recordExternal = (action: () => Promise<void>) => {
    history.current = [...history.current.slice(-29), action];
    setCount(history.current.length);
  };
  return { undo, reset, recordExternal, canUndo: count > 0, undoing };
}
