import { prisma } from '@/lib/prisma';
import { getPresetForOrderType } from '@/lib/order-presets';

export type Kv = Record<string, string>;

// einfache Alias-Tabelle (alt -> neu)
const GLOBAL_ALIASES: Record<string, string> = {
  color: 'farbe',
  finish_color: 'finish_body',
  korpus_finish: 'body_surface_treatment',
  neck_finish: 'finish_neck',
  headstockFinish: 'headstock_finish',
  headstock_finish_type: 'headstock_finish',
  body_finish: 'body_surface_treatment',
  body_ginish: 'body_surface_treatment',
  body_finish_type: 'body_surface_treatment',
  has_top: 'body_has_top',
  top_enabled: 'body_has_top',
  decke: 'body_has_top',
  guitar_model: 'body_shape',
  neck_profile: 'headstock_type',
  pickguard_color: 'pg_color_finish',
};

export function applyAliases(kv: Kv, orderType: string): Kv {
  const preset = getPresetForOrderType(orderType);
  const allowed = new Set<string>(Object.values(preset.fields).flat());
  const out: Kv = { ...kv };
  for (const [oldKey, newKey] of Object.entries(GLOBAL_ALIASES)) {
    if (oldKey in out && !(newKey in out)) {
      out[newKey] = out[oldKey];
      delete out[oldKey];
    }
  }
  // Altdaten: Wenn Top/Decken-Dicke gepflegt ist, setze Decke implizit auf Ja.
  if (!('body_has_top' in out)) {
    const hasTopDetails = Boolean((out.body_top || '').trim()) || Boolean((out.body_top_thickness || '').trim());
    if (hasTopDetails) out.body_has_top = 'Ja';
  }
  // Mit Top wird das Finish in Top/Korpus aufgeteilt: altes Gesamt-Finish gilt als Top-Finish.
  const hasTop = ['ja', 'true', '1', 'yes'].includes((out.body_has_top || '').trim().toLowerCase());
  if (hasTop) {
    const legacyFinish = (out.finish_body || '').trim() || (out.body_surface_treatment || '').trim();
    if (legacyFinish && !(out.finish_body_top || '').trim()) {
      out.finish_body_top = legacyFinish;
    }
    delete out.finish_body;
    delete out.body_surface_treatment;
  } else {
    // Body Finish / Korpus-Finish zusammenführen, falls nur eines gepflegt ist.
    if ((out.finish_body || '').trim() && !(out.body_surface_treatment || '').trim()) {
      out.body_surface_treatment = out.finish_body;
    }
    if ((out.body_surface_treatment || '').trim() && !(out.finish_body || '').trim()) {
      out.finish_body = out.body_surface_treatment;
    }
  }
  // entferne Keys, die im aktuellen Preset nicht vorkommen
  for (const k of Object.keys(out)) {
    if (!allowed.has(k)) delete out[k];
  }
  return out;
}

export async function migrateOnLoad(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, type: true } });
  if (!order) return;
  const rows = await prisma.orderSpecKV.findMany({ where: { orderId }, select: { id: true, key: true, value: true } });
  // Entferne Duplikate: behalte den "besten" Wert pro Key
  const uniqueSpecsMap = new Map<string, typeof rows[0]>();
  for (const spec of rows) {
    const existing = uniqueSpecsMap.get(spec.key);
    if (!existing) {
      uniqueSpecsMap.set(spec.key, spec);
    } else {
      const existingLength = existing.value.length;
      const currentLength = spec.value.length;
      if (currentLength > existingLength) {
        uniqueSpecsMap.set(spec.key, spec);
      } else if (currentLength === existingLength && spec.id > existing.id) {
        uniqueSpecsMap.set(spec.key, spec);
      }
    }
  }
  const kv = Object.fromEntries(Array.from(uniqueSpecsMap.values()).map(r => [r.key, r.value])) as Kv;
  const migrated = applyAliases(kv, order.type);
  // schreibe Änderungen
  const toDelete = Object.keys(kv).filter(k => !(k in migrated));
  const toUpsert = Object.entries(migrated);
  if (toDelete.length === 0 && toUpsert.length === rows.length) return;
  await prisma.$transaction(async (tx) => {
    if (toDelete.length) await tx.orderSpecKV.deleteMany({ where: { orderId, key: { in: toDelete } } });
    for (const [key, value] of toUpsert) {
      const existing = rows.find(r => r.key === key);
      if (existing) await tx.orderSpecKV.update({ where: { id: existing.id }, data: { value } });
      else await tx.orderSpecKV.create({ data: { orderId, key, value } });
    }
  });
}


