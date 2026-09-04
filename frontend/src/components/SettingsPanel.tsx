import { useEffect, useState } from "react";
import { api, type Provider, type Settings } from "../api";
import { LANGS, lang, setLang, t, type Lang } from "../i18n";
import * as push from "../push";
import CouncilStatus from "./CouncilStatus";

type Props = {
  providers: Provider[];
  username: string | null;
  canLogout: boolean;
  onLogout: () => void;
  onClose: () => void;
  onSaved: (s: Settings) => void;
};

/** A hint out of the strings table. **bold** is the only markup those carry. */
const Hint = ({ text }: { text: string }) => (
  <p className="pb-2 text-[13px] leading-relaxed text-slate-500 sm:text-xs">
    {text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part))}
  </p>
);

/** Probing spawns each CLI, so say what the wait is for instead of showing an empty section. */
const Probing = () => (
  <div aria-busy>
    <p className="flex items-center gap-2 pb-2 text-[13px] text-slate-500 sm:text-xs">
      <span className="inline-block h-3 w-3 animate-spin rounded-full border border-slate-600 border-t-accent" />
      {t("probing")}
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
  // Null until the service worker has been asked: this is the one setting that
  // belongs to the device in front of the reader rather than to the account.
  const [notify, setNotify] = useState<boolean | null>(null);

  useEffect(() => {
    api.settings().then(setSettings).catch((e) => setError(e.message));
    push.subscribed().then(setNotify).catch(() => setNotify(false));
  }, []);

  if (!settings) {
    return (
      <div className="fixed inset-0 z-20 grid place-items-center bg-black/70 p-4" onClick={onClose}>
        <p className="text-sm text-slate-400">{error ?? t("loading")}</p>
      </div>
    );
  }

  const patch = (next: Partial<Settings>) => setSettings({ ...settings, ...next });
  // /api/providers always answers with every known provider, so an empty list
  // means the probe has not come back yet — not that there are none.
  const probing = providers.length === 0;

  async function toggleNotify(on: boolean) {
    setError(null);
    setNotify(null);
    try {
      if (on) setNotify(await push.enable());
      else {
        await push.disable();
        setNotify(false);
      }
    } catch (e) {
      setError((e as Error).message);
      setNotify(await push.subscribed());
    }
  }

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
        <h2 className="pb-3 text-lg font-medium">{t("settings")}</h2>

        {username && (
          <section className="flex items-center gap-2 pb-4 text-[15px] sm:text-sm">
            <span className="flex-1 truncate text-slate-300">{username}</span>
            {canLogout && (
              <button
                className="rounded border border-edge px-2 py-1 text-[13px] hover:text-red-400 sm:text-xs"
                onClick={onLogout}
              >
                {t("signOut")}
              </button>
            )}
          </section>
        )}

        {/* Who the council is right now, above the settings that change it. */}
        <div className="pb-4">
          <CouncilStatus />
        </div>

        <section className="pb-4">
          <h3 className="pb-1 text-xs tracking-widest text-slate-500">{t("membersTitle")}</h3>
          <Hint text={t("membersHint")} />
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
              {!p.available && <span className="text-xs text-amber-400">{t("cliNotInstalled")}</span>}
              {p.available && !p.authenticated && (
                <span className="text-xs text-amber-400">{t("notSignedIn")}</span>
              )}
            </label>
          ))}
        </section>

        <section className="pb-4">
          <h3 className="pb-1 text-xs tracking-widest text-slate-500">{t("chairmanTitle")}</h3>
          <Hint text={t("chairmanHint")} />
          <select
            className="w-full rounded bg-ink p-2.5 text-[15px] disabled:opacity-50 sm:text-sm"
            disabled={probing}
            value={settings.council.chairman}
            onChange={(e) => patch({ council: { ...settings.council, chairman: e.target.value } })}
          >
            {probing && <option>{t("checkingSignedIn")}</option>}
            <option value="random">{t("chairRandom")}</option>
            <option value="rotation">{t("chairRotation")}</option>
            {providers.map((p) => (
              <option key={p.name} value={p.name} disabled={!p.authenticated}>
                {p.label}
                {p.authenticated ? "" : p.available ? t("optionNotSignedIn") : t("optionNotInstalled")}
              </option>
            ))}
          </select>
        </section>

        <section className="pb-4">
          <h3 className="pb-1 text-xs tracking-widest text-slate-500">{t("defaultModeTitle")}</h3>
          <Hint text={t("defaultModeHint")} />
          <select
            className="w-full rounded bg-ink p-2.5 text-[15px] sm:text-sm"
            value={settings.council.default_mode}
            onChange={(e) =>
              patch({ council: { ...settings.council, default_mode: e.target.value as "quick" | "deep" } })
            }
          >
            <option value="quick">{t("quickCouncil")}</option>
            <option value="deep">{t("deepCouncil")}</option>
          </select>
        </section>

        <section className="pb-4">
          <h3 className="pb-1 text-xs tracking-widest text-slate-500">{t("notificationsTitle")}</h3>
          <Hint text={t("notificationsHint")} />
          {!push.supported() ? (
            <p className="text-[13px] text-amber-400 sm:text-xs">{t("notificationsUnsupported")}</p>
          ) : push.blocked() ? (
            <p className="text-[13px] text-amber-400 sm:text-xs">{t("notificationsBlocked")}</p>
          ) : (
            <label className="flex items-center gap-2 py-1.5 text-[15px] sm:text-sm">
              <input
                type="checkbox"
                disabled={notify === null}
                checked={notify === true}
                onChange={(e) => toggleNotify(e.target.checked)}
              />
              {t("notifyThisDevice")}
            </label>
          )}
        </section>

        <section className="pb-4">
          <h3 className="pb-1 text-xs tracking-widest text-slate-500">{t("providerTitle")}</h3>
          <Hint text={t("providerHint")} />
          {probing && <Probing />}
          {providers.map((p) => (
            <div key={p.name} className="flex items-baseline gap-2 pb-2 text-[15px] sm:text-sm">
              <span className="w-28 shrink-0 text-slate-300">{p.label}</span>
              <span className="text-slate-400">
                {settings.providers[p.name]?.model ?? t("cliDefaultModel")}
              </span>
              {settings.providers[p.name]?.effort && (
                <span className="text-slate-500">
                  {t("effortSuffix")(settings.providers[p.name]!.effort!)}
                </span>
              )}
            </div>
          ))}
        </section>

        <section className="pb-4">
          <h3 className="pb-2 text-xs tracking-widest text-slate-500">{t("executionTitle")}</h3>
          <Hint text={t("timeoutHint")} />
          <label className="block pb-2 text-[15px] sm:text-sm">
            {t("timeoutLabel")}
            <input
              type="number"
              className="mt-1 w-full rounded bg-ink p-2"
              value={settings.execution.timeout_seconds}
              onChange={(e) => patch({ execution: { timeout_seconds: Number(e.target.value) } })}
            />
          </label>
          <Hint text={t("minMembersHint")} />
          <label className="block text-[15px] sm:text-sm">
            {t("minMembersLabel")}
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
              {t("minMembersWarn")(
                settings.council.members.length,
                Math.max(1, settings.council.members.length)
              )}
            </p>
          )}
        </section>

        <section className="pb-4">
          <h3 className="pb-1 text-xs tracking-widest text-slate-500">{t("conversationTitle")}</h3>
          <Hint text={t("conversationHint")} />
          <label className="flex items-center gap-2 text-[15px] sm:text-sm">
            <input
              type="checkbox"
              checked={settings.council.resume_sessions}
              onChange={(e) =>
                patch({ council: { ...settings.council, resume_sessions: e.target.checked } })
              }
            />
            {t("resumeSessions")}
          </label>
        </section>

        <section className="pb-4">
          <h3 className="pb-1 text-xs tracking-widest text-slate-500">{t("languageTitle")}</h3>
          <Hint text={t("languageHint")} />
          {/* Takes effect on the spot, unlike everything else here: it is this
              browser's own setting, not part of the config being saved. */}
          <select
            className="w-full rounded bg-ink p-2.5 text-[15px] sm:text-sm"
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
          >
            {LANGS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </section>

        {error && <p className="pb-2 text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="rounded border border-edge px-3 py-2 text-sm" onClick={onClose}>
            {t("cancel")}
          </button>
          <button className="rounded bg-accent px-3 py-2 text-sm font-medium text-ink" onClick={save}>
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
