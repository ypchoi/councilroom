import { useEffect, useRef, useState } from "react";
import { attachmentUrl, localTime, type Message, type Provider, type RunView } from "../api";
import Attachments from "./Attachments";
import CouncilAnswer, { type LiveStatus } from "./CouncilAnswer";

export type RunState = {
  run: RunView | null;
  live: LiveStatus;
  stage: string;
  stageAt: number;
  /** The room this run belongs to — carried so runs from other rooms can keep
      streaming in the background without being mistaken for the current one. */
  roomId: string;
  /** Named by council.started, so the chair shows before the run row exists. */
  chairman?: string;
};

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
  const list = useRef<HTMLElement>(null);
  // The shell is fixed and the document never scrolls, so the browser's own
  // pull-to-refresh can never fire — the list that does scroll runs the gesture.
  const pullFrom = useRef<number | null>(null);
  const [pull, setPull] = useState(0);

  /** Whether the reader is at the end, and so should be carried along by it. */
  const atEnd = useRef(true);

  // Deliberately without a dependency list. The room's height goes on growing
  // after its messages arrive — each answer's member rows come later, with its
  // run — so following the messages alone lands partway up. Every render that
  // grows the list is a render that has to end at the bottom, and a jump does
  // that where a smooth scroll only chases a bottom that keeps moving.
  useEffect(() => {
    const el = list.current;
    if (el && atEnd.current) el.scrollTop = el.scrollHeight;
  });

  return (
    <main
      ref={list}
      className="flex-1 overflow-y-auto overscroll-contain p-3"
      onScroll={(e) => {
        // Read back to the middle of a room and the list stops following: only a
        // reader already at the end wants to be taken to a new one.
        const el = e.currentTarget;
        atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
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
      {/* A column of its own width: on a wide screen the scrollbar stays at the
          edge of the window while the conversation keeps one measure to read. */}
      <div className="mx-auto max-w-3xl space-y-4">
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
          // w-fit, or the block fills its 85% whatever the question's length is.
          // Right where the thumb is on a phone; left of a wide screen, where the
          // answer beside it starts, so the eye keeps one margin to return to.
          <div
            key={message.id}
            className="ml-auto w-fit max-w-[85%] overflow-hidden rounded-2xl bg-mine px-3.5 py-2.5 sm:mr-auto sm:ml-0"
          >
            <Attachments attachments={message.attachments} urlFor={urlFor} />
            <p className="break-words whitespace-pre-wrap text-[16px] leading-relaxed sm:text-[15px]">
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
            chairman={runFor(message)?.chairman}
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
          chairman={pending.chairman}
          providers={providers}
          onRetry={
            onRetry && pending.run ? (chairman) => onRetry(pending.run!.id, chairman) : undefined
          }
        />
      )}
      </div>
    </main>
  );
}
