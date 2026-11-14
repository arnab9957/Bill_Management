import { NextResponse, type NextRequest } from "next/server";

/**
 * First gate only: no cookie → login page. The real session and role checks
 * happen on the server in requireRole(), which every page/action calls.
 */
export function middleware(req: NextRequest) {
  const has = req.cookies.has("sb_session");
  if (!has) {
    if (req.nextUrl.pathname.startsWith("/api/")) return new NextResponse("Unauthorized", { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!login|api/health|_next/static|_next/image|favicon.ico).*)"] };
