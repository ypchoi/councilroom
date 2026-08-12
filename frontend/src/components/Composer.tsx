import { useRef, useState } from "react";

type Pending = { key: string; file: File; preview?: string };

type Props = {
  busy: boolean;
  maxFiles: number;
  /** Uploads the files and sends the message; rejects to keep the draft intact. */
  onSend: (content: string, files: File[]) => Promise<void>;
};

export default function Composer({ busy, maxFiles, onSend }: Props) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Three separate inputs: Android/iOS pick the surface from accept + capture.
  const cameraInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Files stay local until send: the room is only created when the message goes out.
  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setPending((current) => [
      ...current,
      ...Array.from(files)
        .slice(0, maxFiles - current.length)
        .map((file) => ({
          key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
          file,
          preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        })),
    ]);
    // Reset every input so re-picking the same file still fires a change event.
    for (const input of [cameraInput, photoInput, fileInput]) {
      if (input.current) input.current.value = "";
    }
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
                <span aria-hidden>📎</span>
              )}
              <span className="max-w-40 truncate">{file.name}</span>
              <button
                className="px-1 text-slate-500 hover:text-red-400"
                onClick={() => remove(key)}
                aria-label={`Remove ${file.name}`}
              >
                ✕
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
                {[
                  { label: "📷  Camera", ref: cameraInput },
                  { label: "🖼️  Photos", ref: photoInput },
                  { label: "📎  Files", ref: fileInput },
                ].map(({ label, ref }) => (
                  <li key={label}>
                    <button
                      className="w-full px-3 py-2.5 text-left hover:bg-edge"
                      onClick={() => ref.current?.click()}
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button
            className="h-11 w-11 rounded-full border border-edge text-2xl leading-none disabled:opacity-40 sm:h-10 sm:w-10 sm:text-xl"
            onClick={() => setMenuOpen((open) => !open)}
            disabled={pending.length >= maxFiles}
            aria-label="Add attachment"
            aria-expanded={menuOpen}
          >
            ＋
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
          className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl bg-ink px-3.5 py-2.5 text-[16px] outline-none focus:ring-1 focus:ring-accent"
          rows={1}
          placeholder={sending ? "Sending…" : "Ask Council…"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !window.matchMedia("(pointer: coarse)").matches) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          className="h-11 shrink-0 rounded-full bg-accent px-5 text-[15px] font-medium text-ink disabled:opacity-40 sm:h-10 sm:px-4"
          onClick={send}
          disabled={busy || sending || (!text.trim() && pending.length === 0)}
        >
          {sending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
