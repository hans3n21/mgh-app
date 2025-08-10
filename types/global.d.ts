// Global type declarations for missing modules

declare module 'next-pwa' {
  interface PWAConfig {
    dest?: string;
    register?: boolean;
    skipWaiting?: boolean;
    runtimeCaching?: any[];
  }
  
  function withPWA(config: PWAConfig): (nextConfig: any) => any;
  export default withPWA;
}

declare module 'minimatch' {
  function minimatch(target: string, pattern: string, options?: any): boolean;
  export = minimatch;
}

declare module 'bcrypt' {
  export function hash(data: string, saltRounds: number): Promise<string>;
  export function compare(data: string, encrypted: string): Promise<boolean>;
}

declare module 'zod' {
  export * from 'zod/lib';
}

declare module '@prisma/client' {
  export * from '@prisma/client/index';
}
