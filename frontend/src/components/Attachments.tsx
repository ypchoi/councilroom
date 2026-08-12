import type { MessageAttachment } from "../api";

/** The same attachment strip in an owned room and behind a share link — only the URL differs. */
export default function Attachments({
  attachments,
  urlFor,
}: {
  attachments: MessageAttachment[];
  urlFor: (id: string) => string;
}) {
  if (attachments.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2 pb-2">
      {attachments.map((a) => (
        <li key={a.id}>
          <a
            href={urlFor(a.id)}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-2 rounded bg-ink px-2 py-1.5 text-[13px] text-slate-300 hover:text-white sm:text-xs"
            title={`${a.filename} · ${Math.max(1, Math.round(a.size / 1024))} KB`}
          >
            {a.mime_type.startsWith("image/") ? (
              <img src={urlFor(a.id)} alt={a.filename} className="h-14 w-14 rounded object-cover" loading="lazy" />
            ) : (
              <span aria-hidden>📎</span>
            )}
            <span className="max-w-40 truncate">{a.filename}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
