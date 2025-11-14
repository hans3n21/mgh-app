/**
 * Smoke Tests für MGH App
 * Testet grundlegende API-Endpunkte
 */

async function runSmokeTests() {
  console.log('🧪 Running smoke tests...');
  
  const baseUrl = 'http://localhost:3000';
  let passed = 0;
  let failed = 0;

  async function test(name: string, url: string, expectedStatus = 200) {
    try {
      const response = await fetch(`${baseUrl}${url}`);
      
      if (response.status === expectedStatus) {
        console.log(`✅ ${name}: ${response.status}`);
        passed++;
      } else {
        console.log(`❌ ${name}: Expected ${expectedStatus}, got ${response.status}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${name}: ${error}`);
      failed++;
    }
  }

  // Test API endpoints
  await test('Orders API', '/api/orders');
  await test('Customers API', '/api/customers');
  
  // Test auth endpoints
  await test('NextAuth config', '/api/auth/providers');
  
  console.log('\n📊 Test Results:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. Make sure the server is running with `npm run dev`');
    process.exit(1);
  } else {
    console.log('\n🎉 All smoke tests passed!');
  }
}

runSmokeTests().catch((error) => {
  console.error('❌ Smoke tests failed:', error);
  process.exit(1);
});
