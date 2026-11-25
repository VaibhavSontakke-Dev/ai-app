import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions, readClaims, refreshSession, REFRESH, SESSION } from "./lib/session";

/** Renews the access token shortly before it ends, for this request and for the browser. */
export async function proxy(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH)?.value;
  if (!refreshToken) return NextResponse.next();
  const claims = readClaims(request.cookies.get(SESSION)?.value);
  if (claims && claims.exp * 1000 - Date.now() > 60_000) return NextResponse.next();

  const r = await refreshSession(refreshToken);
  if (r.ok) {
    request.cookies.set(SESSION, r.token);
    const response = NextResponse.next({ request });
    response.cookies.set(SESSION, r.token, cookieOptions(r.expiresIn));
    return response;
  }
  if (!r.ended) return NextResponse.next();
  request.cookies.delete(SESSION);
  request.cookies.delete(REFRESH);
  const response = NextResponse.next({ request });
  response.cookies.delete(SESSION);
  response.cookies.delete(REFRESH);
  return response;
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
