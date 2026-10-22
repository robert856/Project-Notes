import { useEffect, useRef, useState } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import type { Page } from "./pages";
import { reloadPage } from "./pageRepository";
interface Task {
  id: string;
  text: string;
  done: boolean;
}
const parse = (content: string): Task[] =>
  content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => ({
      id: crypto.randomUUID(),
      text: line.replace(/^\[[ xX]\]\s*/, ""),
      done: /^\[[xX]\]/.test(line),
    }));
const serialize = (tasks: Task[]) =>
  tasks.map((task) => `[${task.done ? "x" : " "}] ${task.text}`).join("\n");
const MIME = "application/x-stillroom-task";
export function InlineChecklist({
  page,
  editable,
  onSave,
}: {
  page: Page;
  editable: boolean;
  onSave: (content: string, version: number) => Promise<void>;
}) {
  const [tasks, setTasks] = useState(() => parse(page.content)),
    [newTask, setNewTask] = useState(""),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [over, setOver] = useState<string>();
  const rows = useRef(tasks),
    version = useRef(page.version),
    lastSaved = useRef(serialize(parse(page.content))),
    queue = useRef(Promise.resolve()),
    pending = useRef(0),
    blocked = useRef(false),
    source = useRef<string | undefined>(undefined),
    newDraft = useRef("");
  const latestPage = useRef(page);
  latestPage.current = page;
  useEffect(() => {
    if (page.version === version.current || pending.current) return;
    if (serialize(parse(page.content)) === lastSaved.current) {
      version.current = page.version;
      return;
    }
    if (serialize(rows.current) !== lastSaved.current) {
      blocked.current = true;
      setError(
        "This page changed elsewhere. Your draft is kept below. Reload saved tasks to review the latest version.",
      );
      return;
    }
    rows.current = parse(page.content);
    setTasks(rows.current);
    version.current = page.version;
    lastSaved.current = serialize(parse(page.content));
  }, [page.version, page.content]);
  const persist = (next: Task[]) => {
    rows.current = next;
    setTasks(next);
    const content = serialize(next);
    if (blocked.current) return;
    pending.current++;
    setSaving(true);
    queue.current = queue.current
      .then(async () => {
        if (blocked.current || content === lastSaved.current) return;
        try {
          await onSave(content, version.current);
          version.current++;
          lastSaved.current = content;
          setError("");
        } catch (e) {
          blocked.current = true;
          setError((e as Error).message + " Your draft is kept here.");
        }
      })
      .finally(() => {
        pending.current--;
        if (!pending.current) setSaving(false);
      });
  };
  const edit = (id: string, text: string) => {
    const next = rows.current.map((t) => (t.id === id ? { ...t, text } : t));
    rows.current = next;
    setTasks(next);
  };
  const commit = () => {
    if (serialize(rows.current) !== lastSaved.current) persist(rows.current);
  };
  const add = () => {
    const text = newDraft.current.trim();
    if (!editable || blocked.current || !text) return;
    newDraft.current = "";
    persist([...rows.current, { id: crypto.randomUUID(), text, done: false }]);
    setNewTask("");
  };
  const reorder = (id: string, target: string) => {
    if (!editable || id === target || blocked.current) return;
    const next = [...rows.current],
      from = next.findIndex((t) => t.id === id),
      to = next.findIndex((t) => t.id === target);
    if (from < 0 || to < 0) return;
    const [task] = next.splice(from, 1);
    next.splice(to, 0, task);
    persist(next);
  };
  return (
    <div
      className="inline-checklist nodrag nopan nowheel"
      aria-label="To-do list"
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {tasks.map((task, index) => (
        <div
          key={task.id}
          className={`inline-task ${over === task.id ? "task-landing" : ""}`}
          onDragOver={(e) => {
            if (!editable || !e.dataTransfer.types.includes(MIME)) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            setOver(task.id);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node))
              setOver(undefined);
          }}
          onDrop={(e) => {
            if (!e.dataTransfer.types.includes(MIME)) return;
            e.preventDefault();
            e.stopPropagation();
            const id = e.dataTransfer.getData(MIME);
            if (source.current === id) reorder(id, task.id);
            source.current = undefined;
            setOver(undefined);
          }}
        >
          <button
            className="task-grip"
            type="button"
            aria-label={`Reorder task ${index + 1}`}
            title="Drag to reorder · Alt+↑ / Alt+↓"
            disabled={!editable || !!error}
            draggable={editable && !error}
            onPointerDown={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              e.stopPropagation();
              source.current = task.id;
              e.dataTransfer.setData(MIME, task.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => {
              source.current = undefined;
              setOver(undefined);
            }}
            onKeyDown={(e) => {
              if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                e.preventDefault();
                e.stopPropagation();
                const target = tasks[index + (e.key === "ArrowUp" ? -1 : 1)];
                if (target) reorder(task.id, target.id);
              }
            }}
          >
            <GripVertical size={14} />
          </button>
          <input
            type="checkbox"
            aria-label={`Complete task ${index + 1}`}
            checked={task.done}
            disabled={!editable || !!error}
            onChange={() =>
              persist(
                rows.current.map((t) =>
                  t.id === task.id ? { ...t, done: !t.done } : t,
                ),
              )
            }
          />
          <input
            className={task.done ? "task-complete" : ""}
            aria-label={`To-do ${index + 1}`}
            value={task.text}
            readOnly={!editable}
            onChange={(e) => edit(task.id, e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
                (
                  e.currentTarget
                    .closest(".inline-checklist")
                    ?.querySelector(
                      '[aria-label="New to-do"]',
                    ) as HTMLInputElement
                )?.focus();
              }
            }}
          />
          {editable && (
            <button
              type="button"
              className="task-remove"
              aria-label={`Remove task ${index + 1}`}
              disabled={!!error}
              onClick={() =>
                persist(rows.current.filter((t) => t.id !== task.id))
              }
            >
              <X size={13} />
            </button>
          )}
        </div>
      ))}
      {editable && (
        <div className="inline-task task-add">
          <Plus size={14} />
          <input
            aria-label="New to-do"
            placeholder="Add a to-do…"
            value={newTask}
            onChange={(e) => {
              newDraft.current = e.target.value;
              setNewTask(e.target.value);
            }}
            onBlur={add}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button
            type="button"
            aria-label="Add to-do item"
            disabled={!newTask.trim() || !!error}
            onClick={add}
          >
            <Plus size={15} />
          </button>
        </div>
      )}
      {saving && (
        <span className="task-save-state" role="status">
          Saving tasks…
        </span>
      )}
      {error && (
        <div className="task-error" role="alert">
          {error}
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              try {
                const p = await reloadPage(latestPage.current.id);
                version.current = p.version;
                lastSaved.current = serialize(parse(p.content));
                rows.current = parse(p.content);
                setTasks(rows.current);
                blocked.current = false;
                setError("");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Reload saved tasks
          </button>
        </div>
      )}
    </div>
  );
}
