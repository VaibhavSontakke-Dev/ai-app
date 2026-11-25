/** Shared by the proxy and the server actions. No secrets leave the server. */
export const SESSION = "console_session";
export const REFRESH = "console_refresh";
export const IDP = process.env.IDP_URL ?? "http://localhost:4100";
const client = { client_id: "console", client_secret: process.env.CONSOLE_CLIENT_SECRET ?? "local-console-secret" };

export const cookieOptions = (maxAge: number) =>
  ({ httpOnly: true, sameSite: "strict", secure: process.env.COOKIE_SECURE === "true", path: "/", maxAge }) as const;
export const REFRESH_MAX_AGE = 8 * 3600;

export type Claims = { sub: string; scope: string; exp: number };

/** Reads without verifying. The API verifies the token on every call. */
export function readClaims(token: string | undefined): Claims | null {
  try {
    return token ? (JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()) as Claims) : null;
  } catch {
    return null;
  }
}

const post = (path: string, body: object) =>
  fetch(`${IDP}${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...client, ...body }), cache: "no-store", signal: AbortSignal.timeout(5000),
  });

export type Refreshed = { ok: true; token: string; expiresIn: number } | { ok: false; ended: boolean };

/** `ended` means the identity provider refused. When it cannot be reached the session is left alone. */
export async function refreshSession(refreshToken: string): Promise<Refreshed> {
  try {
    const res = await post("/token", { grant_type: "refresh_token", refresh_token: refreshToken });
    if (!res.ok) return { ok: false, ended: res.status === 400 };
    const b = (await res.json()) as { access_token: string; expires_in: number };
    return { ok: true, token: b.access_token, expiresIn: b.expires_in };
  } catch {
    return { ok: false, ended: false };
  }
}

export async function revokeSession(refreshToken: string): Promise<void> {
  await post("/revoke", { token: refreshToken }).catch(() => undefined);
}
