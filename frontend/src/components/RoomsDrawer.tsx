import { useState } from "react";
import type { Room } from "../api";
import CouncilStatus from "./CouncilStatus";

type Props = {
  rooms: Room[];
  activeId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
  username: string | null;
  canLogout: boolean;
  onLogout: () => void;
};

export default function RoomsDrawer({
  rooms,
  activeId,
  onClose,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onDeleteAll,
  username,
  canLogout,
  onLogout,
}: Props) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const visible = query.trim()
    ? rooms.filter((r) => r.title.toLowerCase().includes(query.trim().toLowerCase()))
    : rooms;

  function commit(id: string) {
    const title = draft.trim();
    if (title) onRename(id, title);
    setEditing(null);
  }

  return (
    <div className="fixed inset-0 z-10 bg-black/60" onClick={onClose}>
      <nav
        className="flex h-full w-80 max-w-[85vw] flex-col bg-panel p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="rounded bg-accent p-2.5 text-[15px] font-medium text-ink sm:text-sm" onClick={onCreate}>
          New room
        </button>

        <input
          className="mt-2 w-full rounded bg-ink px-3 py-2 text-[15px] outline-none focus:ring-1 focus:ring-accent sm:text-sm"
          placeholder="Search rooms…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="flex items-center justify-between px-1 pt-2 text-[12px] text-slate-500">
          <span>
            {visible.length} room{visible.length === 1 ? "" : "s"}
            {query.trim() && ` of ${rooms.length}`}
          </span>
          {rooms.length > 0 && (
            <button
              className="text-red-400 hover:underline disabled:opacity-40"
              onClick={() => {
                if (confirm(`Delete all ${rooms.length} rooms and their history?`)) onDeleteAll();
              }}
            >
              Delete all
            </button>
          )}
        </div>

        <ul className="mt-1 flex-1 space-y-1 overflow-y-auto">
          {visible.map((room) => (
            <li key={room.id} className="flex items-center gap-1">
              {editing === room.id ? (
                <input
                  autoFocus
                  className="flex-1 rounded bg-ink px-2 py-2.5 text-[15px] outline-none focus:ring-1 focus:ring-accent sm:text-sm"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commit(room.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commit(room.id);
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
              ) : (
                <>
                  <button
                    className={`flex-1 truncate rounded px-2 py-2.5 text-left text-[15px] sm:text-sm ${
                      room.id === activeId ? "bg-edge" : ""
                    }`}
                    onClick={() => onSelect(room.id)}
                  >
                    {room.title}
                  </button>
                  <button
                    className="px-2 py-1 text-slate-500 hover:text-slate-200"
                    onClick={() => {
                      setDraft(room.title);
                      setEditing(room.id);
                    }}
                    aria-label={`Rename ${room.title}`}
                  >
                    ✎
                  </button>
                  <button
                    className="px-2 py-1 text-slate-500 hover:text-red-400"
                    onClick={() => onDelete(room.id)}
                    aria-label={`Delete ${room.title}`}
                  >
                    ✕
                  </button>
                </>
              )}
            </li>
          ))}
          {visible.length === 0 && (
            <li className="px-2 py-4 text-center text-[13px] text-slate-600">no matching rooms</li>
          )}
        </ul>

        {username && (
          <div className="flex shrink-0 items-center gap-2 border-t border-edge pt-2 text-[13px] text-slate-400 sm:text-xs">
            <span className="flex-1 truncate">{username}</span>
            {canLogout && (
              <button
                className="rounded border border-edge px-2 py-1 hover:text-red-400"
                onClick={onLogout}
              >
                Sign out
              </button>
            )}
          </div>
        )}

        <div className="max-h-[40%] shrink-0 overflow-y-auto">
          <CouncilStatus />
        </div>
      </nav>
    </div>
  );
}
