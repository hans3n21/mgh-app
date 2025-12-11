import { execSync } from 'child_process';

function log(message: string, data?: any) {
  console.log(`[BUILD] ${message}`, data || '');
}

async function main() {
  try {
    log('Starting Vercel build process', {
      nodeVersion: process.version,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
    });

    // Step 1: Prisma Generate (doesn't need DB connection)
    log('Step 1: Running prisma generate...');
    try {
      execSync('npx prisma generate', { stdio: 'inherit' });
      log('✅ Prisma generate completed');
    } catch (error: any) {
      log('❌ Prisma generate failed', { error: error.message });
      throw error;
    }

    // Step 2: Prisma Migrate Deploy (needs DB connection)
    if (process.env.DATABASE_URL) {
      log('Step 2: Running prisma migrate deploy...');
      try {
        execSync('npx prisma migrate deploy', { stdio: 'inherit' });
        log('✅ Prisma migrate deploy completed');
      } catch (error: any) {
        log('⚠️ Prisma migrate deploy failed (continuing anyway)', { error: error.message });
        // Don't fail the build if migrations fail - might be first deploy
      }
    } else {
      log('⚠️ Skipping prisma migrate deploy - DATABASE_URL not set');
    }

    // Step 3: Next.js Build
    log('Step 3: Running next build...');
    try {
      execSync('npm run build', { stdio: 'inherit' });
      log('✅ Next.js build completed');
    } catch (error: any) {
      log('❌ Next.js build failed', { error: error.message });
      throw error;
    }

    log('✅ Build process completed successfully');
  } catch (error: any) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

main();
