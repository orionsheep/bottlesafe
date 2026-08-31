import { NextRequest, NextResponse } from "next/server";

/** 仅 3200 手机实例把 / /scan /archive 接到 /m*；边端 worker 读不到 process.env.PORT，所以看请求端口。 */
function isMobileInstance(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const port =
    req.nextUrl.port ||
    (host.includes(":") ? host.slice(host.lastIndexOf(":") + 1) : "");
  return port === "3200" || process.env.PORT === "3200";
}

export function middleware(req: NextRequest) {
  if (!isMobileInstance(req)) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/m" || pathname.startsWith("/m/")) return NextResponse.next();

  const map: Record<string, string> = {
    "/": "/m",
    "/scan": "/m/scan",
    "/archive": "/m/archive",
  };
  const dest = map[pathname];
  if (!dest) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = dest;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/", "/scan", "/archive", "/m/:path*"],
};
