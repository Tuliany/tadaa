import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "tadaa_session";

/** Send logged-out visitors of app pages to the login page. API routes check sessions themselves. */
export function proxy(req: NextRequest) {
  if (!req.cookies.get(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/brands/:path*", "/reels/:path*", "/onboarding/:path*"],
};
