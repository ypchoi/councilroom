import { useRef, useState } from "react";
import { api, type MessageAttachment } from "../api";

type Props = {
  roomId: string | null;
  busy: boolean;
  maxFiles: number;
  onSend: (content: string, attachmentIds: string[]) => void;
};

export default function Composer({ roomId, busy, maxFiles, onSend }: Props) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<{ att: MessageAttachment; preview?: string }[]>([]);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function addFiles(files: FileList | null) {
    if (!files || !roomId) return;
    setError(null);
    const room = pending.length;
    for (const file of Array.from(files).slice(0, maxFiles - room)) {
      setUploading((n) => n + 1);
      try {
        const uploaded = await api.upload(roomId, file);
        const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        setPending((current) => [...current, { att: uploaded, preview }]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  function send() {
    if (busy || (!text.trim() && pending.length === 0)) return;
    onSend(text.trim(), pending.map((p) => p.att.id));
    pending.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
    setText("");
    setPending([]);
  }

  return (
    <div className="border-t border-edge bg-panel px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {error && <p className="pb-2 text-xs text-red-400">{error}</p>}
      {pending.length > 0 && (
        <ul className="flex flex-wrap gap-2 pb-2">
          {pending.map(({ att, preview }) => (
            <li key={att.id} className="flex items-center gap-2 rounded bg-ink px-2 py-1.5 text-[13px] sm:text-xs">
              {preview ? (
                <img src={preview} alt={att.filename} className="h-10 w-10 rounded object-cover" />
              ) : (
                <span aria-hidden>📎</span>
              )}
              <span className="max-w-40 truncate">{att.filename}</span>
              <button
                className="text-slate-500 hover:text-red-400"
                onClick={() =>
                  setPending((c) => {
                    if (preview) URL.revokeObjectURL(preview);
                    return c.filter((x) => x.att.id !== att.id);
                  })
                }
                aria-label={`Remove ${att.filename}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <button
          className="h-11 w-11 shrink-0 rounded-full border border-edge text-2xl leading-none disabled:opacity-40 sm:h-10 sm:w-10 sm:text-xl"
          onClick={() => fileInput.current?.click()}
          disabled={!roomId || pending.length >= maxFiles}
          aria-label="Add attachment"
        >
          ＋
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <textarea
          className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl bg-ink px-3.5 py-2.5 text-[16px] outline-none focus:ring-1 focus:ring-accent"
          rows={1}
          placeholder={uploading > 0 ? `Uploading ${uploading}…` : "Ask Council…"}
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
          disabled={busy || uploading > 0 || (!text.trim() && pending.length === 0)}
        >
          Send
        </button>
      </div>
    </div>
  );
}
