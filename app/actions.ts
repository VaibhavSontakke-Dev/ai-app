"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, type Problem } from "@/lib/api";
import { cookieOptions, IDP, REFRESH, REFRESH_MAX_AGE, revokeSession, SESSION } from "@/lib/session";

export type FormState = { error?: string; done?: string; secret?: string };

const explain = (p: Problem): string => [p.detail ?? p.title, p.correlationId && `Reference ${p.correlationId}`].filter(Boolean).join(" ");
const text = (f: FormData, k: string): string => String(f.get(k) ?? "");

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  // The mock identity provider stands in for an authorization code + PKCE flow.
  const res = await fetch(`${IDP}/dev/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user: text(form, "user") }), cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return { error: "The identity provider cannot be reached. Start it with npm start in ai-api." };
  const { access_token, refresh_token, expires_in } = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  const jar = await cookies();
  jar.set(SESSION, access_token, cookieOptions(expires_in));
  jar.set(REFRESH, refresh_token, cookieOptions(REFRESH_MAX_AGE));
  redirect("/");
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH)?.value;
  if (refreshToken) await revokeSession(refreshToken);
  jar.delete(SESSION);
  jar.delete(REFRESH);
  redirect("/");
}

export async function addComment(_: FormState, form: FormData): Promise<FormState> {
  const r = await api(`/v1/cases/${encodeURIComponent(text(form, "caseId"))}/comments`, {
    method: "POST", body: { body: text(form, "body") }, headers: { "idempotency-key": text(form, "key") },
  });
  if (!r.ok) return { error: explain(r.problem) };
  refresh();
  return { done: "Comment added." };
}

export async function escalate(_: FormState, form: FormData): Promise<FormState> {
  const r = await api(`/v1/cases/${encodeURIComponent(text(form, "caseId"))}/escalate`, {
    method: "POST",
    body: { level: text(form, "level"), reason: text(form, "reason"), note: text(form, "note") },
    headers: { "idempotency-key": text(form, "key"), "if-match": text(form, "etag") },
  });
  if (!r.ok) {
    // A 412 means the page is old, so show the current case next to the message.
    if (r.problem.status === 412) refresh();
    return { error: explain(r.problem) };
  }
  refresh();
  return { done: "Case escalated." };
}

export async function decide(_: FormState, form: FormData): Promise<FormState> {
  const decision = text(form, "decision");
  if (decision !== "approve" && decision !== "reject") return { error: "Choose approve or reject." };
  const r = await api(`/v1/action-requests/${encodeURIComponent(text(form, "id"))}/${decision}`, { method: "POST" });
  refresh();
  return r.ok ? {} : { error: explain(r.problem) };
}

export async function subscribe(_: FormState, form: FormData): Promise<FormState> {
  const r = await api<{ secret: string }>("/v1/webhook-subscriptions", { method: "POST", body: { url: text(form, "url"), events: ["case.escalated"] } });
  if (!r.ok) return { error: explain(r.problem) };
  refresh();
  return { done: "Subscribed. Copy the signing secret now; it is not shown again.", secret: r.data.secret };
}

export async function changeSubscription(_: FormState, form: FormData): Promise<FormState> {
  const path = `/v1/webhook-subscriptions/${encodeURIComponent(text(form, "id"))}`;
  if (text(form, "change") === "rotate") {
    const r = await api<{ secret: string }>(`${path}/rotate-secret`, { method: "POST" });
    return r.ok ? { done: "New secret. The old one keeps working for 24 hours. Copy it now; it is not shown again.", secret: r.data.secret } : { error: explain(r.problem) };
  }
  if (text(form, "change") !== "delete") return { error: "Choose an action." };
  const r = await api<null>(path, { method: "DELETE" });
  if (!r.ok) return { error: explain(r.problem) };
  refresh();
  return {};
}
