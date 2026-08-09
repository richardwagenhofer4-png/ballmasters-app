import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthenticated = !!request.cookies.get("ballmasters_auth")?.value;
  const role = request.cookies.get("ballmasters_role")?.value ?? "";

  // Unauthenticated users on protected routes → login
  const isProtected =
    pathname === "/dashboard" ||
    pathname === "/incomplete-profile" ||
    pathname.startsWith("/coach") ||
    pathname.startsWith("/student") ||
    pathname.startsWith("/admin");
  if (isProtected && !isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // /incomplete-profile is for authenticated users with no Firestore profile — let it through
  if (pathname === "/incomplete-profile") {
    return NextResponse.next();
  }

  // /dashboard (exact) is a relay — send authenticated users to their role page
  if (pathname === "/dashboard" && isAuthenticated) {
    const url = request.nextUrl.clone();
    if (role === "coach" || role === "admin") {
      url.pathname = "/coach/dashboard";
    } else if (role === "student") {
      url.pathname = "/student/dashboard";
    } else {
      // No valid role cookie — Firestore profile likely missing
      url.pathname = "/incomplete-profile";
    }
    return NextResponse.redirect(url);
  }

  // A student has no coach or admin console — send them to their own dashboard.
  // This is UI tidiness, not an access boundary (the role cookie is client-set
  // and editable; the real protection is the Firestore security rules). Only
  // the student→coach/admin direction is redirected; /student/* is intentionally
  // left open because coaches legitimately open student routes. A missing or
  // unexpected role cookie is not "student", so it keeps the existing
  // pass-through behaviour below unchanged.
  if (
    isAuthenticated &&
    role === "student" &&
    (pathname.startsWith("/coach") || pathname.startsWith("/admin"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/student/dashboard";
    return NextResponse.redirect(url);
  }

  // Authenticated users on /coach/*, /student/*, /admin/* pass through immediately —
  // no further redirect logic should touch these routes
  if (
    isAuthenticated &&
    (pathname.startsWith("/coach") || pathname.startsWith("/student") || pathname.startsWith("/admin"))
  ) {
    return NextResponse.next();
  }

  // Authenticated users hitting /login or /register → their dashboard
  if (
    isAuthenticated &&
    (pathname.startsWith("/login") || pathname.startsWith("/register"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname =
      role === "coach" || role === "admin"
        ? "/coach/dashboard"
        : role === "student"
        ? "/student/dashboard"
        : "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/incomplete-profile", "/coach/:path*", "/student/:path*", "/admin/:path*", "/login", "/register"],
};
