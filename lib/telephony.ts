import { prisma } from '@/lib/prisma';

export type TelephonyConfig = {
  enabled: boolean;
  provider: 'tel' | 'fritzbox';
  fritzHost: string;
  fritzUsername: string;
  fritzPassword: string;
  fritzDialPort: string;
};

const TELEPHONY_KEYS = [
  'telephony:enabled',
  'telephony:provider',
  'telephony:fritzHost',
  'telephony:fritzUsername',
  'telephony:fritzPassword',
  'telephony:fritzDialPort',
] as const;

function parseBool(value?: string | null): boolean {
  return value === '1' || value === 'true';
}

export function normalizePhone(input: string): string {
  return (input || '').replace(/[^\d+*#]/g, '');
}

export function ensureHttpUrl(hostOrUrl: string): string {
  const value = (hostOrUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, '');
  return `http://${value.replace(/\/+$/, '')}`;
}

export async function getTelephonyConfig(): Promise<TelephonyConfig> {
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: [...TELEPHONY_KEYS] } },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const provider = (map['telephony:provider'] === 'fritzbox' ? 'fritzbox' : 'tel') as 'tel' | 'fritzbox';
  return {
    enabled: parseBool(map['telephony:enabled']),
    provider,
    fritzHost: map['telephony:fritzHost'] || 'http://fritz.box',
    fritzUsername: map['telephony:fritzUsername'] || '',
    fritzPassword: map['telephony:fritzPassword'] || '',
    fritzDialPort: map['telephony:fritzDialPort'] || '',
  };
}

export async function triggerFritzCall(phone: string, config: TelephonyConfig): Promise<void> {
  const dialNumber = normalizePhone(phone);
  if (!dialNumber) throw new Error('Ungueltige Telefonnummer');

  const baseUrl = ensureHttpUrl(config.fritzHost);
  if (!baseUrl) throw new Error('FritzBox-Adresse fehlt');

  const url = `${baseUrl}/cgi-bin/webcm`;
  const params = new URLSearchParams();
  // Requested simple click-to-dial pattern via webcm
  params.set('action', 'telcfg:settings/CalledNumber');
  params.set('telcfg:settings/UseClickToDial', '1');
  params.set('telcfg:settings/CalledNumber', dialNumber);
  if (config.fritzDialPort) {
    params.set('telcfg:settings/DialPort', config.fritzDialPort);
  }
  params.set('telcfg:command/Dial', 'apply');

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (config.fritzUsername || config.fritzPassword) {
    const basic = Buffer.from(`${config.fritzUsername}:${config.fritzPassword}`, 'utf8').toString('base64');
    headers.Authorization = `Basic ${basic}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: params.toString(),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`FritzBox-Request fehlgeschlagen (${res.status})`);
  }
}
