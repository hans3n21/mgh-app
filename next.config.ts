import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Performance optimizations for development
  experimental: {
    turbo: {
      // Reduce file watching sensitivity
      resolveAlias: {},
      // Optimize hot reload
      memoryLimit: 4096,
    },
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
