import { useEffect, useRef, useState } from "react";
import type { Page } from "./pages";

/** Keep unsaved text visible if a version conflict prevents saving. */
export function InlineText({
  page,
  editable,
  onSave,
}: {
  page: Page;
  editable: boolean;
  onSave: (content: string, version: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState(page.content);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const base = useRef({ content: page.content, version: page.version });
  const dirty = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (page.version === base.current.version || saving) return;
    if (!dirty.current) {
      setDraft(page.content);
      base.current = { content: page.content, version: page.version };
    } else if (page.content === base.current.content) {
      base.current.version = page.version;
    } else {
      setError("This note changed elsewhere. Your draft is kept here.");
    }
  }, [page.content, page.version, saving]);
  useEffect(() => {
    const el = input.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.max(80, el.scrollHeight)}px`;
    }
  }, [draft]);
  const save = async () => {
    if (!editable || saving || error || !dirty.current) return;
    const content = draft;
    setSaving(true);
    try {
      await onSave(content, base.current.version);
      base.current = { content, version: base.current.version + 1 };
      dirty.current = input.current?.value !== content;
    } catch (e) {
      setError((e as Error).message + " Your draft is kept here.");
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    if (!saving && dirty.current && document.activeElement !== input.current)
      void save();
  }, [saving]);
  return (
    <div
      className="inline-text nodrag nopan nowheel"
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <textarea
        ref={input}
        aria-label="Note text"
        placeholder="Write a note…"
        value={draft}
        readOnly={!editable}
        onChange={(e) => {
          setDraft(e.target.value);
          dirty.current = e.target.value !== base.current.content;
        }}
        onBlur={() => void save()}
      />
      {saving && <small role="status">Saving…</small>}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
