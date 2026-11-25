import { Suspense } from "react";
import { api, type WebhookSubscription } from "@/lib/api";
import { SubscribeForm, SubscriptionForm } from "../forms";
import { Failure, Loading, when } from "../ui";

async function Subscriptions() {
  const r = await api<{ data: WebhookSubscription[] }>("/v1/webhook-subscriptions");
  if (!r.ok) return <Failure problem={r.problem} />;
  return (
    <div className="grid gap-6">
      {r.data.data.length === 0 && <p>No subscriptions yet.</p>}
      <ul className="grid gap-4">
        {r.data.data.map((s) => (
          <li key={s.id} className="grid gap-2 rounded-md border border-line p-4">
            <h2 className="font-semibold break-all">{s.url}</h2>
            <p className="text-xs text-muted">{s.events.join(", ")}, since {when(s.createdAt)}, {s.id}</p>
            <SubscriptionForm id={s.id} />
          </li>
        ))}
      </ul>
      <SubscribeForm />
    </div>
  );
}

export default function Page() {
  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">Webhooks</h1>
      <Suspense fallback={<Loading />}><Subscriptions /></Suspense>
    </section>
  );
}
