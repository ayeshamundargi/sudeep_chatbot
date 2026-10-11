import http from 'http';
import app from '../src/server.js';
import { config } from '../src/config.js';

let server;
const TEST_PORT = 3199;
const BASE_URL = `http://localhost:${TEST_PORT}`;

function runTest(name, fn) {
  return async () => {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      return true;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    Error: ${err.message}`);
      return false;
    }
  };
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, options);
  let data;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }
  return { status: response.status, headers: response.headers, data };
}

const tests = [
  runTest('GET /api/health returns 200 and healthy status', async () => {
    const res = await request('/api/health');
    if (res.status !== 200) throw new Error(`Expected status 200, got ${res.status}`);
    if (res.data.status !== 'ok') throw new Error(`Expected status 'ok', got ${res.data.status}`);
  }),

  runTest('GET /api/config returns safe metadata without leaking API keys', async () => {
    const res = await request('/api/config');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (res.data.apiKey !== undefined) throw new Error('LEAK DETECTED: API key exposed in /api/config');
    if (!res.data.appName) throw new Error('Missing appName in config');
    if (!res.data.mode) throw new Error('Missing mode in config');
  }),

  runTest('POST /api/chat rejects missing messages with 400', async () => {
    const res = await request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    if (res.data.error?.code !== 'INVALID_PAYLOAD') throw new Error('Expected INVALID_PAYLOAD error code');
  }),

  runTest('POST /api/chat rejects empty messages array with 400', async () => {
    const res = await request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] })
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    if (res.data.error?.code !== 'EMPTY_MESSAGES') throw new Error('Expected EMPTY_MESSAGES code');
  }),

  runTest('POST /api/chat rejects invalid role with 400', async () => {
    const res = await request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'invalid_role', content: 'Hello' }]
      })
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    if (res.data.error?.code !== 'INVALID_ROLE') throw new Error('Expected INVALID_ROLE code');
  }),

  runTest('POST /api/chat rejects invalid temperature with 400', async () => {
    const res = await request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 5.5
      })
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    if (res.data.error?.code !== 'INVALID_TEMPERATURE') throw new Error('Expected INVALID_TEMPERATURE code');
  }),

  runTest('POST /api/title-gen produces clean, truncated title', async () => {
    const res = await request('/api/title-gen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'How do I optimize database queries for PostgreSQL?' })
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!res.data.title || typeof res.data.title !== 'string') throw new Error('Expected valid title string');
    if (res.data.title.length > 50) throw new Error('Title was not appropriately truncated');
  }),

  runTest('POST /api/chat?stream=false returns assistant JSON message', async () => {
    const res = await request('/api/chat?stream=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'What is a closure in JavaScript?' }]
      })
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!res.data.message?.content) throw new Error('Missing assistant content in response');
  }),

  runTest('POST /api/chat?stream=true delivers valid Server-Sent Events stream', async () => {
    const response = await fetch(`${BASE_URL}/api/chat?stream=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Help me debug a programming problem' }]
      })
    });

    if (response.status !== 200) throw new Error(`Expected status 200, got ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream')) {
      throw new Error(`Expected text/event-stream, got ${contentType}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let receivedChunks = 0;
    let sawDone = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      if (text.includes('data:')) receivedChunks++;
      if (text.includes('"done":true')) sawDone = true;
    }

    if (receivedChunks === 0) throw new Error('No SSE chunks received');
    if (!sawDone) throw new Error('Stream did not terminate with done:true');
  }),

  runTest('Server Conversation CRUD operations work correctly', async () => {
    const testConvId = 'test_conv_' + Date.now();
    // 1. Create
    const createRes = await request('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: testConvId,
        title: 'Test Verification Conversation',
        messages: [{ role: 'user', content: 'Test prompt' }]
      })
    });
    if (createRes.status !== 201) throw new Error(`Failed to create conversation: ${createRes.status}`);

    // 2. Read single
    const getRes = await request(`/api/conversations/${testConvId}`);
    if (getRes.status !== 200) throw new Error(`Failed to fetch created conversation: ${getRes.status}`);
    if (getRes.data.title !== 'Test Verification Conversation') throw new Error('Conversation title mismatch');

    // 3. Update
    const putRes = await request(`/api/conversations/${testConvId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Updated Test Title'
      })
    });
    if (putRes.status !== 200) throw new Error(`Failed to update conversation: ${putRes.status}`);

    // 4. Delete
    const delRes = await request(`/api/conversations/${testConvId}`, {
      method: 'DELETE'
    });
    if (delRes.status !== 200) throw new Error(`Failed to delete conversation: ${delRes.status}`);
  }),

  runTest('Static pages (index.html, privacy.html, terms.html, favicon.svg) are served', async () => {
    const indexRes = await request('/');
    if (indexRes.status !== 200) throw new Error(`Failed to serve index.html: ${indexRes.status}`);

    const privRes = await request('/privacy');
    if (privRes.status !== 200) throw new Error(`Failed to serve privacy.html: ${privRes.status}`);

    const termsRes = await request('/terms');
    if (termsRes.status !== 200) throw new Error(`Failed to serve terms.html: ${termsRes.status}`);

    const favRes = await request('/favicon.svg');
    if (favRes.status !== 200) throw new Error(`Failed to serve favicon.svg: ${favRes.status}`);
  })
];

async function main() {
  console.log(`\nStarting ClearMind AI Test Suite on port ${TEST_PORT}...`);
  server = app.listen(TEST_PORT);

  // Allow server to bind
  await new Promise((r) => setTimeout(r, 200));

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const ok = await test();
    if (ok) passed++;
    else failed++;
  }

  server.close();

  console.log(`\n====================================================`);
  console.log(`  Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`====================================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Test execution error:', err);
  if (server) server.close();
  process.exit(1);
});
