import { prisma } from '@/lib/prisma';
import type { LocalAiConfig } from './config';

export const CONFIG_KEY = 'local-ai:pilot';
export async function readLocalAiConfig(): Promise<LocalAiConfig> {
  const row = await prisma.systemSetting.findUnique({ where: { key: CONFIG_KEY } });
  if (!row) return { enabled: false, baseUrl: '', apiKey: '' };
  return JSON.parse(row.value) as LocalAiConfig;
}
