import type { NextConfig } from "next";
import path from "path";

// The key file lives one folder up, next to the repository root, so load it from there.
// Values already set in the environment (for example on the server) win.
try {
  process.loadEnvFile(path.join(process.cwd(), "..", ".env"));
} catch {
  /* no file there: rely on the real environment */
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
