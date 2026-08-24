require('dotenv').config({
  path: require('path').resolve(__dirname, '../../../.env'),
});

const request = require('supertest');
const app = require('../src/index');
const pool = require('../src/db');

// Generate a unique email so integration tests can safely create fresh users.
function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@spu.ac.za`;
}

describe('User/Group Service - integration', () => {
  afterAll(async () => {
    await pool.end();
  });

  describe('POST /api/auth/register', () => {
    test('registers a new user and returns a token', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: uniqueEmail('reg'),
          password: 'password123',
          fullName: 'Test User',
        });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBeDefined();

      // Password hashes must never be included in API responses.
      expect(res.body.user.password_hash).toBeUndefined();
    });

    test('rejects a short password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: uniqueEmail('short'),
          password: '123',
          fullName: 'Test User',
        });

      expect(res.status).toBe(400);
    });

    test('rejects an invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'not-an-email',
          password: 'password123',
          fullName: 'Test User',
        });

      expect(res.status).toBe(400);
    });

    test('rejects a duplicate email', async () => {
      const email = uniqueEmail('dup');

      await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password: 'password123',
          fullName: 'A',
        });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password: 'password123',
          fullName: 'B',
        });

      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/auth/login', () => {
    test('logs in with correct credentials', async () => {
      const email = uniqueEmail('login');

      await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password: 'password123',
          fullName: 'Login User',
        });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email,
          password: 'password123',
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    test('rejects an incorrect password', async () => {
      const email = uniqueEmail('badpw');

      await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password: 'password123',
          fullName: 'X',
        });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email,
          password: 'wrongpassword',
        });

      expect(res.status).toBe(401);
    });

    test('rejects a non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: uniqueEmail('ghost'),
          password: 'password123',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('Groups', () => {
    // Register a test user and return only the credentials needed by the tests.
    async function registerUser(prefix) {
      const email = uniqueEmail(prefix);

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password: 'password123',
          fullName: `${prefix} User`,
        });

      return {
        token: res.body.token,
        id: res.body.user.id,
        email,
      };
    }

    test('a user can create a group and is auto-added as a member', async () => {
      const user = await registerUser('creator');

      const groupRes = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          name: 'Test Group',
        });

      expect(groupRes.status).toBe(201);

      const membersRes = await request(app)
        .get(`/api/groups/${groupRes.body.id}/members`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(membersRes.status).toBe(200);
      expect(membersRes.body).toHaveLength(1);
      expect(membersRes.body[0].id).toBe(user.id);
    });

    test('rejects group creation without a name', async () => {
      const user = await registerUser('noname');

      const res = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${user.token}`)
        .send({});

      expect(res.status).toBe(400);
    });

    test('rejects group creation without auth', async () => {
      const res = await request(app)
        .post('/api/groups')
        .send({
          name: 'No Auth Group',
        });

      expect(res.status).toBe(401);
    });

    test('an existing member can add another registered user by email', async () => {
      const owner = await registerUser('owner');
      const invitee = await registerUser('invitee');

      const groupRes = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          name: 'Invite Group',
        });

      const addRes = await request(app)
        .post(`/api/groups/${groupRes.body.id}/members`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          email: invitee.email,
        });

      expect(addRes.status).toBe(201);
      expect(addRes.body.member.id).toBe(invitee.id);
    });

    test('rejects adding a member who does not exist', async () => {
      const owner = await registerUser('owner2');

      const groupRes = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          name: 'Ghost Invite Group',
        });

      const addRes = await request(app)
        .post(`/api/groups/${groupRes.body.id}/members`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          email: uniqueEmail('doesnotexist'),
        });

      expect(addRes.status).toBe(404);
    });

    test('a non-member cannot add members to a group', async () => {
      const owner = await registerUser('owner3');
      const outsider = await registerUser('outsider');

      const groupRes = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          name: 'Private Group',
        });

      const res = await request(app)
        .post(`/api/groups/${groupRes.body.id}/members`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({
          email: owner.email,
        });

      expect(res.status).toBe(403);
    });

    test('only the group creator can delete a group', async () => {
      const owner = await registerUser('delete-owner');
      const member = await registerUser('delete-member');

      const groupRes = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          name: 'Delete Test Group',
        });

      expect(groupRes.status).toBe(201);

      await request(app)
        .post(`/api/groups/${groupRes.body.id}/members`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          email: member.email,
        });

      // A regular group member must not be allowed to delete the group.
      const memberDelete = await request(app)
        .delete(`/api/groups/${groupRes.body.id}`)
        .set('Authorization', `Bearer ${member.token}`);

      expect(memberDelete.status).toBe(403);

      // The group creator is allowed to delete the group.
      const ownerDelete = await request(app)
        .delete(`/api/groups/${groupRes.body.id}`)
        .set('Authorization', `Bearer ${owner.token}`);

      expect(ownerDelete.status).toBe(200);

      const groupsAfterDelete = await request(app)
        .get('/api/groups')
        .set('Authorization', `Bearer ${owner.token}`);

      expect(groupsAfterDelete.status).toBe(200);
      expect(
        groupsAfterDelete.body.some((group) => group.id === groupRes.body.id)
      ).toBe(false);
    });

    test('a non-creator member can leave a group', async () => {
      const owner = await registerUser('leave-owner');
      const member = await registerUser('leave-member');

      const groupRes = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          name: 'Leave Test Group',
        });

      expect(groupRes.status).toBe(201);

      await request(app)
        .post(`/api/groups/${groupRes.body.id}/members`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          email: member.email,
        });

      const leaveRes = await request(app)
        .delete(`/api/groups/${groupRes.body.id}/leave`)
        .set('Authorization', `Bearer ${member.token}`);

      expect(leaveRes.status).toBe(200);

      const membersAfterLeave = await request(app)
        .get(`/api/groups/${groupRes.body.id}/members`)
        .set('Authorization', `Bearer ${owner.token}`);

      expect(membersAfterLeave.status).toBe(200);
      expect(
        membersAfterLeave.body.some((groupMember) => groupMember.id === member.id)
      ).toBe(false);
    });

    test('the group creator cannot leave their own group', async () => {
      const owner = await registerUser('creator-leave');

      const groupRes = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          name: 'Creator Leave Test Group',
        });

      expect(groupRes.status).toBe(201);

      const leaveRes = await request(app)
        .delete(`/api/groups/${groupRes.body.id}/leave`)
        .set('Authorization', `Bearer ${owner.token}`);

      expect(leaveRes.status).toBe(403);
    });
  });

  describe('GET /health', () => {
    test('reports ok', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });
});