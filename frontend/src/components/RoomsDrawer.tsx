import { useState } from "react";
import { localTime, shareUrl, type Room } from "../api";
import CouncilStatus from "./CouncilStatus";
import Icon from "./Icon";

type Props = {
  rooms: Room[];
  activeId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
  onShare: (id: string) => void;
  onUnshare: (id: string) => void;
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
  onShare,
  onUnshare,
  username,
  canLogout,
  onLogout,
}: Props) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  /** The room whose "…" menu is open — only ever one. */
  const [menu, setMenu] = useState<string | null>(null);

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
        <button
          className="flex items-center justify-center gap-2 rounded bg-accent p-2.5 text-[15px] font-medium text-ink sm:text-sm"
          onClick={onCreate}
        >
          New room
          <Icon name="pencil" className="h-4 w-4" />
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

        <ul className="mt-1 flex-1 divide-y divide-edge overflow-y-auto">
          {visible.map((room) => (
            <li key={room.id} className="py-1">
              {editing === room.id ? (
                <input
                  autoFocus
                  className="w-full rounded bg-ink px-2 py-2.5 text-[15px] outline-none focus:ring-1 focus:ring-accent sm:text-sm"
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
                  <div className="flex items-center gap-1">
                    <button
                      className={`min-w-0 flex-1 truncate rounded px-2 py-2 text-left text-[15px] sm:text-sm ${
                        room.id === activeId ? "bg-edge" : ""
                      }`}
                      onClick={() => onSelect(room.id)}
                    >
                      {room.title}
                    </button>
                    <button
                      className={`shrink-0 rounded p-2.5 hover:bg-edge hover:text-slate-100 ${
                        menu === room.id ? "bg-edge text-slate-100" : "text-slate-400"
                      }`}
                      onClick={() => setMenu(menu === room.id ? null : room.id)}
                      aria-label={`Actions for ${room.title}`}
                      aria-expanded={menu === room.id}
                    >
                      <Icon name="more" strokeWidth={2.5} />
                    </button>
                  </div>

                  <div className="flex items-baseline gap-2 px-2 text-[11px] text-slate-500">
                    <span className="shrink-0">{localTime(room.updated_at)}</span>
                    {room.share_token && (
                      <a
                        href={shareUrl(room.share_token)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="shrink-0 text-accent hover:underline"
                        title={shareUrl(room.share_token)}
                      >
                        {room.share_token.slice(0, 6)}…
                      </a>
                    )}
                  </div>

                  {/* In flow, not floating: a menu absolutely placed on the last
                      room would be cut off by the list it scrolls inside. */}
                  {menu === room.id && (
                    <div className="mt-1 overflow-hidden rounded-lg border border-edge bg-ink text-[14px]">
                      <button
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-edge"
                        onClick={() => {
                          setDraft(room.title);
                          setEditing(room.id);
                          setMenu(null);
                        }}
                      >
                        <Icon name="pencil" className="h-4 w-4" />
                        Rename
                      </button>
                      <button
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-edge"
                        onClick={() => {
                          if (room.share_token) onUnshare(room.id);
                          else onShare(room.id);
                          setMenu(null);
                        }}
                        title={room.share_token ? undefined : "Create a public read-only link"}
                      >
                        <Icon name="link" className="h-4 w-4" />
                        {room.share_token ? "Stop sharing" : "Share"}
                      </button>
                      <button
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-red-400 hover:bg-edge"
                        onClick={() => {
                          onDelete(room.id);
                          setMenu(null);
                        }}
                      >
                        <Icon name="trash" className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  )}
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
