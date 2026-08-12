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
  const [pending, setPending] = useState<MessageAttachment[]>([]);
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
        setPending((current) => [...current, uploaded]);
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
    onSend(text.trim(), pending.map((a) => a.id));
    setText("");
    setPending([]);
  }

  return (
    <div className="border-t border-edge bg-panel px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {error && <p className="pb-2 text-xs text-red-400">{error}</p>}
      {pending.length > 0 && (
        <ul className="flex flex-wrap gap-2 pb-2">
          {pending.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded bg-ink px-2 py-1 text-xs">
              <span className="max-w-40 truncate">{a.filename}</span>
              <button
                className="text-slate-500 hover:text-red-400"
                onClick={() => setPending((c) => c.filter((x) => x.id !== a.id))}
                aria-label={`Remove ${a.filename}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <button
          className="h-10 w-10 shrink-0 rounded-full border border-edge text-xl leading-none disabled:opacity-40"
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
          className="max-h-40 min-h-10 flex-1 resize-none rounded-2xl bg-ink px-3 py-2 text-base outline-none focus:ring-1 focus:ring-accent"
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
          className="h-10 shrink-0 rounded-full bg-accent px-4 font-medium text-ink disabled:opacity-40"
          onClick={send}
          disabled={busy || uploading > 0 || (!text.trim() && pending.length === 0)}
        >
          Send
        </button>
      </div>
    </div>
  );
}
