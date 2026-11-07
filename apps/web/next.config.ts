import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // MVP: every page renders live harness data at request time; PPR/Cache
  // Components add constraints (no segment configs) for no benefit here.
  // Revisit post-MVP if we want a static shell with streamed data.
  cacheComponents: false,
  partialPrefetching: false,
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
