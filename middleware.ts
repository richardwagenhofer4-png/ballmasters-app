import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/coach", "/student"];
const AUTH_ROUTES = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAuthenticated = !!request.cookies.get("ballmasters_auth")?.value;
  const role = request.cookies.get("ballmasters_role")?.value ?? "";

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname.startsWith(p));

  // Unauthenticated user hitting a protected route → login
  if (isProtected && !isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // /dashboard is a relay — send users to their role-specific dashboard
  if (pathname === "/dashboard" && isAuthenticated) {
    const url = request.nextUrl.clone();
    if (role === "coach") {
      url.pathname = "/coach/dashboard";
    } else if (role === "student") {
      url.pathname = "/student/dashboard";
    } else {
      // admin or unknown role lands on the generic dashboard, no redirect loop
      return NextResponse.next();
    }
    return NextResponse.redirect(url);
  }

  // Already authenticated user hitting /login or /register → their dashboard
  if (isAuthRoute && isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname =
      role === "coach"
        ? "/coach/dashboard"
        : role === "student"
        ? "/student/dashboard"
        : "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/coach/:path*", "/student/:path*", "/login", "/register"],
};
