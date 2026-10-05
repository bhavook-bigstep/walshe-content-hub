/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
