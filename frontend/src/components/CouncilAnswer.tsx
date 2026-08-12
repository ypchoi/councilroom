import { useState } from "react";
import type { AgentRunView, Provider, RunView } from "../api";

export type LiveStatus = Record<string, { state: "running" | "done" | "failed"; duration_ms?: number; error?: string }>;

type Props = {
  run: RunView | null;
  live: LiveStatus;
  stage: string;
  providers: Provider[];
  onRetry: (chairman?: string) => void;
};

const label = (providers: Provider[], name: string) =>
  providers.find((p) => p.name === name)?.label ?? name;

const seconds = (ms?: number) => (ms ? `${(ms / 1000).toFixed(1)}s` : "");

export default function CouncilAnswer({ run, live, stage, providers, onRetry }: Props) {
  const [openResponses, setOpenResponses] = useState(false);
  const [openReviews, setOpenReviews] = useState(false);
  const members: AgentRunView[] = run?.responses.filter((r) => r.role === "member") ?? [];
  const running = !run || run.status === "running" || run.status === "pending";

  return (
    <div className="rounded-2xl border border-edge bg-panel p-3">
      <p className="pb-2 text-xs tracking-widest text-slate-500">COUNCIL</p>

      <ul className="space-y-1.5 text-[15px] sm:text-sm">
        {Object.entries(live).map(([provider, status]) => (
          <li key={provider} className="flex items-center gap-2">
            <span className="w-32 truncate sm:w-28">{label(providers, provider)}</span>
            <span className={status.state === "failed" ? "text-red-400" : status.state === "done" ? "text-emerald-400" : "text-slate-400"}>
              {status.state === "done" ? "✓" : status.state === "failed" ? "✕" : "●"}
            </span>
            <span className="text-[13px] text-slate-500 sm:text-xs">
              {status.state === "running" ? "Thinking…" : status.error ?? seconds(status.duration_ms)}
            </span>
          </li>
        ))}
      </ul>

      {running && stage && <p className="pt-2 text-xs text-slate-500">{stage}</p>}

      {run?.status === "failed" && (
        <div className="mt-3 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm">
          <p className="text-red-300">{run.error}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="rounded border border-edge px-2 py-1 text-xs" onClick={() => onRetry()}>
              Retry
            </button>
            {providers.map((p) => (
              <button
                key={p.name}
                className="rounded border border-edge px-2 py-1 text-xs"
                onClick={() => onRetry(p.name)}
              >
                Retry with {p.label} as chairman
              </button>
            ))}
          </div>
        </div>
      )}

      {run?.answer && (
        <div className="mt-3 border-t border-edge pt-3">
          <p className="pb-1 text-xs tracking-widest text-slate-500">COUNCIL ANSWER</p>
          <p className="whitespace-pre-wrap text-[17px] leading-relaxed sm:text-[15px]">{run.answer}</p>
        </div>
      )}

      {members.length > 0 && (
        <div className="mt-3 border-t border-edge pt-2 text-[15px] sm:text-sm">
          <button className="text-slate-400" onClick={() => setOpenResponses((v) => !v)}>
            {openResponses ? "▼" : "▸"} Individual responses
          </button>
          {openResponses &&
            members.map((r) => (
              <div key={r.provider} className="mt-2 rounded-xl bg-ink p-2">
                <p className="flex justify-between text-xs text-slate-400">
                  <span>
                    {label(providers, r.provider)}
                    {r.model ? ` · ${r.model}` : ""}
                  </span>
                  <span>{seconds(r.duration_ms)}</span>
                </p>
                {!r.attachment_supported && (
                  <p className="pt-1 text-xs text-amber-400">did not receive the attachments</p>
                )}
                <p className="whitespace-pre-wrap pt-1 text-[15px] leading-relaxed sm:text-sm">{r.content || r.error}</p>
              </div>
            ))}
        </div>
      )}

      {(run?.peer_reviews.length ?? 0) > 0 && (
        <div className="mt-2 text-sm">
          <button className="text-slate-400" onClick={() => setOpenReviews((v) => !v)}>
            {openReviews ? "▼" : "▸"} Peer reviews
          </button>
          {openReviews &&
            run!.peer_reviews.map((review, i) => (
              <div key={i} className="mt-2 rounded-xl bg-ink p-2">
                <p className="text-xs text-slate-400">{label(providers, review.reviewer)}</p>
                <p className="whitespace-pre-wrap pt-1 text-[15px] leading-relaxed sm:text-sm">{review.content || review.error}</p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
