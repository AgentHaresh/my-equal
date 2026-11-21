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

const nextConfig: NextConfig = {
  /* config options here */
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
