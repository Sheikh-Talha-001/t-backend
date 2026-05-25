// server/index.js
// ═══════════════════════════════════════════════════════════════════════════════
// DONEZU — Task Management Server (with Real-Time Collaboration)
// ═══════════════════════════════════════════════════════════════════════════════
//
// WHAT'S NEW IN THIS VERSION:
//
// 1. SOCKET.IO INTEGRATION
//    Previously, the app was pure HTTP — clients had to refresh or poll to see
//    updates. Now, when Alice shares a task with Bob, Bob's browser instantly
//    receives a "notification" event via WebSocket. No refresh needed.
//
// 2. HTTP SERVER WRAPPING
//    Express normally creates an HTTP server internally via app.listen().
//    But Socket.IO needs access to the raw HTTP server to "upgrade" regular
//    HTTP connections into persistent WebSocket connections. So we:
//      a) Create the HTTP server manually: http.createServer(app)
//      b) Pass it to Socket.IO:            initSocket(httpServer)
//      c) Start listening on the HTTP server, not the Express app
//
// 3. NEW ROUTES
//    • /api/tasks/shared          → GET tasks shared with you
//    • /api/tasks/:id/share       → PUT share a task with someone
//    • /api/notifications         → GET your notification history
//    • /api/notifications/:id/read → PUT mark a notification as read
//    • /api/notifications/read-all → PUT mark all as read
//    • /api/analytics/overview    → GET owner-only task completion summary
//    • /api/analytics/trends      → GET chart-ready completion/overdue trends
//
// WHY THIS COLLABORATION LAYER MAKES THE APP "UNIGNORABLE":
// Without it, Donezu is a personal sticky note. With it, Donezu becomes a
// team coordination tool where actions have immediate, visible consequences.
// When you mark a task as "Completed," your teammate SEES it happen in
// real-time. That instant feedback loop creates accountability and engagement
// that static to-do apps simply can't match. Teams that see each other's
// progress are teams that ship faster.
// ═══════════════════════════════════════════════════════════════════════════════

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express    = require('express');
const http       = require('http');  // NEW: Node's built-in HTTP module
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const swaggerUi  = require('swagger-ui-express');
const cors       = require('cors');

const connectDB           = require('./config/db');
const swaggerSpec         = require('./config/swaggerConfig');
const { initSocket }      = require('./config/socket');     // NEW: Socket.IO
const authRoutes          = require('./routes/auth');
const userRoutes          = require('./routes/userRoutes');
const taskRoutes          = require('./routes/taskRoutes');
const notificationRoutes  = require('./routes/notificationRoutes'); // NEW
const feedbackRoutes      = require('./routes/feedbackRoutes');
const analyticsRoutes     = require('./routes/analyticsRoutes');
const { errorLogger }     = require('./middleware/errorLogger');

// ─── Create Express App ───────────────────────────────────────────────────────
const app = express();

// Trust proxy (required if the server is run behind a proxy like Nginx, Render, Heroku, or local dev proxies)
app.set('trust proxy', 1);

// ─── Create HTTP Server ───────────────────────────────────────────────────────
// WHY: Socket.IO needs a raw HTTP server to perform the "protocol upgrade"
// from HTTP to WebSocket. This is the handshake process:
//   1. Client sends a regular HTTP request to the server
//   2. Both sides agree to "upgrade" the connection to WebSocket
//   3. The connection stays open — now messages flow both ways instantly
// If we just used app.listen(), Express would create the HTTP server internally
// and we wouldn't have a reference to pass to Socket.IO.
const httpServer = http.createServer(app);

// ─── Initialize Socket.IO ─────────────────────────────────────────────────────
// This attaches Socket.IO to our HTTP server. From this point forward:
//   • Any controller can call getIO() to emit events
//   • Any controller can call getSocketId(userId) to check if a user is online
// The socket.js module handles connection/disconnection and maps userIds
// to socketIds so we can send private notifications to specific users.
if (process.env.NODE_ENV !== 'test') {
  initSocket(httpServer);
}

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], // Ensure PATCH is allowed for preferences
  credentials: true,
}));

// ─── Connect to MongoDB ───────────────────────────────────────────────────────
connectDB();

// ─── Security Middleware ──────────────────────────────────────────────────────

// 1. Helmet — sets secure HTTP response headers
app.use(helmet());

// 2. Rate Limiter — 100 requests per 15 minutes per IP (active in all envs)
// Relaxed in development mode (10,000 requests) to prevent false-positives
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 10000 : 100, // limit each IP to 100 requests per window (or 10,000 in dev)
  standardHeaders: true,     // return rate limit info in RateLimit-* headers
  legacyHeaders: false,      // disable X-RateLimit-* legacy headers
  message: {
    message: 'Too many requests from this IP, please try again after 15 minutes.',
  },
});
app.use('/api', globalLimiter);

// 2b. Strict Auth Limiter - 5 attempts per 15 minutes
// Relaxed in development mode (1,000 requests) to prevent false-positives
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 1000 : 5, // 5 attempts in prod, 1000 in dev
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many authentication attempts from this IP, please try again after 15 minutes.',
  },
});
app.use('/api/auth', authLimiter);

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json());

// 3. Mongo Sanitize — strips $ and . from req.body, req.query, req.params
//    to prevent NoSQL injection attacks
app.use(mongoSanitize());

// ─── API Documentation (development + production) ────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'Task Management API Docs',
      swaggerOptions: {
        docExpansion: 'list',
        filter: true,
      },
    })
  );
  console.log(
    `📄 Swagger docs available at http://localhost:${process.env.PORT || 5001}/api-docs`
  );
}

// ─── Request Logger ───────────────────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
// WHY AGGREGATION FOR ANALYTICS:
// A dashboard needs counts, percentages, and grouped trend data. MongoDB's
// aggregation pipeline calculates those stats inside the database, close to the
// indexed data, instead of pulling every task into Node.js and looping manually.
// That keeps analytics fast as the app grows from a few tasks to thousands.
//
// HOW RECHARTS USES THIS DATA:
// Recharts expects plain arrays like [{ label: 'May 13', completed: 3 }].
// The analytics routes return chart-ready arrays, so React can focus on drawing
// the Bento UI instead of reshaping database records on every render.
//
// WHY THIS MAKES DONEZU STAND OUT:
// Recruiters notice engineers who turn raw app activity into product insight.
// Data-driven reporting shows you understand not just CRUD, but how teams make
// decisions from real usage signals.
app.use('/api/auth', authRoutes);                 // Public: register & login
app.use('/api/users', userRoutes);                // Protected: user preferences
app.use('/api/tasks', taskRoutes);                // Protected: CRUD + sharing
app.use('/api/notifications', notificationRoutes); // NEW: notification history
app.use('/api/feedback', feedbackRoutes);          // Protected: feedback submissions
app.use('/api/analytics', analyticsRoutes);        // Protected: owner-only reporting

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route '${req.originalUrl}' not found` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorLogger);

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
if (process.env.NODE_ENV !== 'test') {
  // IMPORTANT: We listen on httpServer, NOT app.listen()
  // This ensures both Express routes AND Socket.IO share the same port.
  // Express handles HTTP requests, Socket.IO handles WebSocket connections,
  // and they coexist peacefully on port 5000.
  httpServer.listen(PORT, () => {
    console.log(`\n🚀 Server is running on port ${PORT}`);
    console.log(`⚡ Socket.IO is ready for real-time connections`);
    console.log(`📄 API Docs: http://localhost:${PORT}/api-docs\n`);
  });
}

// Export both for testing — app for Supertest, httpServer for Socket.IO tests
module.exports = app;
module.exports.httpServer = httpServer;
