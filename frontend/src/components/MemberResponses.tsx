import { useState } from "react";
import type { AgentRunView, RunView } from "../api";
import CopyButton from "./CopyButton";
import Icon from "./Icon";
import Markdown from "./Markdown";

const seconds = (ms?: number) => (ms ? `${(ms / 1000).toFixed(1)}s` : "");

/** What each member said, behind one button per member. Same in a room and behind a share link. */
export default function MemberResponses({ run }: { run: RunView | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const members: AgentRunView[] = (run?.responses ?? [])
    .filter((r) => r.role === "member")
    .sort((a, b) => a.label.localeCompare(b.label));

  if (members.length === 0) return null;

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-edge pt-3">
        {members.map((r) => (
          <button
            key={r.provider}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] sm:text-xs ${
              open === r.provider ? "border-accent text-accent" : "border-edge text-slate-400"
            }`}
            onClick={() => setOpen(open === r.provider ? null : r.provider)}
          >
            <Icon
              name={open === r.provider ? "chevron-down" : "chevron-right"}
              className="h-3.5 w-3.5"
            />
            {r.label}
          </button>
        ))}
      </div>

      {members
        .filter((r) => r.provider === open)
        .map((r) => (
          <div key={r.provider} className="mt-2 overflow-hidden rounded-xl bg-ink p-2.5">
            <p className="flex items-center justify-between gap-2 text-xs text-slate-400">
              <span className="truncate">
                {r.label}
                {r.model ? ` · ${r.model}` : ""}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {seconds(r.duration_ms)}
                {r.content && <CopyButton text={r.content} label={`${r.label}'s answer`} />}
              </span>
            </p>
            {!r.attachment_supported && (
              <p className="pt-1 text-xs text-amber-400">did not receive the attachments</p>
            )}
            <div className="pt-1">
              {r.content ? (
                <Markdown>{r.content}</Markdown>
              ) : (
                // break-all: errors are technical (URLs, ids, JSON blobs), so
                // breaking mid-token is fine and guarantees no horizontal leak.
                <p className="break-all text-[15px] text-red-400 sm:text-sm">{r.error}</p>
              )}
            </div>
          </div>
        ))}
    </>
  );
}
