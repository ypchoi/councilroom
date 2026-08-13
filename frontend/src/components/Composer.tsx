import { useLayoutEffect, useRef, useState } from "react";
import Icon, { type IconName } from "./Icon";

type Pending = { key: string; file: File; preview?: string };

type Props = {
  busy: boolean;
  maxFiles: number;
  /** Chosen per question, not per room — so it belongs beside Ask. */
  mode: "quick" | "deep";
  onMode: (mode: "quick" | "deep") => void;
  /** Uploads the files and sends the message; rejects to keep the draft intact. */
  onSend: (content: string, files: File[]) => Promise<void>;
};

export default function Composer({ busy, maxFiles, mode, onMode, onSend }: Props) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Three separate inputs: Android/iOS pick the surface from accept + capture.
  const cameraInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Grow with the draft up to the CSS max-height, then scroll. Reset to auto first
  // so the scrollHeight reflects the content, not the previous taller layout.
  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  // Files stay local until send: the room is only created when the message goes out.
  function addFiles(files: FileList | null) {
    // Copy the list out now. Clearing an input empties the very FileList it
    // handed us, and setPending's updater does not run until React renders —
    // by then the picked files would be gone.
    const picked = Array.from(files ?? []);
    // Reset every input so re-picking the same file still fires a change event.
    for (const input of [cameraInput, photoInput, fileInput]) {
      if (input.current) input.current.value = "";
    }
    if (picked.length === 0) return;
    setError(null);
    setPending((current) => [
      ...current,
      ...picked.slice(0, maxFiles - current.length).map((file) => ({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      })),
    ]);
    setMenuOpen(false);
  }

  function remove(key: string) {
    setPending((current) => {
      const gone = current.find((p) => p.key === key);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return current.filter((p) => p.key !== key);
    });
  }

  async function send() {
    if (busy || sending || (!text.trim() && pending.length === 0)) return;
    setSending(true);
    setError(null);
    try {
      await onSend(text.trim(), pending.map((p) => p.file));
      pending.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
      setText("");
      setPending([]);
    } catch (e) {
      setError((e as Error).message); // draft and attachments survive the failure
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-edge bg-panel px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {/* Same column as the conversation, so Ask sits under the answers. */}
      <div className="mx-auto max-w-3xl">
      {error && <p className="pb-2 text-[13px] text-red-400 sm:text-xs">{error}</p>}
      {pending.length > 0 && (
        <p className="pb-1 text-[12px] text-slate-500">
          {pending.length} / {maxFiles} attached
        </p>
      )}
      {pending.length > 0 && (
        <ul className="flex flex-wrap gap-2 pb-2">
          {pending.map(({ key, file, preview }) => (
            <li
              key={key}
              className="flex items-center gap-2 rounded bg-ink px-2 py-1.5 text-[13px] sm:text-xs"
            >
              {preview ? (
                <img src={preview} alt={file.name} className="h-10 w-10 rounded object-cover" />
              ) : (
                <Icon name="paperclip" className="h-4 w-4 text-slate-500" />
              )}
              <span className="max-w-40 truncate">{file.name}</span>
              <button
                className="px-1 text-slate-500 hover:text-red-400"
                onClick={() => remove(key)}
                aria-label={`Remove ${file.name}`}
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <div className="relative shrink-0">
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <ul className="absolute bottom-13 left-0 z-20 w-40 overflow-hidden rounded-xl border border-edge bg-panel text-[15px] shadow-lg sm:text-sm">
                {(
                  [
                    { label: "Camera", icon: "camera", ref: cameraInput },
                    { label: "Photos", icon: "image", ref: photoInput },
                    { label: "Files", icon: "paperclip", ref: fileInput },
                  ] as { label: string; icon: IconName; ref: typeof cameraInput }[]
                ).map(({ label, icon, ref }) => (
                  <li key={label}>
                    <button
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-edge"
                      onClick={() => ref.current?.click()}
                    >
                      <Icon name={icon} className="h-[18px] w-[18px] text-slate-400" />
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button
            className="grid h-11 w-11 place-items-center rounded-full border border-edge text-slate-300 disabled:opacity-40 sm:h-10 sm:w-10"
            onClick={() => setMenuOpen((open) => !open)}
            disabled={pending.length >= maxFiles}
            aria-label="Add attachment"
            aria-expanded={menuOpen}
          >
            <Icon name="plus" />
          </button>
        </div>
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <input
          ref={photoInput}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/*,application/pdf,text/plain"
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <textarea
          ref={textarea}
          className="max-h-40 min-h-11 flex-1 resize-none overflow-y-auto overscroll-contain rounded-2xl bg-ink px-3.5 py-2.5 text-[16px] outline-none focus:ring-1 focus:ring-accent"
          rows={1}
          placeholder={sending ? "Asking…" : "Ask Council…"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !window.matchMedia("(pointer: coarse)").matches) {
              e.preventDefault();
              send();
            }
          }}
        />
        <label
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-edge px-3 text-[13px] text-slate-300 sm:h-10 sm:text-xs"
          title={
            mode === "quick"
              ? "Quick: each member answers once, the Chairman synthesises."
              : "Deep: members also review each other anonymously first — about double the usage."
          }
        >
          <input
            type="checkbox"
            className="h-4 w-4 accent-accent"
            checked={mode === "quick"}
            onChange={(e) => onMode(e.target.checked ? "quick" : "deep")}
          />
          Quick
        </label>
        <button
          className="h-11 shrink-0 rounded-full bg-accent px-5 text-[15px] font-medium text-ink disabled:opacity-40 sm:h-10 sm:px-4"
          onClick={send}
          disabled={busy || sending || (!text.trim() && pending.length === 0)}
        >
          {sending ? "…" : "Ask"}
        </button>
      </div>
      </div>
    </div>
  );
}
