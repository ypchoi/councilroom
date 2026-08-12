import { useEffect, useState } from "react";
import { api, type UsageReport, type ProviderUsage } from "../api";

const REFRESH_MS = 60_000;

function resetIn(iso: string | null): string {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${Math.floor(hours / 24)}d`;
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
        <span className={provider.authenticated ? "text-emerald-400" : "text-red-400"}>
          {provider.authenticated ? "✓" : "✕"}
        </span>
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
              <span className="w-6">5h</span>
              <Bar percent={quota.five_hour_percent} />
              <span className="w-24 text-right sm:w-20">
                {quota.five_hour_percent}% · {resetIn(quota.five_hour_reset)}
              </span>
            </div>
          )}
          {quota.seven_day_percent !== null && (
            <div className="flex items-center gap-2 text-[12px] text-slate-400 sm:text-[11px]">
              <span className="w-6">7d</span>
              <Bar percent={quota.seven_day_percent} />
              <span className="w-24 text-right sm:w-20">
                {quota.seven_day_percent}% · {resetIn(quota.seven_day_reset)}
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
  const [report, setReport] = useState<UsageReport | null>(null);

  useEffect(() => {
    const load = () => api.usage().then(setReport).catch(() => {});
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
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
      <h2 className="pb-2 text-xs tracking-widest text-slate-500">COUNCIL</h2>
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
