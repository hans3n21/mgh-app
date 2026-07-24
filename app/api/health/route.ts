import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Health-Check Endpoint
 * Prüft Datenbankverbindung und ob Daten vorhanden sind
 */
export async function GET() {
  try {
    // Teste Datenbankverbindung
    await prisma.$queryRaw`SELECT 1`;
    
    // Prüfe ob Daten vorhanden sind
    const [users, customers, orders] = await Promise.all([
      prisma.user.count().catch(() => 0),
      prisma.customer.count().catch(() => 0),
      prisma.order.count().catch(() => 0),
    ]);
    
    const totalRecords = users + customers + orders;
    const hasData = totalRecords > 0;
    const hasUsers = users > 0;
    const isHealthy = hasUsers && hasData;
    
    return NextResponse.json({
      status: isHealthy ? 'ok' : 'warning',
      timestamp: new Date().toISOString(),
      database: 'connected',
      health: {
        isHealthy,
        hasData,
        hasUsers,
      },
    });
  } catch {
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        health: {
          isHealthy: false,
          hasData: false,
          hasUsers: false,
        },
        error: 'Health check failed',
      },
      { status: 503 }
    );
  }
}












