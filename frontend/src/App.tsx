import { useCallback, useEffect, useState } from "react";
import {
  api,
  shareUrl,
  watchRun,
  type Message,
  type Provider,
  type Room,
  type Settings,
} from "./api";
import Composer from "./components/Composer";
import Conversation, { type RunState } from "./components/Conversation";
import Icon from "./components/Icon";
import RoomsDrawer from "./components/RoomsDrawer";
import SettingsPanel from "./components/SettingsPanel";
import ShareBar from "./components/ShareBar";

/** Rooms are addressable at /r/<id>; "/" is a fresh, not-yet-created room. */
const roomFromPath = (): string | null => location.pathname.match(/^\/r\/([0-9a-f]{32})$/)?.[1] ?? null;

function navigate(roomId: string | null) {
  const path = roomId ? `/r/${roomId}` : "/";
  if (location.pathname !== path) history.pushState({ roomId }, "", path);
}

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [authMode, setAuthMode] = useState<string>("disabled");
  const [username, setUsername] = useState<string | null>(null);
  const [logoutUrl, setLogoutUrl] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState<string | null>(roomFromPath);
  const [messages, setMessages] = useState<Message[]>([]);
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [providers, setProviders] = useState<Provider[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [mode, setMode] = useState<"quick" | "deep">("quick");
  const [drawer, setDrawer] = useState(false);
  // Open on arrival, every time. Not remembered: folding it is a thing you do for
  // the next minute's reading, not a preference, and a room list that stays hidden
  // across visits is a room list you have to go looking for.
  const [sidebar, setSidebar] = useState(true);
  // Whether the room list has ever been opened here. Until it has, the button
  // that opens it shakes now and then; after that it never asks again.
  const [foundRooms, setFoundRooms] = useState(() => localStorage.getItem("rooms") === "found");
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = Object.values(runs).some((r) => r.run === null || r.run.status === "running" || r.run.status === "pending");

  useEffect(() => {
    api
      .me()
      .then((me) => {
        setAuthMode(me.mode);
        setUsername(me.username);
        setLogoutUrl(me.logout_url);
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
    api.rooms().then(setRooms);
  }, [authed]);

  useEffect(() => {
    if (!roomId) {
      setMessages([]);
      return;
    }
    api.messages(roomId).then(setMessages).catch((e) => setError(e.message));
  }, [roomId]);

  // Back/forward between rooms.
  useEffect(() => {
    const onPop = () => {
      setRoomId(roomFromPath());
      setRuns({});
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Load the runs behind council messages so their per-member buttons can appear.
  useEffect(() => {
    const missing = messages
      .filter((m) => m.role === "council" && m.council_run_id && !runs[m.council_run_id])
      .map((m) => m.council_run_id!);
    if (missing.length === 0) return;
    Promise.all(missing.map((id) => api.run(id).catch(() => null))).then((loaded) =>
      setRuns((current) => {
        const next = { ...current };
        for (const run of loaded) {
          if (run && !next[run.id]) next[run.id] = { run, live: {}, stage: "", stageAt: 0 };
        }
        return next;
      })
    );
  }, [messages, runs]);

  // Phones suspend the SSE stream in the background; resync whatever finished meanwhile.
  useEffect(() => {
    const resync = () => {
      if (document.visibilityState !== "visible" || !roomId) return;
      api.messages(roomId).then(setMessages).catch(() => {});
      api.rooms().then(setRooms).catch(() => {});
    };
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", resync);
    return () => {
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", resync);
    };
  }, [roomId]);

  // The room is passed in, never read from state: the first question in a new
  // room creates that room in the same tick, so this closure's roomId is still
  // null and the finished answer would never be loaded.
  const follow = useCallback(
    (runId: string, room: string) => {
      setRuns((current) => ({ ...current, [runId]: { run: null, live: {}, stage: "Council deliberating…", stageAt: Date.now() } }));
      const stop = watchRun(runId, (event) => {
        setRuns((current) => {
          const state = current[runId] ?? { run: null, live: {}, stage: "", stageAt: 0 };
          const live = { ...state.live };
          let stage = state.stage;
          if (event.event === "agent.started" && event.provider)
            live[event.provider] = { state: "running", started_at: Date.now() };
          if (event.event === "agent.completed" && event.provider)
            live[event.provider] = { state: "done", duration_ms: event.duration_ms };
          if (event.event === "agent.failed" && event.provider)
            live[event.provider] = { state: "failed", error: event.error };
          if (event.event === "peer_review.started") stage = "Peer review…";
          if (event.event === "synthesis.started") stage = `Synthesizing… Chairman: ${event.chairman}`;
          if (event.event === "council.completed" || event.event === "council.failed") stage = "";
          // Each stage times itself, so a long synthesis is visibly moving too.
          const stageAt = stage === state.stage ? state.stageAt : Date.now();
          // council.started names the chair before any member has answered, so
          // the card can say whose synthesis is coming rather than only whose it was.
          const chairman = event.chairman ?? state.chairman;
          return { ...current, [runId]: { ...state, live, stage, stageAt, chairman } };
        });

        if (event.event === "council.completed" || event.event === "council.failed") {
          stop();
          api.run(runId).then((run) =>
            setRuns((current) => ({ ...current, [runId]: { ...current[runId], run, stage: "" } }))
          );
          api.messages(room).then(setMessages);
          api.rooms().then(setRooms);
        }
      });
      return stop;
    },
    []
  );

  async function ensureRoom(): Promise<string> {
    if (roomId) return roomId;
    const room = await api.createRoom();
    setRooms((r) => [room, ...r]);
    setRoomId(room.id);
    navigate(room.id);
    return room.id;
  }

  async function send(content: string, files: File[]) {
    // The room and the uploads only happen once the user actually sends.
    const target = await ensureRoom();
    const uploaded = await Promise.all(files.map((file) => api.upload(target, file)));
    const started = await api.ask(target, {
      content,
      attachment_ids: uploaded.map((a) => a.id),
      mode,
    });
    setError(null);
    follow(started.run_id, target);
    await api.messages(target).then(setMessages);
  }

  async function retry(runId: string, chairman?: string) {
    if (!roomId) return;
    const started = await api.retry(runId, chairman);
    setRuns((current) => {
      const { [runId]: _dropped, ...rest } = current;
      return rest;
    });
    follow(started.run_id, roomId);
  }

  function newRoom() {
    setRoomId(null);
    setMessages([]);
    setRuns({});
    setDrawer(false);
    navigate(null);
  }

  async function logout() {
    if (logoutUrl) {
      // Behind a proxy the session is the proxy's, so send the user to wherever
      // that proxy ends it — the address is configuration, not a hardcoded path.
      location.href = logoutUrl;
      return;
    }
    await api.logout();
    location.reload();
  }

  async function renameRoom(id: string, title: string) {
    await api.renameRoom(id, title);
    setRooms((current) => current.map((r) => (r.id === id ? { ...r, title } : r)));
  }

  async function removeAllRooms() {
    await Promise.all(rooms.map((r) => api.deleteRoom(r.id)));
    setRooms([]);
    setRoomId(null);
    setMessages([]);
    setRuns({});
    navigate(null);
  }

  async function share(id: string) {
    const { share_token } = await api.shareRoom(id);
    setRooms((current) => current.map((r) => (r.id === id ? { ...r, share_token } : r)));
    await navigator.clipboard.writeText(shareUrl(share_token)).catch(() => {});
  }

  async function unshare(id: string) {
    await api.unshareRoom(id);
    setRooms((current) => current.map((r) => (r.id === id ? { ...r, share_token: null } : r)));
  }

  async function removeRoom(id: string) {
    await api.deleteRoom(id);
    const remaining = rooms.filter((r) => r.id !== id);
    setRooms(remaining);
    if (roomId === id) {
      setRoomId(null);
      setMessages([]);
      setRuns({});
      navigate(null);
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
  const activeRoom = rooms.find((r) => r.id === roomId) ?? null;

  // One list, two placements: pinned beside the room on a wide screen, and the
  // same component over it when the screen is too narrow to spare the width.
  const roomList = {
    rooms,
    activeId: roomId,
    onSelect: (id: string) => {
      setRoomId(id);
      setRuns({});
      setDrawer(false);
      navigate(id);
    },
    onCreate: newRoom,
    onRename: renameRoom,
    onDelete: removeRoom,
    onDeleteAll: removeAllRooms,
    onShare: share,
    onUnshare: unshare,
    onSettings: () => setShowSettings(true),
  };

  const toggleSidebar = () => setSidebar((open) => !open);

  return (
    <div className="flex h-full">
      {/* Folds by width, not by display: display cannot be animated, and the list
          inside keeps its own width and is simply clipped away — so the room grows
          into the space as it goes, instead of jumping once it is gone. */}
      <aside
        className={`hidden shrink-0 overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none lg:block ${
          sidebar ? "w-80 border-r border-edge" : "w-0"
        }`}
      >
        <RoomsDrawer {...roomList} pinned onClose={toggleSidebar} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-edge bg-panel px-3 py-2.5">
        {/* Two buttons, one picture: bringing the list out is the same act to the
            reader, whether it arrives over the room or beside it, and which button
            shows is left to the CSS breakpoint rather than a listener. Only this
            one nudges — the other appears solely after the reader folded the
            sidebar themselves, so they already know what it does. */}
        <button
          className={`p-1.5 text-slate-300 hover:text-white lg:hidden ${foundRooms ? "" : "nudge"}`}
          onClick={() => {
            setDrawer(true);
            setFoundRooms(true);
            localStorage.setItem("rooms", "found");
          }}
          aria-label="Show the room list"
          title="Show the room list"
        >
          <Icon name="panel-open" />
        </button>
        {!sidebar && (
          <button
            className="hidden p-1.5 text-slate-300 hover:text-white lg:block"
            onClick={toggleSidebar}
            aria-label="Show the room list"
            title="Show the room list"
          >
            <Icon name="panel-open" />
          </button>
        )}
        <h1 className="flex-1 text-[17px] font-medium sm:text-base">CouncilRoom</h1>
        {activeRoom && !activeRoom.share_token && (
          <button
            className="p-1.5 text-slate-300 hover:text-white"
            onClick={() => share(activeRoom.id)}
            title="Create a public read-only link to this room"
            aria-label="Share room"
          >
            <Icon name="link" />
          </button>
        )}
      </header>

      {activeRoom?.share_token && (
        <ShareBar token={activeRoom.share_token} onUnshare={() => unshare(activeRoom.id)} />
      )}

      <Conversation
        messages={messages}
        runFor={runFor}
        pending={pendingRun}
        providers={providers}
        onRetry={retry}
        empty="Ask one question. The council answers."
      />

      {error && <p className="bg-red-950/50 px-3 py-1 text-sm text-red-300">{error}</p>}

      <Composer
        busy={busy}
        maxFiles={settings?.attachments.max_files_per_message ?? 10}
        mode={mode}
        onMode={setMode}
        onSend={send}
      />
      </div>

      <RoomsDrawer {...roomList} open={drawer} onClose={() => setDrawer(false)} />

      {showSettings && (
        <SettingsPanel
          providers={providers}
          username={username}
          canLogout={authMode === "password" || Boolean(logoutUrl)}
          onLogout={logout}
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
