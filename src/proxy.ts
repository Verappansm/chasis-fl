import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

/**
 * Optimistic check only: a valid-signature session cookie is required to reach
 * the app. Real authorisation (user still active, token not revoked) happens in
 * the Data Access Layer on every page and server action.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    return session ? NextResponse.redirect(new URL("/overview", request.url)) : NextResponse.next();
  }
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
