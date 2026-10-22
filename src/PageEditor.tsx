import { useState } from "react";
import { X } from "lucide-react";
import type { Page } from "./pages";
export function PageEditor({
  page,
  onSave,
  onClose,
}: {
  page: Page;
  onSave: (p: Page) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(page),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  return (
    <div
      className="page-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <form
        className="page-modal"
        aria-label="Edit page"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError("");
          try {
            await onSave(draft);
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <button
          type="button"
          className="icon-button modal-close"
          aria-label="Close editor"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <h2>Edit page</h2>
        <label>
          Title
          <input
            autoFocus
            aria-label="Page title"
            value={draft.title}
            maxLength={500}
            required
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        {draft.kind !== "file" && (
          <label>
            {draft.kind === "link" || draft.kind === "image"
              ? "URL"
              : "Content · Markdown supported"}
            <textarea
              aria-label="Page content"
              value={draft.content}
              rows={9}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            />
          </label>
        )}
        <label>
          Color
          <select
            aria-label="Page color"
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
          >
            {["white", "cream", "pink", "lavender", "green"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="button primary" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
