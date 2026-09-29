import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';

const feedback = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { feedback } }));

import { pointOutHandlers } from '@/lib/pointout-server';

// Kleinstes gueltiges PNG (1x1), damit die Signaturpruefung von PointOut greift.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function feedbackRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/pointout/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      project_id: 'mgh-app',
      note: 'Knopf reagiert nicht',
      annotation_data: { version: 1, marks: [] },
      device_context: { route: '/app/orders/abc', page_url: 'http://localhost:3000/app/orders/abc?x=1', browser: 'Chrome', device_type: 'desktop' },
      category: 'bug',
      steps: [{ seconds_before: 4, kind: 'click', label: 'Speichern', route: '/app/orders/abc' }],
      ...body,
    }),
  });
}

describe('pointOutHandlers', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'pointout-'));
    vi.stubEnv('FILES_ROOT', root);
    feedback.create.mockReset().mockResolvedValue({});
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  });

  it('speichert Feedback und Screenshot unter uploads/feedback', async () => {
    const response = await pointOutHandlers('user-1').feedback(feedbackRequest({ screenshot_base64: PNG }));
    expect(response.status).toBe(201);

    const { data } = feedback.create.mock.calls[0][0];
    expect(data).toMatchObject({
      message: 'Knopf reagiert nicht',
      page: 'Aufträge',
      url: 'http://localhost:3000/app/orders/abc',
      category: 'bug',
      createdById: 'user-1',
      screenshotPath: `uploads/feedback/${data.id}.png`,
      metadata: { steps: [{ label: 'Speichern', kind: 'click' }] },
    });
    const saved = await readFile(path.join(root, 'uploads', 'feedback', `${data.id}.png`));
    expect(saved.subarray(1, 4).toString()).toBe('PNG');
  });

  it('raeumt den Screenshot weg, wenn die Datenbank nicht speichert', async () => {
    feedback.create.mockRejectedValueOnce(new Error('db down'));
    const response = await pointOutHandlers('user-1').feedback(feedbackRequest({ screenshot_base64: PNG }));
    expect(response.status).toBe(503);
    const id = feedback.create.mock.calls[0][0].data.id;
    await expect(readFile(path.join(root, 'uploads', 'feedback', `${id}.png`))).rejects.toThrow();
  });

  it('begrenzt Feedback je Person', async () => {
    const handlers = pointOutHandlers('user-limit');
    for (let i = 0; i < 30; i++) expect((await handlers.feedback(feedbackRequest({}))).status).toBe(201);
    expect((await handlers.feedback(feedbackRequest({}))).status).toBe(429);
    expect((await pointOutHandlers('user-other').feedback(feedbackRequest({}))).status).toBe(201);
  });
});
