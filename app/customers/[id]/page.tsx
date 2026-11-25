import Link from "next/link";
import { Suspense } from "react";
import { api, type Customer } from "@/lib/api";
import { Facts, Failure, Loading, Warning, label } from "../../ui";

const days = (n: number | null): string => (n === null ? "Unknown" : n < 0 ? `Lapsed ${-n} days ago` : `In ${n} days`);

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await api<Customer>(`/v1/customers/${encodeURIComponent(id)}`);
  if (!r.ok) return <Failure problem={r.problem} />;
  const c = r.data;
  const stale = Object.entries(c.sources).filter(([, s]) => s.status !== "fresh").map(([k, s]) => `${k} ${s.status}${s.reason ? ` (${label(s.reason)})` : ""}`);
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{c.name}</h1>
      {c.degraded && <Warning>Incomplete data: {stale.join(", ")}.</Warning>}
      <Facts items={[
        ["Customer id", c.id],
        ["Support tier", c.supportTier],
        ["Renewal", c.renewalDate ?? "Unknown"],
        ["Time to renewal", days(c.daysToRenewal)],
        ["Contract end", c.contractEndDate ?? "Unknown"],
        ["ARR", c.arrUsd === undefined ? "Hidden for your role" : `$${c.arrUsd.toLocaleString("en-US")}`],
      ]} />
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">{c.usage ? `Usage in ${c.usage.month}` : "Usage"}</h2>
        {c.usage ? (
          <Facts items={[["Protected", `${c.usage.protectedTb} TB`], ["API calls", c.usage.apiCalls.toLocaleString("en-US")], ["Active users", c.usage.activeUsers]]} />
        ) : (
          <p className="text-sm text-muted">{c.sources.usage.status === "unavailable" ? "The usage warehouse is not answering." : "No usage recorded."}</p>
        )}
      </section>
      {c.dataQuality.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-lg font-semibold">Data notes</h2>
          <ul className="list-disc pl-5 text-sm">{c.dataQuality.map((d) => <li key={d.message}>{d.message}</li>)}</ul>
        </section>
      )}
      <Link className="text-sm underline" href={`/?customerId=${c.id}`}>Cases of this customer</Link>
    </div>
  );
}

export default function Page({ params }: PageProps<"/customers/[id]">) {
  return <Suspense fallback={<Loading />}><Detail params={params} /></Suspense>;
}
