// #region agent log
fetch('http://127.0.0.1:7242/ingest/e9515060-c33f-4cf0-ba0c-13880c1a9597',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scripts/vercel-build.ts:5',message:'Build script started',data:{nodeVersion:process.version,env:process.env.NODE_ENV,hasDbUrl:!!process.env.DATABASE_URL},timestamp:Date.now(),sessionId:'debug-session',runId:'build',hypothesisId:'A'})}).catch(()=>{});
// #endregion agent log

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const logPath = path.join(process.cwd(), '.cursor', 'debug.log');

function log(message: string, data?: any) {
  const logEntry = {
    location: 'scripts/vercel-build.ts',
    message,
    data: data || {},
    timestamp: Date.now(),
    sessionId: 'debug-session',
    runId: 'build',
  };
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/e9515060-c33f-4cf0-ba0c-13880c1a9597',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...logEntry,hypothesisId:'A'})}).catch(()=>{});
  // #endregion agent log
  
  console.log(`[BUILD] ${message}`, data || '');
}

async function main() {
  try {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e9515060-c33f-4cf0-ba0c-13880c1a9597',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scripts/vercel-build.ts:25',message:'Checking environment',data:{nodeVersion:process.version,hasDbUrl:!!process.env.DATABASE_URL,dbUrlPrefix:process.env.DATABASE_URL?.substring(0,20)||'NOT_SET'},timestamp:Date.now(),sessionId:'debug-session',runId:'build',hypothesisId:'B'})}).catch(()=>{});
    // #endregion agent log
    
    log('Starting Vercel build process', {
      nodeVersion: process.version,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
    });

    // Step 1: Prisma Generate (doesn't need DB connection)
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e9515060-c33f-4cf0-ba0c-13880c1a9597',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scripts/vercel-build.ts:35',message:'Before prisma generate',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'build',hypothesisId:'C'})}).catch(()=>{});
    // #endregion agent log
    
    log('Step 1: Running prisma generate...');
    try {
      execSync('npx prisma generate', { stdio: 'inherit' });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e9515060-c33f-4cf0-ba0c-13880c1a9597',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scripts/vercel-build.ts:40',message:'After prisma generate - success',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'build',hypothesisId:'C'})}).catch(()=>{});
      // #endregion agent log
      log('✅ Prisma generate completed');
    } catch (error: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e9515060-c33f-4cf0-ba0c-13880c1a9597',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scripts/vercel-build.ts:45',message:'After prisma generate - failed',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'build',hypothesisId:'C'})}).catch(()=>{});
      // #endregion agent log
      log('❌ Prisma generate failed', { error: error.message });
      throw error;
    }

    // Step 2: Prisma Migrate Deploy (needs DB connection)
    if (process.env.DATABASE_URL) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e9515060-c33f-4cf0-ba0c-13880c1a9597',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scripts/vercel-build.ts:52',message:'Before prisma migrate deploy',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'build',hypothesisId:'D'})}).catch(()=>{});
      // #endregion agent log
      
      log('Step 2: Running prisma migrate deploy...');
      try {
        execSync('npx prisma migrate deploy', { stdio: 'inherit' });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/e9515060-c33f-4cf0-ba0c-13880c1a9597',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scripts/vercel-build.ts:57',message:'After prisma migrate deploy - success',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'build',hypothesisId:'D'})}).catch(()=>{});
        // #endregion agent log
        log('✅ Prisma migrate deploy completed');
      } catch (error: any) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/e9515060-c33f-4cf0-ba0c-13880c1a9597',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scripts/vercel-build.ts:62',message:'After prisma migrate deploy - failed',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'build',hypothesisId:'D'})}).catch(()=>{});
        // #endregion agent log
        log('⚠️ Prisma migrate deploy failed (continuing anyway)', { error: error.message });
        // Don't fail the build if migrations fail - might be first deploy
      }
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e9515060-c33f-4cf0-ba0c-13880c1a9597',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scripts/vercel-build.ts:68',message:'Skipping migrate deploy - no DATABASE_URL',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'build',hypothesisId:'B'})}).catch(()=>{});
      // #endregion agent log
      log('⚠️ Skipping prisma migrate deploy - DATABASE_URL not set');
    }

    // Step 3: Next.js Build
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e9515060-c33f-4cf0-ba0c-13880c1a9597',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scripts/vercel-build.ts:74',message:'Before next build',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'build',hypothesisId:'E'})}).catch(()=>{});
    // #endregion agent log
    
    log('Step 3: Running next build...');
    try {
      execSync('npm run build', { stdio: 'inherit' });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e9515060-c33f-4cf0-ba0c-13880c1a9597',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scripts/vercel-build.ts:79',message:'After next build - success',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'build',hypothesisId:'E'})}).catch(()=>{});
      // #endregion agent log
      log('✅ Next.js build completed');
    } catch (error: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e9515060-c33f-4cf0-ba0c-13880c1a9597',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scripts/vercel-build.ts:84',message:'After next build - failed',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'build',hypothesisId:'E'})}).catch(()=>{});
      // #endregion agent log
      log('❌ Next.js build failed', { error: error.message });
      throw error;
    }

    log('✅ Build process completed successfully');
  } catch (error: any) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e9515060-c33f-4cf0-ba0c-13880c1a9597',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scripts/vercel-build.ts:91',message:'Build process failed',data:{error:error.message,stack:error.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'build',hypothesisId:'ALL'})}).catch(()=>{});
    // #endregion agent log
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

main();

