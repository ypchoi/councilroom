import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import Icon, { type IconName } from "./Icon";

type Pending = { key: string; file: File; preview?: string };

type Props = {
  busy: boolean;
  maxFiles: number;
  /** Chosen per question, not per room — so it belongs in the composer's menu. */
  mode: "quick" | "deep";
  onMode: (mode: "quick" | "deep") => void;
  /** Uploads the files and sends the message; rejects to keep the draft intact. */
  onSend: (content: string, files: File[]) => Promise<void>;
  /** Handed out so "Ask new" can put the cursor here. */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
};

export default function Composer({ busy, maxFiles, mode, onMode, onSend, inputRef }: Props) {
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
      {/* Same column as the conversation, so the composer sits under the answers. */}
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
              <ul className="absolute bottom-13 left-0 z-20 w-44 overflow-hidden rounded-xl border border-edge bg-panel text-[15px] shadow-lg sm:text-sm">
                {/* The mode lives here rather than beside Send: it is a per-question
                    override of a room-wide default, and the draft needs the width
                    more than a checkbox does. The menu stays open on the toggle so
                    the check is seen to move — otherwise nothing on screen says
                    which mode the next question will run in. */}
                <li className="border-b border-edge">
                  <button
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-edge"
                    onClick={() => onMode(mode === "quick" ? "deep" : "quick")}
                    role="menuitemcheckbox"
                    aria-checked={mode === "quick"}
                    title={
                      mode === "quick"
                        ? "Quick: each member answers once, the Chairman synthesises."
                        : "Deep: members also review each other anonymously first — about double the usage."
                    }
                  >
                    <Icon
                      name="check"
                      className={`h-[18px] w-[18px] ${mode === "quick" ? "text-accent" : "invisible"}`}
                    />
                    Quick
                  </button>
                </li>
                {(
                  [
                    { label: "Camera", icon: "camera", ref: cameraInput },
                    { label: "Photos", icon: "image", ref: photoInput },
                    { label: "Files", icon: "paperclip", ref: fileInput },
                  ] as { label: string; icon: IconName; ref: typeof cameraInput }[]
                ).map(({ label, icon, ref }) => (
                  <li key={label}>
                    <button
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-edge disabled:opacity-40"
                      onClick={() => ref.current?.click()}
                      disabled={pending.length >= maxFiles}
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
            className="grid h-11 w-11 place-items-center rounded-full border border-edge text-slate-300 disabled:opacity-40"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="More options"
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
        {/* The turning rim belongs to the wrapper, not the field: a border on the
            textarea itself sits outside the height the autosize measures, and the
            box would end up two lines short of its own text. */}
        <div className="rim-focus min-w-0 flex-1 rounded-2xl bg-ink">
        <textarea
          ref={(el) => {
            textarea.current = el;
            if (inputRef) inputRef.current = el;
          }}
          // block: an inline textarea leaves a line's worth of descender under
          // itself inside the wrapper, and the row's buttons sit that much lower.
          className="block max-h-40 min-h-10 w-full resize-none overflow-y-auto overscroll-contain bg-transparent px-3.5 py-2 text-[16px] outline-none"
          rows={1}
          placeholder={sending ? "Asking…" : "Type something…"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !window.matchMedia("(pointer: coarse)").matches) {
              e.preventDefault();
              send();
            }
          }}
        />
        </div>
        <button
          // Same 44px as the draft box beside it — the row has one height, and a
          // button that shrinks on wide screens only leaves a gap at the top.
          className="h-11 shrink-0 rounded-full bg-accent px-5 text-[15px] font-medium text-ink disabled:opacity-40 sm:px-4"
          onClick={send}
          disabled={busy || sending || (!text.trim() && pending.length === 0)}
        >
          {sending ? "…" : "Send"}
        </button>
      </div>
      </div>
    </div>
  );
}
