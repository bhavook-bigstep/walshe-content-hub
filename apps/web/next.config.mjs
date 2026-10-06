/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow a second, isolated instance to build into its own output dir (e.g. `.next-alt`) so two
  // `next start` servers can run in parallel without clobbering each other's chunks. Defaults to
  // the standard `.next` when unset, so normal dev/build/e2e are unaffected.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Dev convenience: same-origin API proxy so the browser can reach the FastAPI backend without
  // CORS. The browser calls /api/* (same origin as the web app); Next forwards it to the API.
  // Enabled only when NEXT_PUBLIC_API_URL is a relative "/api" base (dev). In prod/e2e the client
  // uses an absolute API URL and these rewrites are inert.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET || "http://localhost:8000";
    return [{ source: "/api/:path*", destination: `${target}/:path*` }];
  },
};

export default nextConfig;
