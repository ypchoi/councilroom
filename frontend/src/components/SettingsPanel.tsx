import { useEffect, useState } from "react";
import { api, type Provider, type Settings } from "../api";

type Props = { providers: Provider[]; onClose: () => void; onSaved: (s: Settings) => void };

const Hint = ({ children }: { children: React.ReactNode }) => (
  <p className="pb-2 text-xs leading-relaxed text-slate-500">{children}</p>
);

export default function SettingsPanel({ providers, onClose, onSaved }: Props) {
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

        <section className="pb-4">
          <h3 className="pb-1 text-xs tracking-widest text-slate-500">MEMBERS</h3>
          <Hint>
            Every checked member answers your question independently, at the same time. More members
            means a broader answer and proportionally more subscription usage.
          </Hint>
          {providers.map((p) => (
            <label key={p.name} className="flex items-center gap-2 py-1 text-sm">
              <input
                type="checkbox"
                checked={settings.council.members.includes(p.name)}
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
              {!p.authenticated && <span className="text-xs text-amber-400">not authenticated</span>}
            </label>
          ))}
        </section>

        <section className="pb-4">
          <h3 className="pb-1 text-xs tracking-widest text-slate-500">CHAIRMAN</h3>
          <Hint>
            Reads every member's answer and writes the single final answer: resolving
            disagreements, keeping useful minority points. It runs after the members finish, so it
            costs one extra call.
          </Hint>
          <select
            className="w-full rounded bg-ink p-2 text-sm"
            value={settings.council.chairman}
            onChange={(e) => patch({ council: { ...settings.council, chairman: e.target.value } })}
          >
            {providers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.label}
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
            className="w-full rounded bg-ink p-2 text-sm"
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
            Model: leave empty to use whatever the CLI defaults to. Suggestions come from the CLI
            when it can list its models. Effort is only shown for Codex — Claude has no such flag,
            and Antigravity encodes the effort tier in the model id itself (…-high / -medium / -low).
          </Hint>
          {providers.map((p) => (
            <div key={p.name} className="pb-3">
              <p className="text-sm">{p.label}</p>
              {/* Free text with suggestions: only agy can enumerate its models. */}
              <input
                list={`models-${p.name}`}
                className="mt-1 w-full rounded bg-ink p-2 text-sm"
                placeholder="Default"
                value={settings.providers[p.name]?.model ?? ""}
                onChange={(e) =>
                  patch({
                    providers: {
                      ...settings.providers,
                      [p.name]: { ...settings.providers[p.name], model: e.target.value || null },
                    },
                  })
                }
              />
              <datalist id={`models-${p.name}`}>
                {p.models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              {p.name === "codex" && (
                <select
                  className="mt-1 w-full rounded bg-ink p-2 text-sm"
                  value={settings.providers[p.name]?.effort ?? ""}
                  onChange={(e) =>
                    patch({
                      providers: {
                        ...settings.providers,
                        [p.name]: { ...settings.providers[p.name], effort: e.target.value || null },
                      },
                    })
                  }
                >
                  <option value="">Default effort</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              )}
            </div>
          ))}
        </section>

        <section className="pb-4">
          <h3 className="pb-2 text-xs tracking-widest text-slate-500">EXECUTION</h3>
          <Hint>How long one member may take before it is cancelled and marked failed.</Hint>
          <label className="block pb-2 text-sm">
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
          <label className="block text-sm">
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
          <label className="flex items-center gap-2 text-sm">
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
