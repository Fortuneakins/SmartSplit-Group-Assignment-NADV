require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const request = require('supertest');
const app = require('../src/index');

describe('API Gateway - integration (requires all downstream services running)', () => {
  test('GET /health does not require auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  test('POST /api/auth/register is public and proxies to user-service', async () => {
    const email = `gw-${Date.now()}@spu.ac.za`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'password123', fullName: 'Gateway User' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
  });

  test('rejects a protected route with no Authorization header', async () => {
    const res = await request(app).get('/api/groups');
    expect(res.status).toBe(401);
  });

  test('rejects a protected route with a malformed token', async () => {
    const res = await request(app).get('/api/groups').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  test('routes an authenticated request through to user-service', async () => {
    const email = `gw2-${Date.now()}@spu.ac.za`;
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'password123', fullName: 'Gateway User 2' });

    const res = await request(app).get('/api/groups').set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('unauthenticated unknown route is rejected by auth before reaching the 404 handler', async () => {
    // The gateway checks auth before routing, so an unknown path with no token
    // correctly surfaces as 401, not 404 - this is the intended defence-in-depth order.
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(401);
  });

  test('404s for an unknown route once authenticated', async () => {
    const email = `gw3-${Date.now()}@spu.ac.za`;
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'password123', fullName: 'Gateway User 3' });

    const res = await request(app).get('/api/does-not-exist').set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.status).toBe(404);
  });
});
