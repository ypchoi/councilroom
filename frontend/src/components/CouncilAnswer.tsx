import { useEffect, useState } from "react";
import { localTime, type AgentRunView, type Provider, type RunView } from "../api";
import CopyButton from "./CopyButton";
import Icon from "./Icon";
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
  /** When the answer was recorded; absent while the run is still in flight. */
  at?: string;
  /** The chair as the live stream named it, before the run row is loaded. */
  chairman?: string;
  providers: Provider[];
  /** Absent behind a share link, where nothing may be retried. */
  onRetry?: (chairman?: string) => void;
};

const seconds = (ms?: number) => (ms ? `${(ms / 1000).toFixed(1)}s` : "");

export default function CouncilAnswer({
  run,
  live,
  stage,
  stageAt,
  storedAnswer,
  at,
  chairman,
  providers,
  onRetry,
}: Props) {
  const [openReviews, setOpenReviews] = useState(false);
  // The run names its own members, so a reader behind a share link — who cannot
  // ask the server which providers exist — still sees them properly labelled.
  const labelOf = (name: string) =>
    run?.responses.find((r) => r.provider === name)?.label ??
    providers.find((p) => p.name === name)?.label ??
    name;
  const members: AgentRunView[] = (run?.responses ?? [])
    .filter((r) => r.role === "member")
    .sort((a, b) => a.label.localeCompare(b.label));
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
    // Nothing was waiting until now, so this clock has been stopped — since the
    // last run finished, or since the phone put the tab to sleep. Wind it
    // forward before the first tick, or a start stamped a moment ago is
    // measured against a reading minutes old and the count comes out negative.
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  // Elapsed, never ahead of itself: a start that lands between two ticks is
  // still in this clock's future, and a wall clock can be set backwards.
  const ticking = (start?: number) =>
    start ? ` (${Math.max(0, Math.floor((now - start) / 1000))}s)` : "";

  // The chair is either already on the loaded run or was named up front by the
  // council.started event, so the star can appear before agent rows arrive.
  const chairProvider = run?.chairman ?? chairman;

  return (
    // Full width: the card holds member rows, tables and code, and it is the
    // prose inside that is kept to a readable measure, not the card.
    // overflow-hidden is the last-resort clip — a stray unbreakable token in an
    // answer or an error blob still cannot push the card past its own width.
    <div className="overflow-hidden rounded-2xl border border-edge bg-panel p-3">
      <div className="flex items-baseline justify-between pb-2 text-xs text-slate-500">
        <span className="truncate tracking-widest">COUNCIL MEMBERS</span>
        <span className="flex shrink-0 items-center gap-2 pl-2">
          {answer && <CopyButton text={answer} label="the Council answer" />}
          {at && <span className="text-[11px]">{localTime(at)}</span>}
        </span>
      </div>

      <ul className="space-y-1.5 text-[15px] sm:text-sm">
        {rows.map(([provider, status]) => (
          <li key={provider} className="flex items-center gap-2">
            {/* The name and the chair badge stay one unit — the star hugs the
                label so the reader sees who chaired without hunting a column. */}
            <span className="flex w-32 min-w-0 items-center gap-1 sm:w-28">
              <span className="truncate">{labelOf(provider)}</span>
              {provider === chairProvider && (
                <Icon
                  name="star"
                  className="h-3.5 w-3.5 text-yellow-400"
                  fill="currentColor"
                  strokeWidth={1}
                />
              )}
            </span>
            {status.state === "running" ? (
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-slate-400" />
            ) : (
              <Icon
                name={status.state === "done" ? "check" : "x"}
                className={`h-4 w-4 ${status.state === "done" ? "text-emerald-400" : "text-red-400"}`}
              />
            )}
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
          <p className="break-all text-red-300">{run.error}</p>
          {onRetry && (
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
          )}
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
          <button
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] sm:text-xs ${
              openReviews ? "border-accent text-accent" : "border-edge text-slate-400"
            }`}
            onClick={() => setOpenReviews((v) => !v)}
          >
            <Icon name={openReviews ? "chevron-down" : "chevron-right"} className="h-3.5 w-3.5" />
            Peer reviews
          </button>
          {openReviews &&
            run!.peer_reviews.map((review, i) => (
              <div key={i} className="mt-2 overflow-hidden rounded-xl bg-ink p-2">
                <p className="flex items-center justify-between gap-2 text-xs text-slate-400">
                  <span className="truncate">{labelOf(review.reviewer)}</span>
                  {review.content && (
                    <CopyButton text={review.content} label={`${labelOf(review.reviewer)}'s review`} />
                  )}
                </p>
                <div className="pt-1">{review.content ? <Markdown>{review.content}</Markdown> : <p className="break-all text-[15px] text-red-400 sm:text-sm">{review.error}</p>}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
