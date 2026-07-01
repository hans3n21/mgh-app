/**
 * Smoke tests for the MGH app.
 * Checks public endpoints and verifies protected APIs stay protected.
 */

async function runSmokeTests() {
  console.log('Running smoke tests...');

  const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
  let passed = 0;
  let failed = 0;

  async function test(name: string, url: string, expectedStatus = 200, init?: RequestInit) {
    try {
      const response = await fetch(`${baseUrl}${url}`, init);

      if (response.status === expectedStatus) {
        console.log(`PASS ${name}: ${response.status}`);
        passed++;
      } else {
        console.log(`FAIL ${name}: Expected ${expectedStatus}, got ${response.status}`);
        failed++;
      }
    } catch (error) {
      console.log(`FAIL ${name}: ${error}`);
      failed++;
    }
  }

  await test('Health API', '/api/health');
  await test('NextAuth providers', '/api/auth/providers');
  await test('NextAuth CSRF', '/api/auth/csrf');

  // Protected API endpoints should reject anonymous requests.
  await test('Orders API protected', '/api/orders', 401);
  await test('Customers API protected', '/api/customers', 401);
  await test('Mail unread count protected', '/api/mails/unread-count', 401);
  await test('Mail detail protected', '/api/mails/test-id', 401);
  await test('Mail thread protected', '/api/mails/thread/test-thread', 401);
  await test('Mail mark-read protected', '/api/mails/test-id/mark-read', 401, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isRead: true }),
  });
  await test('Inbox assign-order protected', '/api/inbox/assign-order', 401, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId: 'test-id', orderId: 'ORD-2026-001' }),
  });
  await test('Inbox update-meta protected', '/api/inbox/update-meta', 401, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageIds: ['test-id'], meta: { read: true } }),
  });
  await test('Datasheet create protected', '/api/datasheets/create', 401, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mailId: 'test-id', overrides: {} }),
  });

  console.log('\nTest results:');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

  if (failed > 0) {
    console.log('\nSome tests failed. Make sure the server is running with `npm run dev`.');
    process.exit(1);
  } else {
    console.log('\nAll smoke tests passed.');
  }
}

runSmokeTests().catch((error) => {
  console.error('Smoke tests failed:', error);
  process.exit(1);
});
