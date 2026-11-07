import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // MVP: every page renders live harness data at request time; PPR/Cache
  // Components add constraints (no segment configs) for no benefit here.
  // Revisit post-MVP if we want a static shell with streamed data.
  cacheComponents: false,
  partialPrefetching: false,
  // Dev server is reachable via localhost AND 127.0.0.1 (harness uses the
  // literal IP); without this Next 16 blocks dev resources cross-origin.
  allowedDevOrigins: ['127.0.0.1'],
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
