import { useEffect, useState } from "react";
import { api, sharedAttachmentUrl, type Message, type SharedRoomView } from "./api";
import Conversation from "./components/Conversation";

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

  // Every run here is finished, so there is no live state to go with it.
  const runFor = (message: Message) => {
    const run = (message.council_run_id && view.runs[message.council_run_id]) || null;
    return run ? { run, live: {}, stage: "", stageAt: 0, roomId: run.room_id } : null;
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-edge bg-panel px-3 py-2.5">
        <h1 className="flex-1 truncate text-[17px] font-medium sm:text-base">{view.room.title}</h1>
        <span className="shrink-0 rounded border border-edge px-2 py-1 text-[12px] text-slate-500">
          shared · read-only
        </span>
      </header>

      <Conversation
        messages={view.messages}
        runFor={runFor}
        providers={[]}
        urlFor={(id) => sharedAttachmentUrl(token, id)}
        empty="Nothing here yet."
      />

      <footer className="border-t border-edge px-3 py-2 text-center text-[12px] text-slate-600">
        CouncilRoom
      </footer>
    </div>
  );
}
