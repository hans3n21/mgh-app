import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Performance optimizations for development
  turbopack: {
    // Reduce file watching sensitivity
    resolveAlias: {},
  },
  
  // Reduce unnecessary rebuilds
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // Optimize file watching
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
          '**/dist/**',
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
