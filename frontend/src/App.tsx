import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  watchRun,
  type Message,
  type Provider,
  type Room,
  type RunView,
  type Settings,
} from "./api";
import Composer from "./components/Composer";
import CouncilAnswer, { type LiveStatus } from "./components/CouncilAnswer";
import SettingsPanel from "./components/SettingsPanel";

type RunState = { run: RunView | null; live: LiveStatus; stage: string };

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [authMode, setAuthMode] = useState<string>("disabled");
  const [password, setPassword] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [providers, setProviders] = useState<Provider[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [mode, setMode] = useState<"quick" | "deep">("quick");
  const [drawer, setDrawer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const busy = Object.values(runs).some((r) => r.run === null || r.run.status === "running" || r.run.status === "pending");

  useEffect(() => {
    api
      .me()
      .then((me) => {
        setAuthMode(me.mode);
        setAuthed(me.authenticated);
      })
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (!authed) return;
    api.providers().then(setProviders).catch((e) => setError(e.message));
    api.settings().then((s) => {
      setSettings(s);
      setMode(s.council.default_mode);
    });
    api.rooms().then((list) => {
      setRooms(list);
      setRoomId((current) => current ?? list[0]?.id ?? null);
    });
  }, [authed]);

  useEffect(() => {
    if (!roomId) return;
    api.messages(roomId).then(setMessages).catch((e) => setError(e.message));
  }, [roomId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, runs]);

  const follow = useCallback(
    (runId: string) => {
      setRuns((current) => ({ ...current, [runId]: { run: null, live: {}, stage: "Council deliberating…" } }));
      const stop = watchRun(runId, (event) => {
        setRuns((current) => {
          const state = current[runId] ?? { run: null, live: {}, stage: "" };
          const live = { ...state.live };
          let stage = state.stage;
          if (event.event === "agent.started" && event.provider) live[event.provider] = { state: "running" };
          if (event.event === "agent.completed" && event.provider)
            live[event.provider] = { state: "done", duration_ms: event.duration_ms };
          if (event.event === "agent.failed" && event.provider)
            live[event.provider] = { state: "failed", error: event.error };
          if (event.event === "peer_review.started") stage = "Peer review…";
          if (event.event === "synthesis.started") stage = `Synthesizing… Chairman: ${event.chairman}`;
          if (event.event === "council.completed" || event.event === "council.failed") stage = "";
          return { ...current, [runId]: { ...state, live, stage } };
        });

        if (event.event === "council.completed" || event.event === "council.failed") {
          stop();
          api.run(runId).then((run) =>
            setRuns((current) => ({ ...current, [runId]: { ...current[runId], run, stage: "" } }))
          );
          if (roomId) api.messages(roomId).then(setMessages);
          api.rooms().then(setRooms);
        }
      });
      return stop;
    },
    [roomId]
  );

  async function send(content: string, attachmentIds: string[]) {
    let target = roomId;
    if (!target) {
      const room = await api.createRoom();
      setRooms((r) => [room, ...r]);
      target = room.id;
      setRoomId(room.id);
    }
    try {
      const started = await api.ask(target, { content, attachment_ids: attachmentIds, mode });
      setMessages((current) => [
        ...current,
        {
          id: started.message_id,
          role: "user",
          content,
          council_run_id: null,
          created_at: new Date().toISOString(),
          attachments: [],
        },
      ]);
      follow(started.run_id);
      await api.messages(target).then(setMessages);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function retry(runId: string, chairman?: string) {
    const started = await api.retry(runId, chairman);
    setRuns((current) => {
      const { [runId]: _dropped, ...rest } = current;
      return rest;
    });
    follow(started.run_id);
  }

  async function newRoom() {
    const room = await api.createRoom();
    setRooms((r) => [room, ...r]);
    setRoomId(room.id);
    setMessages([]);
    setRuns({});
    setDrawer(false);
  }

  async function removeRoom(id: string) {
    await api.deleteRoom(id);
    const remaining = rooms.filter((r) => r.id !== id);
    setRooms(remaining);
    if (roomId === id) {
      setRoomId(remaining[0]?.id ?? null);
      setMessages([]);
      setRuns({});
    }
  }

  if (authed === null) return <div className="grid h-full place-items-center text-slate-500">…</div>;

  if (!authed && authMode !== "password") {
    return (
      <div className="grid h-full place-items-center p-4 text-center">
        <div className="max-w-sm">
          <h1 className="pb-2 text-lg">CouncilRoom</h1>
          <p className="text-sm text-slate-400">
            Not authenticated. This deployment expects an identity header from a trusted reverse
            proxy, but the request arrived without one.
          </p>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <form
        className="grid h-full place-items-center p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.login(password);
            setAuthed(true);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <div className="w-full max-w-sm rounded-2xl border border-edge bg-panel p-4">
          <h1 className="pb-3 text-lg">CouncilRoom</h1>
          <input
            type="password"
            className="w-full rounded bg-ink p-2"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="pt-2 text-sm text-red-400">{error}</p>}
          <button className="mt-3 w-full rounded bg-accent p-2 font-medium text-ink">Sign in</button>
        </div>
      </form>
    );
  }

  const runFor = (message: Message): RunState | null => {
    const direct = message.council_run_id ? runs[message.council_run_id] : null;
    if (direct) return direct;
    const live = Object.values(runs).find((r) => r.run?.message_id === message.id);
    return live ?? null;
  };

  const pendingRun = Object.values(runs).find((r) => r.run === null || r.run.status !== "completed");

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-edge bg-panel px-3 py-2">
        <button className="text-xl" onClick={() => setDrawer(true)} aria-label="Rooms">
          ☰
        </button>
        <h1 className="flex-1 font-medium">CouncilRoom</h1>
        <select
          className="rounded bg-ink px-2 py-1 text-sm"
          value={mode}
          onChange={(e) => setMode(e.target.value as "quick" | "deep")}
        >
          <option value="quick">Quick</option>
          <option value="deep">Deep</option>
        </select>
        <button className="text-lg" onClick={() => setShowSettings(true)} aria-label="Settings">
          ⚙
        </button>
      </header>

      <main className="flex-1 space-y-4 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="pt-10 text-center text-sm text-slate-500">Ask one question. The council answers.</p>
        )}
        {messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="ml-auto max-w-[85%] rounded-2xl bg-edge px-3 py-2">
              {message.attachments.length > 0 && (
                <ul className="pb-1 text-xs text-slate-400">
                  {message.attachments.map((a) => (
                    <li key={a.id}>📎 {a.filename}</li>
                  ))}
                </ul>
              )}
              <p className="whitespace-pre-wrap text-[15px]">{message.content}</p>
            </div>
          ) : (
            <CouncilAnswer
              key={message.id}
              run={runFor(message)?.run ?? null}
              live={runFor(message)?.live ?? {}}
              stage={runFor(message)?.stage ?? ""}
              providers={providers}
              onRetry={(chairman) => message.council_run_id && retry(message.council_run_id, chairman)}
            />
          )
        )}
        {pendingRun && (
          <CouncilAnswer
            run={pendingRun.run}
            live={pendingRun.live}
            stage={pendingRun.stage}
            providers={providers}
            onRetry={(chairman) => pendingRun.run && retry(pendingRun.run.id, chairman)}
          />
        )}
        <div ref={bottom} />
      </main>

      {error && <p className="bg-red-950/50 px-3 py-1 text-sm text-red-300">{error}</p>}

      <Composer
        roomId={roomId}
        busy={busy}
        maxFiles={settings?.attachments.max_files_per_message ?? 10}
        onSend={send}
      />

      {drawer && (
        <div className="fixed inset-0 z-10 bg-black/60" onClick={() => setDrawer(false)}>
          <nav
            className="h-full w-72 overflow-y-auto bg-panel p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="mb-3 w-full rounded bg-accent p-2 text-sm font-medium text-ink" onClick={newRoom}>
              New room
            </button>
            <ul className="space-y-1">
              {rooms.map((room) => (
                <li key={room.id} className="flex items-center gap-1">
                  <button
                    className={`flex-1 truncate rounded px-2 py-2 text-left text-sm ${
                      room.id === roomId ? "bg-edge" : ""
                    }`}
                    onClick={() => {
                      setRoomId(room.id);
                      setRuns({});
                      setDrawer(false);
                    }}
                  >
                    {room.title}
                  </button>
                  <button
                    className="px-1 text-slate-500 hover:text-red-400"
                    onClick={() => removeRoom(room.id)}
                    aria-label={`Delete ${room.title}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}

      {showSettings && (
        <SettingsPanel
          providers={providers}
          onClose={() => setShowSettings(false)}
          onSaved={(s) => {
            setSettings(s);
            setMode(s.council.default_mode);
          }}
        />
      )}
    </div>
  );
}
