import { useEffect, useState } from "react";
import { api, type UsageReport, type ProviderUsage } from "../api";
import Icon from "./Icon";

// The drawer unmounts this panel every time it closes, but probing costs a CLI
// spawn per provider — so the report outlives the component and is only fetched
// again when the reader asks for it.
let cached: UsageReport | null = null;

function resetIn(iso: string | null): string {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${Math.floor(hours / 24)}d`;
}

/**
 * claude-dashboard files each CLI's limit into a five-hour and a seven-day slot,
 * but codex on a Pro plan reports a window that resets days out — so a "5h" chip
 * next to "6d" reads as a second, broken metric. When the slot and its own reset
 * disagree, the reset wins and the chip says what the window really is.
 */
function windowChip(slot: "5h" | "7d", iso: string | null): string {
  if (!iso) return slot;
  const hours = (new Date(iso).getTime() - Date.now()) / 3_600_000;
  return hours > (slot === "5h" ? 5 : 24 * 7) ? resetIn(iso) : slot;
}

function Bar({ percent }: { percent: number }) {
  const tone = percent >= 90 ? "bg-red-500" : percent >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded bg-edge">
      <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
  );
}

function Member({ provider }: { provider: ProviderUsage }) {
  const quota = provider.quota;
  return (
    <li className="rounded-xl bg-ink p-2.5">
      <div className="flex items-center gap-2">
        <Icon
          name={provider.authenticated ? "check" : "x"}
          className={`h-4 w-4 ${provider.authenticated ? "text-emerald-400" : "text-red-400"}`}
        />
        <span className="text-[15px] sm:text-sm">{provider.label}</span>
        {provider.is_chairman && (
          <span className="rounded bg-edge px-1 text-[10px] tracking-wide text-slate-300">CHAIR</span>
        )}
        {!provider.is_member && <span className="text-[10px] text-slate-500">off</span>}
      </div>

      {provider.account && <p className="truncate pt-1 text-[13px] text-slate-400 sm:text-[11px]">{provider.account}</p>}
      <p className="pt-0.5 text-[13px] text-slate-500 sm:text-[11px]">
        {provider.model ?? "model unknown"}
        {provider.model_is_default && provider.model ? " (CLI default)" : ""}
        {provider.effort ? ` · effort: ${provider.effort}` : ""}
      </p>

      {quota ? (
        <div className="space-y-1 pt-1.5">
          {quota.five_hour_percent !== null && (
            <div className="flex items-center gap-2 text-[12px] text-slate-400 sm:text-[11px]">
              <span className="w-8">{windowChip("5h", quota.five_hour_reset)}</span>
              <Bar percent={quota.five_hour_percent} />
              <span className="w-28 text-right sm:w-24">
                {quota.five_hour_percent}% used
                {quota.five_hour_reset ? ` · resets in ${resetIn(quota.five_hour_reset)}` : ""}
              </span>
            </div>
          )}
          {quota.seven_day_percent !== null && (
            <div className="flex items-center gap-2 text-[12px] text-slate-400 sm:text-[11px]">
              <span className="w-8">{windowChip("7d", quota.seven_day_reset)}</span>
              <Bar percent={quota.seven_day_percent} />
              <span className="w-28 text-right sm:w-24">
                {quota.seven_day_percent}% used
                {quota.seven_day_reset ? ` · resets in ${resetIn(quota.seven_day_reset)}` : ""}
              </span>
            </div>
          )}
        </div>
      ) : (
        <p className="pt-1 text-[12px] text-slate-600 sm:text-[11px]">quota not reported by this CLI</p>
      )}

      <p className="pt-1 text-[12px] text-slate-500 sm:text-[11px]">
        {provider.calls} calls here
        {provider.failures > 0 && ` · ${provider.failures} failed`}
      </p>
    </li>
  );
}

export default function CouncilStatus() {
  const [report, setReport] = useState<UsageReport | null>(cached);
  const [busy, setBusy] = useState(false);

  function load(refresh: boolean) {
    setBusy(true);
    api
      .usage(refresh)
      .then((fresh) => {
        cached = fresh;
        setReport(fresh);
      })
      .catch(() => {})
      .finally(() => setBusy(false));
  }

  useEffect(() => {
    if (!cached) load(false);
  }, []);

  if (!report) {
    return (
      <section className="border-t border-edge pt-3">
        <h2 className="flex items-center gap-2 pb-2 text-xs tracking-widest text-slate-500">
          COUNCIL
          <span className="inline-block h-3 w-3 animate-spin rounded-full border border-slate-600 border-t-accent" />
        </h2>
        <ul className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="animate-pulse rounded-xl bg-ink p-3">
              <div className="h-3 w-24 rounded bg-edge" />
              <div className="mt-2 h-2 w-36 rounded bg-edge" />
              <div className="mt-2 h-1.5 w-full rounded bg-edge" />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="border-t border-edge pt-3">
      <h2 className="flex items-center gap-2 pb-2 text-xs tracking-widest text-slate-500">
        COUNCIL
        <button
          className="ml-auto flex items-center gap-1 rounded border border-edge px-1.5 py-0.5 text-[11px] tracking-normal hover:text-slate-200 disabled:opacity-40"
          onClick={() => load(true)}
          disabled={busy}
          title="Re-read every CLI's account and quota"
        >
          <Icon name="refresh" className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </h2>
      <ul className="space-y-2">
        {report.providers.map((p) => (
          <Member key={p.name} provider={p} />
        ))}
      </ul>
      <p className="pt-2 text-[10px] text-slate-600">
        {report.quota_source
          ? `quota via ${report.quota_source}`
          : "no quota source installed — CLIs do not report remaining quota"}
      </p>
    </section>
  );
}
