import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/token";

/** Clears the session cookie and returns to the login page. */
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
