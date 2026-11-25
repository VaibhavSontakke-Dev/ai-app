"use client";

import { useActionState } from "react";
import { addComment, changeSubscription, decide, escalate, signIn, subscribe, type FormState } from "./actions";

const button = "rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-85 disabled:opacity-50";
const quiet = "rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-subtle disabled:opacity-50";
const field = "w-full rounded-md border border-line bg-background px-3 py-2 text-sm";

function Secret({ state }: { state: FormState }) {
  return state.secret ? <code className="block rounded-md bg-subtle px-3 py-2 font-mono text-sm break-all">{state.secret}</code> : null;
}

function Message({ state }: { state: FormState }) {
  return (
    <p aria-live="polite" className={`text-sm ${state.error ? "text-danger" : "text-ok"}`}>
      {state.error ?? state.done ?? ""}
    </p>
  );
}

const PEOPLE = [
  ["sam.support", "Support engineer. Can comment and escalate."],
  ["lena.lead", "Support lead. Can also approve for others and read the audit trail."],
  ["fiona.finance", "Finance analyst. Can see ARR; cannot write."],
  ["carl.csm", "Customer success. Sees two accounts only."],
];

export function SignIn() {
  const [state, action, pending] = useActionState(signIn, {});
  return (
    <form action={action} className="grid max-w-xl gap-3">
      <p className="text-sm text-muted">Demo identities from the mock identity provider. No password.</p>
      {PEOPLE.map(([id, about]) => (
        <button key={id} name="user" value={id} disabled={pending} className="rounded-md border border-line px-4 py-3 text-left hover:bg-subtle disabled:opacity-50">
          <span className="block font-medium">{id}</span>
          <span className="text-sm text-muted">{about}</span>
        </button>
      ))}
      <Message state={state} />
    </form>
  );
}

/** The key comes from the server render: the same after an error (safe retry), new after a success. */
export function CommentForm({ caseId, idempotencyKey }: { caseId: string; idempotencyKey: string }) {
  const [state, action, pending] = useActionState(addComment, {});
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="key" value={idempotencyKey} />
      <label className="grid gap-1 text-sm font-medium">
        Add a comment
        <textarea name="body" required maxLength={4000} rows={3} className={field} />
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={button}>{pending ? "Adding" : "Add comment"}</button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function EscalateForm({ caseId, etag, level, idempotencyKey }: { caseId: string; etag: string; level: string; idempotencyKey: string }) {
  const [state, action, pending] = useActionState(escalate, {});
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="etag" value={etag} />
      <input type="hidden" name="level" value={level} />
      <input type="hidden" name="key" value={idempotencyKey} />
      <label className="grid gap-1 text-sm font-medium">
        Reason
        <select name="reason" className={field} defaultValue="customer_impact">
          <option value="customer_impact">Customer impact</option>
          <option value="sla_breach_risk">SLA breach risk</option>
          <option value="security_concern">Security concern</option>
          <option value="executive_request">Executive request</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Note
        <textarea name="note" required minLength={10} maxLength={500} rows={2} className={field} />
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={button}>{pending ? "Escalating" : `Escalate to ${level}`}</button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function DecideForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(decide, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button name="decision" value="approve" disabled={pending} className={button}>Approve and run</button>
      <button name="decision" value="reject" disabled={pending} className={quiet}>Reject</button>
      <Message state={state} />
    </form>
  );
}

export function SubscribeForm() {
  const [state, action, pending] = useActionState(subscribe, {});
  return (
    <form action={action} className="grid max-w-xl gap-2">
      <label className="grid gap-1 text-sm font-medium">
        Send escalations to
        <input name="url" type="url" required maxLength={500} placeholder="https://" className={field} />
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={button}>Subscribe</button>
        <Message state={state} />
      </div>
      <Secret state={state} />
    </form>
  );
}

export function SubscriptionForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(changeSubscription, {});
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-2">
        <button name="change" value="rotate" disabled={pending} className={quiet}>Replace secret</button>
        <button
          name="change" value="delete" disabled={pending} className={quiet}
          onClick={(e) => { if (!window.confirm("Delete this subscription?")) e.preventDefault(); }}
        >
          Delete
        </button>
        <Message state={state} />
      </div>
      <Secret state={state} />
    </form>
  );
}
