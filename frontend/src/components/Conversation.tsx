import { useEffect, useRef, useState } from "react";
import { attachmentUrl, localTime, type Message, type Provider, type RunView } from "../api";
import Attachments from "./Attachments";
import CouncilAnswer, { type LiveStatus } from "./CouncilAnswer";

export type RunState = { run: RunView | null; live: LiveStatus; stage: string; stageAt: number };

/** How far the list must be pulled past its top before releasing reloads. */
const PULL_TO_REFRESH = 60;

type Props = {
  messages: Message[];
  /** The run behind a council message, if it is loaded or still streaming. */
  runFor: (message: Message) => RunState | null;
  /** An answer being deliberated right now, which has no message yet. */
  pending?: RunState | null;
  providers: Provider[];
  /** Absent behind a share link, where nothing may be retried. */
  onRetry?: (runId: string, chairman?: string) => void;
  urlFor?: (attachmentId: string) => string;
  empty: string;
};

/** The conversation itself — the same list in a room and behind a share link. */
export default function Conversation({
  messages,
  runFor,
  pending,
  providers,
  onRetry,
  urlFor = attachmentUrl,
  empty,
}: Props) {
  const bottom = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLElement>(null);
  // The shell is fixed and the document never scrolls, so the browser's own
  // pull-to-refresh can never fire — the list that does scroll runs the gesture.
  const pullFrom = useRef<number | null>(null);
  const [pull, setPull] = useState(0);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  return (
    <main
      ref={list}
      className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-3"
      onTouchStart={(e) => {
        pullFrom.current = (list.current?.scrollTop ?? 1) <= 0 ? e.touches[0].clientY : null;
      }}
      onTouchMove={(e) => {
        if (pullFrom.current === null) return;
        // Halved, so the pull has the browser's own resistance to it.
        setPull(Math.max(0, Math.min((e.touches[0].clientY - pullFrom.current) / 2, 90)));
      }}
      onTouchEnd={() => {
        pullFrom.current = null;
        if (pull >= PULL_TO_REFRESH) location.reload();
        else setPull(0);
      }}
      onTouchCancel={() => {
        pullFrom.current = null;
        setPull(0);
      }}
    >
      {pull > 0 && (
        <div
          style={{ height: pull }}
          className="grid place-items-center overflow-hidden text-[12px] text-slate-500"
        >
          {pull >= PULL_TO_REFRESH ? "Release to refresh" : "Pull to refresh"}
        </div>
      )}

      {messages.length === 0 && (
        <p className="pt-10 text-center text-[15px] text-slate-500 sm:text-sm">{empty}</p>
      )}

      {messages.map((message) =>
        message.role === "user" ? (
          <div key={message.id} className="ml-auto max-w-[85%] rounded-2xl bg-edge px-3.5 py-2.5">
            <Attachments attachments={message.attachments} urlFor={urlFor} />
            <p className="whitespace-pre-wrap text-[16px] leading-relaxed sm:text-[15px]">
              {message.content}
            </p>
            <p className="pt-1 text-right text-[11px] text-slate-400">{localTime(message.created_at)}</p>
          </div>
        ) : (
          <CouncilAnswer
            key={message.id}
            at={message.created_at}
            run={runFor(message)?.run ?? null}
            live={runFor(message)?.live ?? {}}
            stage={runFor(message)?.stage ?? ""}
            stageAt={runFor(message)?.stageAt ?? 0}
            storedAnswer={message.content}
            providers={providers}
            onRetry={
              onRetry && message.council_run_id
                ? (chairman) => onRetry(message.council_run_id!, chairman)
                : undefined
            }
          />
        )
      )}

      {pending && (
        <CouncilAnswer
          run={pending.run}
          live={pending.live}
          stage={pending.stage}
          stageAt={pending.stageAt}
          providers={providers}
          onRetry={
            onRetry && pending.run ? (chairman) => onRetry(pending.run!.id, chairman) : undefined
          }
        />
      )}

      <div ref={bottom} />
    </main>
  );
}
