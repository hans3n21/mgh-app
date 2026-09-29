import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,

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
          // Python-Umgebungen und Modelldateien der lokalen KI-Dienste
          // (services/*/.venv, services/*/data): zigtausend Dateien und
          // mehrere GB. Mit Polling legte das den Dev-Server lahm.
          '**/.venv/**',
          '**/services/*/data/**',
          '**/__pycache__/**',
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
