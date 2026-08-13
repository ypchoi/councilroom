import { useState } from "react";
import { localTime, shareUrl, type Room } from "../api";
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
  onSettings: () => void;
  /** Part of the page rather than a door over it — no backdrop, never dismissed. */
  pinned?: boolean;
  /** Overlay only: it stays mounted either way, so that it can slide both ways. */
  open?: boolean;
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
  onSettings,
  pinned,
  open = true,
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

  const nav = (
    <nav
      className={`flex h-full w-80 max-w-[85vw] flex-col bg-panel p-3 transition-transform duration-200 ease-out motion-reduce:transition-none ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
        {/* Product name up top: the sidebar owns the identity, the main header
            names the room. */}
        <div className="flex items-center justify-between gap-2 px-1 pb-1">
          <h1 className="text-lg font-semibold tracking-widest">COUNCIL ROOM</h1>
          {/* Not a cross: the list does not go away, it folds back to the edge it
              came from, and the same picture pointing the other way brings it back. */}
          <button
            className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-edge hover:text-slate-100"
            onClick={onClose}
            aria-label={pinned ? "Hide the room list" : "Close the room list"}
            title={pinned ? "Hide the room list" : "Close the room list"}
          >
            <Icon name="panel-close" />
          </button>
        </div>

        {/* Ask new sits at the head of the list, sized like an item so it reads as
            "add one more" rather than a competing primary action. */}
        <button
          className="mt-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[15px] text-slate-200 hover:bg-edge/60 sm:text-sm"
          onClick={onCreate}
        >
          <Icon name="pencil" className="h-4 w-4 text-slate-400" />
          Ask new
        </button>

        <input
          className="mt-2 w-full rounded bg-ink px-3 py-2 text-[15px] outline-none focus:ring-1 focus:ring-accent sm:text-sm"
          placeholder="Search rooms…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="px-1 pt-2 text-[12px] text-slate-500">
          {visible.length} room{visible.length === 1 ? "" : "s"}
          {query.trim() && ` of ${rooms.length}`}
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
                  {/* Both lines are the room, so both lines light up and both
                      answer a click. The row carries the click rather than the
                      title alone; the title stays a button so a keyboard can
                      still reach it, and its click bubbles up to here. */}
                  <div
                    className={`group flex cursor-pointer items-center gap-1 rounded transition-colors ${
                      room.id === activeId ? "bg-edge" : "hover:bg-edge/60"
                    }`}
                    onClick={() => onSelect(room.id)}
                  >
                    <div className="min-w-0 flex-1 px-2 py-1.5">
                      <button className="block w-full truncate text-left text-[15px] sm:text-sm">
                        {room.title}
                      </button>
                      <div className="flex items-baseline gap-2 text-[11px] text-slate-500">
                        <span className="shrink-0">{localTime(room.updated_at)}</span>
                        {room.share_token && (
                          <a
                            href={shareUrl(room.share_token)}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="shrink-0 text-accent hover:underline"
                            title={shareUrl(room.share_token)}
                            // The link is its own destination, not a way into the room.
                            onClick={(e) => e.stopPropagation()}
                          >
                            {room.share_token.slice(0, 6)}…
                          </a>
                        )}
                      </div>
                    </div>
                    {/* Centred by the row's own items-center: it belongs to both
                        lines, not to the title.

                        Hidden on desktop until the row is hovered or the menu is
                        open — a clean list until the reader signals interest.
                        Touch has no hover, so the arbitrary variant
                        `pointer:coarse` keeps it always visible there. */}
                    <button
                      className={`shrink-0 rounded p-2.5 transition-opacity hover:bg-edge hover:text-slate-300 ${
                        menu === room.id
                          ? "bg-edge text-slate-300 opacity-100"
                          : "text-slate-600 opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(pointer:coarse)]:opacity-100"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenu(menu === room.id ? null : room.id);
                      }}
                      aria-label={`Actions for ${room.title}`}
                      aria-expanded={menu === room.id}
                    >
                      <Icon name="more" strokeWidth={2.5} />
                    </button>
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

        {/* Account and council standing moved behind here: the drawer is for
            picking a room, and both were pushing the list into a sliver. */}
        <div className="mt-2 flex shrink-0 items-center justify-between gap-3 border-t border-edge pt-3">
          <button
            className="flex items-center gap-2 text-[15px] text-slate-300 hover:text-white sm:text-sm"
            onClick={onSettings}
          >
            <Icon name="settings" className="h-4 w-4" />
            Settings
          </button>
          {/* Bottom, not top: a destructive action does not sit above the list it
              would wipe. Kept subtle — the confirm dialog is where the guarding
              happens, not the button's weight. */}
          {rooms.length > 0 && (
            <button
              className="flex items-center gap-1.5 text-[13px] text-red-400 hover:text-red-300 sm:text-xs"
              onClick={() => {
                if (confirm(`Delete all ${rooms.length} rooms and their history?`)) onDeleteAll();
              }}
            >
              <Icon name="trash" className="h-4 w-4" />
              Delete all
            </button>
          )}
        </div>
    </nav>
  );

  // Pinned, it is furniture: nothing dims behind it and there is nothing to close.
  return pinned ? (
    nav
  ) : (
    // Closed, it is still here — that is what lets it slide out as well as in.
    // pointer-events go with the dimming, and the whole thing leaves the
    // accessibility tree, so a closed drawer is not a second room list to read.
    <div
      className={`fixed inset-0 z-10 bg-black/60 transition-opacity duration-200 motion-reduce:transition-none ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      onClick={onClose}
      aria-hidden={!open}
    >
      {nav}
    </div>
  );
}
