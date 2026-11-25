import { cookies } from "next/headers";
import { connection } from "next/server";
import { readClaims, SESSION } from "./session";

// Server only: the token stays in an httpOnly cookie and never reaches client code.
const API = process.env.API_URL ?? "http://localhost:4000";

export type Problem = { title: string; detail?: string; type: string; status: number; correlationId?: string; rule?: string };
export type Result<T> = { ok: true; data: T; etag: string | null } | { ok: false; problem: Problem };

export type Customer = {
  id: string; name: string; supportTier: string; contractEndDate: string | null; renewalDate: string | null; daysToRenewal: number | null; arrUsd?: number;
  usage: { month: string; protectedTb: number; apiCalls: number; activeUsers: number } | null;
  degraded: boolean; sources: Record<"entitlement" | "usage", { status: string; reason?: string; asOf?: string | null }>;
  dataQuality: { code: string; message: string }[]; redactedFields: string[]; asOf: string;
};
export type CaseSummary = {
  id: string; subject: string; priority: string; status: string; openedAt: string; openHours: number | null; version: number; commentCount: number;
  customer: { id: string; name: string | null; supportTier: string | null; renewalDate: string | null; daysToRenewal: number | null; dataQuality: { message: string }[] };
  escalation: { level: string; reason: string; at: string } | null;
};
export type CaseDetail = CaseSummary & { comments: { id: string; author: string; body: string; at: string }[] };
export type CaseList = { data: CaseSummary[]; meta: { nextCursor: string | null; degraded: boolean; asOf: string } };
export type ActionRequest = {
  id: string; action: "add_comment" | "escalate"; caseId: string; customerId: string; caseVersion: number; status: string; requestedBy: string; agent: string;
  decidedBy: string | null; failure: string | null; createdAt: string; expiresAt: string; payload: { body?: string; level?: string; reason?: string; note?: string };
};
export type WebhookSubscription = { id: string; url: string; events: string[]; createdAt: string };
export type AuditEvent = { seq: number; at: string; kind: string; actor: string; agent: string | null; action: string; resource: string | null; outcome: string; correlationId: string | null };

const local = (title: string, status: number): Result<never> => ({ ok: false, problem: { type: "local", title, status } });

export async function api<T>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Result<T>> {
  const token = (await cookies()).get(SESSION)?.value;
  if (!token) return local("Sign in to continue", 401);
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: init.method ?? "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${token}`, ...(init.body !== undefined && { "content-type": "application/json" }), ...init.headers },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    });
  } catch {
    return local("The API cannot be reached. Start it with npm start in ai-api.", 503);
  }
  if (res.status === 204) return { ok: true, data: null as T, etag: null };
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok || data === null) return { ok: false, problem: (data as Problem | null) ?? { type: "local", title: `Unexpected answer (${res.status})`, status: res.status } };
  return { ok: true, data: data as T, etag: res.headers.get("etag") };
}

/** For display only. The API verifies the token on every call. */
export async function currentUser(): Promise<{ name: string; scopes: string[] } | null> {
  await connection(); // the expiry check below needs the time of a real request, not of a prerender
  const claims = readClaims((await cookies()).get(SESSION)?.value);
  return claims && claims.exp * 1000 > Date.now() ? { name: claims.sub, scopes: claims.scope.split(" ") } : null;
}
