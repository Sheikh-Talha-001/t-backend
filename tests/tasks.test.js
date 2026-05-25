import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// ─── Manual Mocks (must be declared before any app imports) ───────────────────

// 1. Mock the DB so we never attempt a real MongoDB connection during tests
vi.mock('../config/db', () => ({
  __esModule: true,
  default: vi.fn(),
}));

// 2. Mock the User model — the auth middleware calls User.findById().select()
const mockUser1 = { _id: '605c72ef1f4e569988456123', name: 'User One', email: 'user1@test.com' };
const mockUser2 = { _id: '605c72ef1f4e569988456456', name: 'User Two', email: 'user2@test.com' };

const mockFindByIdSelect = vi.fn();
const UserMock = {
  findById: vi.fn(() => ({ select: mockFindByIdSelect })),
};

vi.mock('../models/User', () => ({
  __esModule: true,
  default: UserMock,
  ...UserMock
}));

// 3. Mock the Task model with explicit vi.fn() spies
const mockFind = vi.fn();
const mockCreate = vi.fn();
const TaskMock = {
  find: mockFind,
  create: mockCreate,
};

vi.mock('../models/Task', () => ({
  __esModule: true,
  default: TaskMock,
  ...TaskMock
}));

// 4. Import the app AFTER all mocks are in place
const appModule = await import('../index.js');
// Node.js CJS interop usually puts module.exports in .default
const app = appModule.default || appModule;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const generateToken = (userId) =>
  jwt.sign({ id: userId }, 'testsecret', { expiresIn: '1h' });

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Task API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'testsecret';
  });

  // ─── GET /api/tasks ────────────────────────────────────────────────────────

  describe('GET /api/tasks', () => {
    it('1. should return 200 status and tasks for an authenticated user', async () => {
      // Auth middleware: make User.findById().select() return mock User 1
      mockFindByIdSelect.mockResolvedValue(mockUser1);

      const mockTasks = [
        { _id: '1', title: 'Test Task 1', user: mockUser1._id, status: 'Pending' },
      ];

      // Controller: Task.find(query).lean()
      mockFind.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTasks) });

      const token = generateToken(mockUser1._id);
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTasks);
    });

    it('3. Data Isolation: User A cannot fetch User B tasks', async () => {
      // Auth middleware returns User 2
      mockFindByIdSelect.mockResolvedValue(mockUser2);

      // DB returns empty list (User 2 has no tasks)
      mockFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

      const tokenB = generateToken(mockUser2._id);
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(response.status).toBe(200);

      // The crucial check: find() was called with User 2's ID — not User 1's
      const calledWithQuery = mockFind.mock.calls[0][0];
      expect(calledWithQuery.user.toString()).toBe(mockUser2._id);
      expect(calledWithQuery.user.toString()).not.toBe(mockUser1._id);
    });
  });

  // ─── POST /api/tasks ───────────────────────────────────────────────────────

  describe('POST /api/tasks', () => {
    it('2. The Bouncer Test: should fail with 401 without a valid JWT', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({ title: 'Unauthorized Task' });

      // Auth middleware must block the request before it reaches the controller
      expect(response.status).toBe(401);
      expect(response.body.message).toMatch(/Not authorized/i);

      // The DB should never have been touched
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });
});
