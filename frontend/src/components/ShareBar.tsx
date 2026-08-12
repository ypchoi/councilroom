import { useState } from "react";
import { shareUrl } from "../api";
import Icon from "./Icon";

/**
 * Once a room is shared the link itself is on screen, not hidden behind a copy
 * button — a link nobody can see is a link nobody can hand out.
 */
export default function ShareBar({ token, onUnshare }: { token: string; onUnshare: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = shareUrl(token);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard needs a secure context; the link is selectable either way.
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-edge bg-ink/60 px-3 py-1.5 text-[13px] sm:text-xs">
      <Icon name="link" className="h-4 w-4 text-slate-500" />
      {/* Neither the host nor the /s/ prefix ever varies; only the token does. */}
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="flex-1 truncate text-accent hover:underline"
        title={url}
      >
        {token}
      </a>
      <button className="rounded border border-edge px-2 py-1 hover:text-white" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
      <button
        className="rounded border border-edge px-2 py-1 hover:text-red-400"
        onClick={() => {
          if (confirm("Stop sharing? The link stops working for everyone.")) onUnshare();
        }}
      >
        Unshare
      </button>
    </div>
  );
}
