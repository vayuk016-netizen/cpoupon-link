import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, HeadContent, Scripts, useRouter } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import appCss from "../styles.css?url";
import { reportHiggsfieldError } from "../lib/higgsfield-error-reporting";
import appMetaJson from "../app-meta.json";

declare const __HF_DESIGN_INSPECTOR__: boolean;

type AppMeta = { og_title?: string | null; og_description?: string | null; og_image_url?: string | null; favicon_url?: string | null; og_video_url?: string | null };
const appMeta = appMetaJson as AppMeta;
function assetUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/")) return value;
  try { const url = new URL(value); return url.hostname.endsWith("higgsfield.app") || url.hostname.endsWith("higgsfield-dev.app") ? url.pathname + url.search : value; }
  catch { return value; }
}
function buildHead(meta: AppMeta) {
  const title = meta.og_title ?? "Coupon Link Vault";
  const description = meta.og_description ?? "A private, device-local archive for saving coupon links, tracking expiry dates, and backing up your records.";
  const image = assetUrl(meta.og_image_url); const favicon = assetUrl(meta.favicon_url); const video = assetUrl(meta.og_video_url);
  return { meta: [
    { charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, { title },
    { name: "description", content: description }, { name: "theme-color", content: "#0b0f17" }, { name: "robots", content: "noindex, nofollow" },
    { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    ...(image ? [{ property: "og:image", content: image }, { name: "twitter:image", content: image }] : []),
    ...(video ? [{ property: "og:video", content: video }] : []),
  ], links: [{ rel: "stylesheet", href: appCss }, ...(favicon ? [{ rel: "icon", href: favicon }] : [])] };
}
function NotFoundComponent() { return <main className="not-found"><span className="brand-mark">⌁</span><h1>Page not found</h1><p>The page you're looking for doesn't exist.</p><a className="button not-found-return-button" href="/">Return to archive</a></main>; }
function ErrorComponent({ error, reset }: { error: any; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { reportHiggsfieldError(error, { boundary: "coupon_vault_root_error" }); }, [error]);
  return <main className="not-found"><span className="brand-mark">!</span><h1>This page didn't load</h1><p>Something went wrong. You can try refreshing the page.</p><button className="button error-retry-button" onClick={() => { router.invalidate(); reset(); }}>Try again</button></main>;
}
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => buildHead(appMeta),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});
function RootShell({ children }: { children: ReactNode }) {
  return <html lang="en"><head><HeadContent /></head><body>{children}<Scripts /></body></html>;
}
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    if (!__HF_DESIGN_INSPECTOR__) return;
    void import("../module/design-inspector/runtime").then(({ installHiggsfieldDesignInspector }) => installHiggsfieldDesignInspector()).catch((error) => reportHiggsfieldError(error instanceof Error ? error : new Error("Failed to load design inspector"), { boundary: "coupon_vault_design_inspector" }));
  }, []);
  return <QueryClientProvider client={queryClient}><Outlet /></QueryClientProvider>;
}
