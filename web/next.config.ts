import type { NextConfig } from "next";
import path from "path";

// Settings live one folder up, next to the repository root, so load them from there:
//   .env         keys you provide (OpenAI key and model, Google client id)
//   .server.env  secrets the server generates for itself (session signing)
// Values already set in the real environment win.
for (const name of [".env", ".server.env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), "..", name));
  } catch {
    /* no such file: rely on the real environment */
  }
}

/** Headers sent with every response. A full content security policy is the next step; see SECURITY.md. */
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
