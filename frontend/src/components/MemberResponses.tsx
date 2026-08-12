import { useState } from "react";
import type { AgentRunView, RunView } from "../api";
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
          <div key={r.provider} className="mt-2 rounded-xl bg-ink p-2.5">
            <p className="flex justify-between text-xs text-slate-400">
              <span>
                {r.label}
                {r.model ? ` · ${r.model}` : ""}
              </span>
              <span>{seconds(r.duration_ms)}</span>
            </p>
            {!r.attachment_supported && (
              <p className="pt-1 text-xs text-amber-400">did not receive the attachments</p>
            )}
            <div className="pt-1">
              {r.content ? (
                <Markdown>{r.content}</Markdown>
              ) : (
                <p className="text-[15px] text-red-400 sm:text-sm">{r.error}</p>
              )}
            </div>
          </div>
        ))}
    </>
  );
}
