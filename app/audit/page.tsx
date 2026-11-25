import Link from "next/link";
import { Suspense } from "react";
import { api, type AuditEvent } from "@/lib/api";
import { Failure, Loading, label, td, th, when } from "../ui";

const HEADINGS = ["#", "Time", "Kind", "Who", "Agent", "Action", "Resource", "Outcome"];
const KINDS = ["http", "agent_tool", "action", "webhook", "data_quality"];
const SIZE = 50;

type Query = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";
const href = (kind: string, beforeSeq?: number): string => {
  const q = new URLSearchParams({ ...(kind && { kind }), ...(beforeSeq && { beforeSeq: String(beforeSeq) }) }).toString();
  return q ? `/audit?${q}` : "/audit";
};

async function Events({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const kind = one(query.kind);
  const q = new URLSearchParams({ limit: String(SIZE) });
  if (kind) q.set("kind", kind);
  if (one(query.beforeSeq)) q.set("beforeSeq", one(query.beforeSeq));
  const r = await api<{ data: AuditEvent[]; chainValid: boolean; fullyVerifiedAt: string | null }>(`/v1/audit-events?${q}`);
  if (!r.ok) return <Failure problem={r.problem} />;
  const last = r.data.data.at(-1);
  return (
    <div className="grid gap-3">
      <p className={r.data.chainValid ? "text-sm text-ok" : "text-sm text-danger"}>
        {r.data.chainValid ? "Hash chain is valid." : "Hash chain is broken: the trail was changed."}{" "}
        {r.data.fullyVerifiedAt ? `Whole trail last checked ${when(r.data.fullyVerifiedAt)}.` : "The whole trail has not been checked yet."}
      </p>
      <nav aria-label="Kind" className="flex flex-wrap gap-3 text-sm">
        {["", ...KINDS].map((k) => (
          <Link key={k} href={href(k)} aria-current={k === kind ? "page" : undefined} className={k === kind ? "font-semibold" : "underline"}>{k ? label(k) : "all"}</Link>
        ))}
      </nav>
      {r.data.data.length === 0 ? <p>No events.</p> : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full border-collapse">
            <thead className="bg-subtle"><tr>{HEADINGS.map((h) => <th key={h} scope="col" className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {r.data.data.map((e) => (
                <tr key={e.seq} className="border-t border-line">
                  <td className={`${td} tabular-nums`}>{e.seq}</td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{when(e.at)}</td>
                  <td className={td}>{label(e.kind)}</td>
                  <td className={td}>{e.actor}</td>
                  <td className={td}>{e.agent?.replace("agent:", "") ?? ""}</td>
                  <td className={td}>{e.action}</td>
                  <td className={`${td} font-mono`}>{e.resource ?? ""}</td>
                  <td className={td}>{label(e.outcome)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex gap-4 text-sm">
        {one(query.beforeSeq) && <Link className="underline" href={href(kind)}>Newest</Link>}
        {last && r.data.data.length === SIZE && last.seq > 1 && <Link className="underline" href={href(kind, last.seq)}>Older</Link>}
      </div>
    </div>
  );
}

export default function Page({ searchParams }: PageProps<"/audit">) {
  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">Audit trail</h1>
      <Suspense fallback={<Loading />}><Events searchParams={searchParams} /></Suspense>
    </section>
  );
}
