import { useState } from "react";
import Icon from "./Icon";

/**
 * Copies the Markdown a model actually wrote, not the rendered HTML — a heading
 * pasted elsewhere should still be a heading. Confirms in place: a button that
 * looks unchanged after a click reads as a button that did nothing.
 */
export default function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      title={`Copy ${label} as Markdown`}
      aria-label={`Copy ${label} as Markdown`}
      className="shrink-0 text-slate-500 hover:text-white"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard needs a secure context; the text is selectable either way.
        }
      }}
    >
      <Icon name={copied ? "check" : "copy"} className={`h-4 w-4 ${copied ? "text-emerald-400" : ""}`} />
    </button>
  );
}
