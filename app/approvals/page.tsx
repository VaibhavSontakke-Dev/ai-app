import Link from "next/link";
import { Suspense } from "react";
import { api, currentUser, type ActionRequest } from "@/lib/api";
import { DecideForm } from "../forms";
import { Failure, Loading, label, when } from "../ui";

async function Requests() {
  const [r, user] = await Promise.all([api<{ data: ActionRequest[] }>("/v1/action-requests"), currentUser()]);
  if (!r.ok) return <Failure problem={r.problem} />;
  if (r.data.data.length === 0) return <p>The copilot has not proposed anything.</p>;
  return (
    <ul className="grid gap-4">
      {r.data.data.map((a) => {
        const scope = a.action === "escalate" ? "cases:escalate" : "cases:comment";
        const open = a.status === "pending" || a.status === "executing";
        return (
          <li key={a.id} className="grid gap-3 rounded-md border border-line p-4">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 className="font-semibold">
                {a.action === "escalate" ? `Escalate to ${a.payload.level}` : "Add a comment"} on <Link className="underline" href={`/cases/${a.caseId}`}>{a.caseId}</Link>
              </h2>
              <span className="text-sm text-muted">{label(a.status)}{a.decidedBy && ` by ${a.decidedBy}`}</span>
            </div>
            {/* Exactly what will be written. React escapes it. */}
            <blockquote className="border-l-2 border-line pl-3 text-sm break-words whitespace-pre-wrap">
              {a.action === "escalate" ? `${label(a.payload.reason ?? "")}: ${a.payload.note}` : a.payload.body}
            </blockquote>
            <p className="text-xs text-muted">
              Proposed by {a.agent} for {a.requestedBy}, {when(a.createdAt)}. Based on case version {a.caseVersion}.{open && ` Expires ${when(a.expiresAt)}.`}
            </p>
            {a.failure && <p className="text-sm text-danger">{a.failure}</p>}
            {open && (user?.scopes.includes(scope) ? <DecideForm id={a.id} /> : <p className="text-sm text-muted">Your role cannot decide this.</p>)}
          </li>
        );
      })}
    </ul>
  );
}

export default function Page() {
  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">Approvals</h1>
      <p className="text-sm text-muted">Nothing the copilot proposes happens until a person approves it here.</p>
      <Suspense fallback={<Loading />}><Requests /></Suspense>
    </section>
  );
}
