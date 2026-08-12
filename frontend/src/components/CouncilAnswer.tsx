import { useEffect, useState } from "react";
import type { AgentRunView, Provider, RunView } from "../api";
import Markdown from "./Markdown";
import MemberResponses from "./MemberResponses";

export type LiveStatus = Record<
  string,
  { state: "running" | "done" | "failed"; duration_ms?: number; error?: string; started_at?: number }
>;

type Props = {
  run: RunView | null;
  live: LiveStatus;
  stage: string;
  /** When the current stage began, so it can time itself. */
  stageAt?: number;
  /** Answer persisted with the message, so history renders without loading the run. */
  storedAnswer?: string;
  providers: Provider[];
  onRetry: (chairman?: string) => void;
};

const label = (providers: Provider[], name: string) =>
  providers.find((p) => p.name === name)?.label ?? name;

const seconds = (ms?: number) => (ms ? `${(ms / 1000).toFixed(1)}s` : "");

export default function CouncilAnswer({
  run,
  live,
  stage,
  stageAt,
  storedAnswer,
  providers,
  onRetry,
}: Props) {
  const [openReviews, setOpenReviews] = useState(false);
  const members: AgentRunView[] = (run?.responses ?? [])
    .filter((r) => r.role === "member")
    .sort((a, b) => label(providers, a.provider).localeCompare(label(providers, b.provider)));
  const answer = run?.answer || storedAnswer || "";
  const running = !answer && (!run || run.status === "running" || run.status === "pending");

  // While the run streams, SSE events are all we have. Once it is loaded its own
  // rows are the truth — otherwise a single dropped event (backgrounded phone,
  // proxy hiccup) leaves a member on "Thinking…" beside a finished answer.
  const rows: [string, LiveStatus[string]][] = members.length
    ? members.map((r) => [
        r.provider,
        {
          state: r.status === "completed" ? "done" : r.status === "running" ? "running" : "failed",
          duration_ms: r.duration_ms,
          error: r.error ?? undefined,
        },
      ])
    : Object.entries(live);

  // A member — or the Chairman — can think for a minute; tick so the wait shows
  // it is still moving. The interval only runs while something is actually out.
  const waiting = rows.some(([, status]) => status.state === "running") || (running && Boolean(stage));
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  const ticking = (start?: number) => (start ? ` (${Math.round((now - start) / 1000)}s)` : "");

  return (
    <div className="rounded-2xl border border-edge bg-panel p-3">
      <p className="pb-2 text-xs tracking-widest text-slate-500">COUNCIL</p>

      <ul className="space-y-1.5 text-[15px] sm:text-sm">
        {rows.map(([provider, status]) => (
          <li key={provider} className="flex items-center gap-2">
            <span className="w-32 truncate sm:w-28">{label(providers, provider)}</span>
            <span className={status.state === "failed" ? "text-red-400" : status.state === "done" ? "text-emerald-400" : "text-slate-400"}>
              {status.state === "done" ? "✓" : status.state === "failed" ? "✕" : "●"}
            </span>
            <span className="text-[13px] text-slate-500 sm:text-xs">
              {status.state === "running"
                ? `Thinking…${ticking(status.started_at)}`
                : status.error ?? seconds(status.duration_ms)}
            </span>
          </li>
        ))}
      </ul>

      {running && stage && (
        <p className="pt-2 text-xs text-slate-500">
          {stage}
          {ticking(stageAt)}
        </p>
      )}

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

      {answer && (
        <div className="mt-3 border-t border-edge pt-3">
          <p className="pb-1 text-xs tracking-widest text-slate-500">COUNCIL ANSWER</p>
          <Markdown>{answer}</Markdown>
        </div>
      )}

      <MemberResponses run={run} />

      {(run?.peer_reviews.length ?? 0) > 0 && (
        <div className="mt-3 text-[15px] sm:text-sm">
          <button className="text-slate-400" onClick={() => setOpenReviews((v) => !v)}>
            {openReviews ? "▼" : "▸"} Peer reviews
          </button>
          {openReviews &&
            run!.peer_reviews.map((review, i) => (
              <div key={i} className="mt-2 rounded-xl bg-ink p-2">
                <p className="text-xs text-slate-400">{label(providers, review.reviewer)}</p>
                <div className="pt-1">{review.content ? <Markdown>{review.content}</Markdown> : <p className="text-[15px] text-red-400 sm:text-sm">{review.error}</p>}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
