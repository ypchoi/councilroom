import { useEffect, useState } from "react";
import { api, type Provider, type Settings } from "../api";
import CouncilStatus from "./CouncilStatus";

type Props = {
  providers: Provider[];
  username: string | null;
  canLogout: boolean;
  onLogout: () => void;
  onClose: () => void;
  onSaved: (s: Settings) => void;
};

const Hint = ({ children }: { children: React.ReactNode }) => (
  <p className="pb-2 text-[13px] leading-relaxed text-slate-500 sm:text-xs">{children}</p>
);

/** Probing spawns each CLI, so say what the wait is for instead of showing an empty section. */
const Probing = () => (
  <div aria-busy>
    <p className="flex items-center gap-2 pb-2 text-[13px] text-slate-500 sm:text-xs">
      <span className="inline-block h-3 w-3 animate-spin rounded-full border border-slate-600 border-t-accent" />
      Checking which CLIs are installed and signed in…
    </p>
    {[0, 1, 2].map((i) => (
      <div key={i} className="mb-1.5 h-5 animate-pulse rounded bg-ink" />
    ))}
  </div>
);

export default function SettingsPanel({
  providers,
  username,
  canLogout,
  onLogout,
  onClose,
  onSaved,
}: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.settings().then(setSettings).catch((e) => setError(e.message));
  }, []);

  if (!settings) {
    return (
      <div className="fixed inset-0 z-20 grid place-items-center bg-black/70 p-4" onClick={onClose}>
        <p className="text-sm text-slate-400">{error ?? "Loading…"}</p>
      </div>
    );
  }

  const patch = (next: Partial<Settings>) => setSettings({ ...settings, ...next });
  // /api/providers always answers with every known provider, so an empty list
  // means the probe has not come back yet — not that there are none.
  const probing = providers.length === 0;

  async function save() {
    try {
      const saved = await api.saveSettings(settings!);
      onSaved(saved);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex justify-center bg-black/70 p-3" onClick={onClose}>
      <div
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-edge bg-panel p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="pb-3 text-lg font-medium">Settings</h2>

        {username && (
          <section className="flex items-center gap-2 pb-4 text-[15px] sm:text-sm">
            <span className="flex-1 truncate text-slate-300">{username}</span>
            {canLogout && (
              <button
                className="rounded border border-edge px-2 py-1 text-[13px] hover:text-red-400 sm:text-xs"
                onClick={onLogout}
              >
                Sign out
              </button>
            )}
          </section>
        )}

        {/* Who the council is right now, above the settings that change it. */}
        <div className="pb-4">
          <CouncilStatus />
        </div>

        <section className="pb-4">
          <h3 className="pb-1 text-xs tracking-widest text-slate-500">MEMBERS</h3>
          <Hint>
            Every checked member answers your question independently, at the same time. More members
            means a broader answer and proportionally more subscription usage.
          </Hint>
          {probing && <Probing />}
          {providers.map((p) => (
            <label
              key={p.name}
              className={`flex items-center gap-2 py-1.5 text-[15px] sm:text-sm ${
                p.authenticated ? "" : "opacity-50"
              }`}
            >
              <input
                type="checkbox"
                // A member that cannot answer must not be selectable.
                disabled={!p.authenticated}
                checked={settings.council.members.includes(p.name) && p.authenticated}
                onChange={(e) =>
                  patch({
                    council: {
                      ...settings.council,
                      members: e.target.checked
                        ? [...settings.council.members, p.name]
                        : settings.council.members.filter((m) => m !== p.name),
                    },
                  })
                }
              />
              {p.label}
              {!p.available && <span className="text-xs text-amber-400">CLI not installed</span>}
              {p.available && !p.authenticated && (
                <span className="text-xs text-amber-400">not signed in</span>
              )}
            </label>
          ))}
        </section>

        <section className="pb-4">
          <h3 className="pb-1 text-xs tracking-widest text-slate-500">CHAIRMAN</h3>
          <Hint>
            Reads every member's answer and writes the single final answer: resolving
            disagreements, keeping useful minority points. It runs after the members finish, so it
            costs one extra call. <strong>Random</strong> draws a member per question;{" "}
            <strong>Rotation</strong> passes the seat to the next member each time — both spread
            the extra call, and the synthesis style, across the council.
          </Hint>
          <select
            className="w-full rounded bg-ink p-2.5 text-[15px] disabled:opacity-50 sm:text-sm"
            disabled={probing}
            value={settings.council.chairman}
            onChange={(e) => patch({ council: { ...settings.council, chairman: e.target.value } })}
          >
            {probing && <option>Checking which CLIs are signed in…</option>}
            <option value="random">Random</option>
            <option value="rotation">Rotation</option>
            {providers.map((p) => (
              <option key={p.name} value={p.name} disabled={!p.authenticated}>
                {p.label}
                {p.authenticated ? "" : p.available ? " — not signed in" : " — not installed"}
              </option>
            ))}
          </select>
        </section>

        <section className="pb-4">
          <h3 className="pb-1 text-xs tracking-widest text-slate-500">DEFAULT MODE</h3>
          <Hint>
            <strong>Quick</strong>: members answer once, the Chairman synthesises — 1 call per
            member + 1. <strong>Deep</strong>: members then review each other's answers anonymously
            before synthesis — roughly double the calls, better at catching mistakes.
          </Hint>
          <select
            className="w-full rounded bg-ink p-2.5 text-[15px] sm:text-sm"
            value={settings.council.default_mode}
            onChange={(e) =>
              patch({ council: { ...settings.council, default_mode: e.target.value as "quick" | "deep" } })
            }
          >
            <option value="quick">Quick Council</option>
            <option value="deep">Deep Council</option>
          </select>
        </section>

        <section className="pb-4">
          <h3 className="pb-1 text-xs tracking-widest text-slate-500">PROVIDER SETTINGS</h3>
          <Hint>
            The line-up is fixed so every member answers at the same tier and a council run costs a
            predictable amount of quota. Antigravity carries its effort tier inside the model id.
            To change any of it, edit <code>~/.councilroom/config.yaml</code> and restart.
          </Hint>
          {probing && <Probing />}
          {providers.map((p) => (
            <div key={p.name} className="flex items-baseline gap-2 pb-2 text-[15px] sm:text-sm">
              <span className="w-28 shrink-0 text-slate-300">{p.label}</span>
              <span className="text-slate-400">{settings.providers[p.name]?.model ?? "CLI default"}</span>
              {settings.providers[p.name]?.effort && (
                <span className="text-slate-500">· effort {settings.providers[p.name]?.effort}</span>
              )}
            </div>
          ))}
        </section>

        <section className="pb-4">
          <h3 className="pb-2 text-xs tracking-widest text-slate-500">EXECUTION</h3>
          <Hint>How long one member may take before it is cancelled and marked failed.</Hint>
          <label className="block pb-2 text-[15px] sm:text-sm">
            Timeout (seconds)
            <input
              type="number"
              className="mt-1 w-full rounded bg-ink p-2"
              value={settings.execution.timeout_seconds}
              onChange={(e) => patch({ execution: { timeout_seconds: Number(e.target.value) } })}
            />
          </label>
          <Hint>
            If fewer members than this succeed, synthesis is skipped and the errors are shown with a
            retry button, rather than presenting a thin answer as if it were the council's.
          </Hint>
          <label className="block text-[15px] sm:text-sm">
            Minimum successful members
            <input
              type="number"
              min={1}
              max={settings.council.members.length || 1}
              className="mt-1 w-full rounded bg-ink p-2"
              value={settings.council.minimum_successful_members}
              onChange={(e) =>
                patch({
                  council: { ...settings.council, minimum_successful_members: Number(e.target.value) },
                })
              }
            />
          </label>
          {settings.council.minimum_successful_members > settings.council.members.length && (
            <p className="pt-1 text-xs text-amber-400">
              Only {settings.council.members.length} member(s) selected — runs will require just{" "}
              {Math.max(1, settings.council.members.length)}.
            </p>
          )}
        </section>

        <section className="pb-4">
          <h3 className="pb-1 text-xs tracking-widest text-slate-500">CONVERSATION</h3>
          <Hint>
            On: each member continues its own CLI session per room, so it remembers its earlier
            answers and attachments, and provider-side caching applies. Off: every turn starts a
            fresh session and CouncilRoom resends a transcript it rebuilds from the room.
          </Hint>
          <label className="flex items-center gap-2 text-[15px] sm:text-sm">
            <input
              type="checkbox"
              checked={settings.council.resume_sessions}
              onChange={(e) =>
                patch({ council: { ...settings.council, resume_sessions: e.target.checked } })
              }
            />
            Resume provider sessions
          </label>
        </section>

        {error && <p className="pb-2 text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="rounded border border-edge px-3 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="rounded bg-accent px-3 py-2 text-sm font-medium text-ink" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
