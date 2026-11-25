import Link from "next/link";
import { Suspense } from "react";
import { api, type CaseList } from "@/lib/api";
import { Failure, Loading, Warning, label, td, th } from "./ui";

const PRESET = "priority=P1&supportTier=Platinum&openForMoreThanHours=48&renewalWithinDays=90&sort=renewalDate";
const FIELDS = ["priority", "status", "supportTier", "customerId", "openForMoreThanHours", "renewalWithinDays", "sort"];
const HEADINGS = ["Case", "Subject", "Customer", "Tier", "Renewal", "Priority", "Status", "Open (h)", "Level"];
const field = "rounded-md border border-line bg-background px-2 py-1.5 text-sm font-normal text-foreground";

type Query = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";

async function Cases({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const q = new URLSearchParams();
  for (const f of FIELDS) if (one(query[f]).trim()) q.set(f, one(query[f]).trim());
  const filters = q.toString();
  if (one(query.cursor)) q.set("cursor", one(query.cursor));
  const r = await api<CaseList>(`/v1/cases?${q}`);

  const select = (name: string, text: string, options: string[]) => (
    <label className="grid gap-1 text-xs font-medium text-muted">
      {text}
      <select name={name} defaultValue={one(query[name])} className={field}>
        <option value="">Any</option>
        {options.map((o) => <option key={o} value={o}>{label(o)}</option>)}
      </select>
    </label>
  );
  const input = (name: string, text: string, type: string, width: string) => (
    <label className="grid gap-1 text-xs font-medium text-muted">
      {text}
      <input name={name} type={type} min={type === "number" ? 0 : undefined} defaultValue={one(query[name])} className={`${field} ${width}`} />
    </label>
  );

  return (
    <div className="grid gap-4">
      <form key={filters} className="flex flex-wrap items-end gap-3">
        {select("priority", "Priority", ["P1", "P2", "P3", "P4"])}
        {select("status", "Status", ["open", "in_progress", "waiting_on_customer", "resolved", "closed"])}
        {select("supportTier", "Tier", ["Platinum", "Gold", "Silver", "Standard"])}
        {input("customerId", "Customer id", "text", "w-28")}
        {input("openForMoreThanHours", "Open for more than (hours)", "number", "w-40")}
        {input("renewalWithinDays", "Renewal within (days)", "number", "w-36")}
        <button className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background">Search</button>
        <Link href="/" className="py-1.5 text-sm underline">Clear</Link>
        <Link href={`/?${PRESET}`} className="py-1.5 text-sm underline">Renewal risk</Link>
      </form>
      {!r.ok ? <Failure problem={r.problem} /> : (
        <>
          {r.data.meta.degraded && <Warning>Some source data is old or missing.</Warning>}
          {r.data.data.length === 0 ? <p>No cases match these filters.</p> : (
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full border-collapse">
                <thead className="bg-subtle">
                  <tr>{HEADINGS.map((h) => <th key={h} scope="col" className={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {r.data.data.map((c) => (
                    <tr key={c.id} className="border-t border-line">
                      <td className={`${td} font-mono whitespace-nowrap`}><Link className="underline" href={`/cases/${c.id}`}>{c.id}</Link></td>
                      <td className={td}>{c.subject}</td>
                      <td className={td}><Link className="underline" href={`/customers/${c.customer.id}`}>{c.customer.name ?? c.customer.id}</Link></td>
                      <td className={td}>{c.customer.supportTier ?? "Unknown"}</td>
                      <td className={`${td} tabular-nums whitespace-nowrap`}>
                        {c.customer.renewalDate ?? "Unknown"}
                        {c.customer.dataQuality.length > 0 && <span className="block text-xs text-warn">Sources disagree</span>}
                      </td>
                      <td className={td}>{c.priority}</td>
                      <td className={td}>{label(c.status)}</td>
                      <td className={`${td} text-right tabular-nums`}>{c.openHours ?? ""}</td>
                      <td className={td}>{c.escalation?.level ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {r.data.meta.nextCursor && (
            <Link className="text-sm underline" href={`/?${filters ? `${filters}&` : ""}cursor=${encodeURIComponent(r.data.meta.nextCursor)}`}>Next page</Link>
          )}
        </>
      )}
    </div>
  );
}

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">Cases</h1>
      <Suspense fallback={<Loading />}><Cases searchParams={searchParams} /></Suspense>
    </section>
  );
}
