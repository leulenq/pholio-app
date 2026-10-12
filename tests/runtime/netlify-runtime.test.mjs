import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const adaptHandler = require('../../netlify/handlers/runtime-adapter.js');
const express = require('express');
const serverless = require('serverless-http');
const context = { requestId: 'runtime-test' };

function endpoint(configure) {
  const app = express();
  configure(app);
  return adaptHandler(serverless(app, { binary: true }));
}

test('preserves API path, repeated query values and request cookies', async () => {
  const handler = endpoint(app => app.get('/api/check', (req, res) => res.json({
    path: req.path, query: req.query, cookie: req.headers.cookie,
  })));
  const result = await handler(new Request('https://app.pholio.studio/api/check?tag=a&tag=b', {
    headers: { cookie: 'test_session=opaque' },
  }), context);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), {
    path: '/api/check', query: { tag: ['a', 'b'] }, cookie: 'test_session=opaque',
  });
});

test('preserves JSON and form request bodies', async () => {
  const handler = endpoint(app => {
    app.use(express.json(), express.urlencoded({ extended: false }));
    app.post('/api/check', (req, res) => res.json(req.body));
  });
  for (const [type, body] of [
    ['application/json', '{"field":"value"}'],
    ['application/x-www-form-urlencoded', 'field=value'],
  ]) {
    const result = await handler(new Request('https://app.pholio.studio/api/check', {
      method: 'POST', headers: { 'content-type': type }, body,
    }), context);
    assert.deepEqual(await result.json(), { field: 'value' });
  }
});

test('preserves exact signed webhook bytes', async () => {
  const body = Buffer.from('{ "event": "synthetic", "value": 1 }\n');
  const handler = endpoint(app => {
    app.post('/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
      assert.deepEqual(req.body, body);
      assert.equal(req.headers['stripe-signature'], 'synthetic-signature');
      res.sendStatus(200);
    });
  });
  const result = await handler(new Request('https://app.pholio.studio/stripe/webhook', {
    method: 'POST', body, headers: {
      'content-type': 'application/json', 'stripe-signature': 'synthetic-signature',
    },
  }), context);
  assert.equal(result.status, 200);
});

test('preserves binary multipart uploads', async () => {
  const body = Buffer.from([0, 255, 128, 13, 10, 45, 45]);
  const handler = endpoint(app => {
    app.post('/upload', express.raw({ type: () => true }), (req, res) => {
      assert.deepEqual(req.body, body);
      res.sendStatus(200);
    });
  });
  const result = await handler(new Request('https://app.pholio.studio/upload', {
    method: 'POST', body, headers: { 'content-type': 'multipart/form-data; boundary=test' },
  }), context);
  assert.equal(result.status, 200);
});

test('preserves binary PDF responses', async () => {
  const pdf = Buffer.from([37, 80, 68, 70, 0, 255, 128]);
  const handler = endpoint(app => app.get('/pdf/test', (req, res) => res.type('pdf').send(pdf)));
  const result = await handler(new Request('https://app.pholio.studio/pdf/test'), context);
  assert.equal(result.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), pdf);
});

test('preserves separate Set-Cookie headers and redirects', async () => {
  const handler = endpoint(app => app.get('/login', (req, res) => {
    res.cookie('session', 'opaque', { httpOnly: true, secure: true });
    res.cookie('choice', 'necessary', { secure: true });
    res.redirect('/dashboard/talent');
  }));
  const result = await handler(new Request('https://app.pholio.studio/login'), context);
  assert.equal(result.status, 302);
  assert.equal(result.headers.get('location'), '/dashboard/talent');
  const cookies = result.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  assert.match(cookies[0], /session=opaque.*HttpOnly.*Secure/);
  assert.match(cookies[1], /choice=necessary.*Secure/);
});

test('preserves job success and failure status without invoking real jobs', async () => {
  const request = new Request('https://app.pholio.studio/.netlify/functions/job');
  const success = await adaptHandler(async () => ({ statusCode: 204 }))(request, context);
  assert.equal(success.status, 204);
  assert.equal(await success.text(), '');
  const failure = await adaptHandler(async () => ({ statusCode: 500, body: 'failed' }))(request, context);
  assert.equal(failure.status, 500);
  assert.equal(await failure.text(), 'failed');
});

test('normalizes Express no-body statuses without losing headers', async () => {
  const handler = endpoint(app => app.get('/empty/:status', (req, res) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.sendStatus(Number(req.params.status));
  }));
  for (const status of [204, 205, 304]) {
    const result = await handler(new Request(`https://app.pholio.studio/empty/${status}`), context);
    assert.equal(result.status, status);
    assert.equal(await result.text(), '');
    assert.equal(result.headers.get('x-robots-tag'), 'noindex, nofollow');
  }
});
