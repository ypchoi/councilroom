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
    <li className="rounded-xl bg-ink p-2">
      <div className="flex items-center gap-2">
        <span className={provider.authenticated ? "text-emerald-400" : "text-red-400"}>
          {provider.authenticated ? "✓" : "✕"}
        </span>
        <span className="text-sm">{provider.label}</span>
        {provider.is_chairman && (
          <span className="rounded bg-edge px-1 text-[10px] tracking-wide text-slate-300">CHAIR</span>
        )}
        {!provider.is_member && <span className="text-[10px] text-slate-500">off</span>}
      </div>

      {provider.account && <p className="truncate pt-1 text-[11px] text-slate-400">{provider.account}</p>}

      {quota ? (
        <div className="space-y-1 pt-1.5">
          {quota.five_hour_percent !== null && (
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="w-6">5h</span>
              <Bar percent={quota.five_hour_percent} />
              <span className="w-20 text-right">
                {quota.five_hour_percent}% · {resetIn(quota.five_hour_reset)}
              </span>
            </div>
          )}
          {quota.seven_day_percent !== null && (
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="w-6">7d</span>
              <Bar percent={quota.seven_day_percent} />
              <span className="w-20 text-right">
                {quota.seven_day_percent}% · {resetIn(quota.seven_day_reset)}
              </span>
            </div>
          )}
        </div>
      ) : (
        <p className="pt-1 text-[11px] text-slate-600">quota not reported by this CLI</p>
      )}

      <p className="pt-1 text-[11px] text-slate-500">
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

  if (!report) return null;

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
