import { randomUUID } from "node:crypto";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { api, currentUser, type CaseDetail } from "@/lib/api";
import { CommentForm, EscalateForm } from "../../forms";
import { Facts, Failure, Loading, Warning, label, when } from "../../ui";

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const [r, user] = await Promise.all([api<CaseDetail>(`/v1/cases/${encodeURIComponent(id)}`), currentUser()]);
  if (!r.ok) return <Failure problem={r.problem} />;
  const c = r.data;
  const next = c.escalation === null ? "L2" : c.escalation.level === "L2" ? "L3" : null;
  const can = (s: string): boolean => user?.scopes.includes(s) ?? false;
  return (
    <div className="grid gap-8">
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold">{c.subject}</h1>
        {c.customer.dataQuality.map((d) => <Warning key={d.message}>{d.message}</Warning>)}
        <Facts items={[
          ["Case", c.id],
          ["Customer", <Link key="c" className="underline" href={`/customers/${c.customer.id}`}>{c.customer.name ?? c.customer.id}</Link>],
          ["Priority", c.priority],
          ["Status", label(c.status)],
          ["Opened", when(c.openedAt)],
          ["Open for", c.openHours === null ? "Finished" : `${c.openHours} h`],
          ["Escalation", c.escalation ? `${c.escalation.level}, ${label(c.escalation.reason)}` : "None"],
          ["Version", c.version],
        ]} />
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="grid content-start gap-4">
          <h2 className="text-lg font-semibold">Comments</h2>
          {c.comments.length === 0 && <p className="text-sm text-muted">No comments yet.</p>}
          <ul className="grid gap-3">
            {c.comments.map((m) => (
              <li key={m.id} className="border-l-2 border-line pl-3">
                <p className="text-xs text-muted">{m.author}, {when(m.at)}</p>
                <p className="text-sm break-words whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ul>
          {can("cases:comment") && <CommentForm caseId={c.id} idempotencyKey={`web-${randomUUID()}`} />}
        </section>
        {can("cases:escalate") && (
          <section className="grid content-start gap-4">
            <h2 className="text-lg font-semibold">Escalation</h2>
            {next && r.etag
              ? <EscalateForm caseId={c.id} etag={r.etag} level={next} idempotencyKey={`web-${randomUUID()}`} />
              : <p className="text-sm text-muted">Already at the highest level.</p>}
          </section>
        )}
      </div>
    </div>
  );
}

export default function Page({ params }: PageProps<"/cases/[id]">) {
  return <Suspense fallback={<Loading />}><Detail params={params} /></Suspense>;
}
