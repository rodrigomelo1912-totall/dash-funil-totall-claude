import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login.html", "/api/auth", "/login.css"];

export function middleware(request) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith("/api/auth"))) {
    return NextResponse.next();
  }
  const session = request.cookies.get("dash_session");
  if (session?.value === process.env.SESSION_SECRET) {
    return NextResponse.next();
  }
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login.html";
  return NextResponse.redirect(loginUrl);
}

export const config = { matcher: ["/((?!_next|favicon.ico).*)"] };
