import { useEffect, useState } from "react";
import { api, sharedAttachmentUrl, type SharedRoomView } from "./api";
import Attachments from "./components/Attachments";
import Markdown from "./components/Markdown";
import MemberResponses from "./components/MemberResponses";

/** Read-only view of a shared room: no auth, no composer, no retry. */
export default function SharedRoom({ token }: { token: string }) {
  const [view, setView] = useState<SharedRoomView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.sharedRoom(token).then(setView).catch((e) => setError((e as Error).message));
  }, [token]);

  if (error)
    return (
      <div className="grid h-full place-items-center p-4 text-center text-slate-400">
        <div className="max-w-sm">
          <h1 className="pb-2 text-lg text-slate-200">CouncilRoom</h1>
          <p className="text-sm">This link is no longer shared.</p>
        </div>
      </div>
    );

  if (!view) return <div className="grid h-full place-items-center text-slate-500">…</div>;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-edge bg-panel px-3 py-2.5">
        <h1 className="flex-1 truncate text-[17px] font-medium sm:text-base">{view.room.title}</h1>
        <span className="shrink-0 rounded border border-edge px-2 py-1 text-[12px] text-slate-500">
          shared · read-only
        </span>
      </header>

      <main className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-3">
        {view.messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="ml-auto max-w-[85%] rounded-2xl bg-edge px-3.5 py-2.5">
              <Attachments
                attachments={message.attachments}
                urlFor={(id) => sharedAttachmentUrl(token, id)}
              />
              <p className="whitespace-pre-wrap text-[16px] leading-relaxed sm:text-[15px]">
                {message.content}
              </p>
            </div>
          ) : (
            <div key={message.id} className="rounded-2xl border border-edge bg-panel px-3.5 py-2.5">
              <Markdown>{message.content}</Markdown>
              <MemberResponses
                run={(message.council_run_id && view.runs[message.council_run_id]) || null}
              />
            </div>
          )
        )}
        {view.messages.length === 0 && (
          <p className="pt-10 text-center text-[15px] text-slate-500 sm:text-sm">Nothing here yet.</p>
        )}
      </main>

      <footer className="border-t border-edge px-3 py-2 text-center text-[12px] text-slate-600">
        CouncilRoom
      </footer>
    </div>
  );
}
