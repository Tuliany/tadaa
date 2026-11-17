import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remotion's renderer runs in a separate process (scripts/render.mjs); keep it out of server bundles.
  serverExternalPackages: ["@remotion/renderer", "@remotion/bundler", "pg", "@aws-sdk/client-s3", "stripe"],
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
