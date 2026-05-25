// server/config/socket.js
// ─────────────────────────────────────────────────────────────────────────────
// SOCKET.IO — The Real-Time Backbone
//
// HOW THE HANDSHAKE WORKS:
// 1. Client connects:  io("http://localhost:5000", { auth: { userId } })
// 2. Server receives the `connection` event and reads `socket.handshake.auth`
// 3. We map `userId → socket.id` in an in-memory Map so we can later
//    say "send this notification to User B" without broadcasting to everyone.
//
// WHY MAP USER IDs TO SOCKETS?
// Socket.IO assigns a random `socket.id` each time someone connects.
// But our app thinks in terms of MongoDB User IDs. The `onlineUsers` Map
// bridges that gap — it lets us say `io.to(socketId).emit(...)` using a
// userId we pulled from the database.
//
// HOW SHARING IMPROVES TEAM INTERACTION:
// Without collaboration, Donezu is a personal to-do list. With sharing,
// it becomes a team coordination tool. When Alice shares a task with Bob:
//   • Bob gets an INSTANT notification (Socket.IO push)
//   • Bob can update the task's status (e.g., "In Progress" → "Completed")
//   • Alice gets notified in real-time that Bob finished
// This feedback loop makes the app "unignorable" — users stay engaged
// because they see activity happening live, not on their next page refresh.
// ─────────────────────────────────────────────────────────────────────────────

const { Server } = require('socket.io');

// In-memory map: userId (string) → socketId (string)
// This is fast O(1) lookup. In production with multiple server instances,
// you'd swap this for Redis-backed adapter, but for single-server this is perfect.
const onlineUsers = new Map();

let io; // Singleton reference to the Socket.IO server instance

/**
 * Initialize Socket.IO on the HTTP server.
 *
 * @param {http.Server} httpServer - The raw Node.js HTTP server that Express created
 * @returns {Server} The Socket.IO server instance
 */
function initSocket(httpServer) {
  io = new Server(httpServer, {
    // CORS config mirrors your Express CORS settings
    cors: {
      origin: process.env.ALLOWED_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true,
    },

    // If a client doesn't respond to a ping within 20s, consider them gone
    pingTimeout: 20000,

    // Ping clients every 25 seconds to detect zombie connections early
    pingInterval: 25000,
  });

  // ─── Connection Handler ─────────────────────────────────────────────────
  io.on('connection', (socket) => {
    // The client sends their MongoDB userId during the handshake:
    //   io("http://...", { auth: { userId: "605c72ef..." } })
    const userId = socket.handshake.auth.userId;

    if (userId) {
      // Register: "this userId is live on this socket"
      onlineUsers.set(userId, socket.id);
      console.log(`🟢 User ${userId} connected (socket: ${socket.id})`);
    } else {
      console.warn(`⚠️  Socket ${socket.id} connected WITHOUT a userId`);
    }

    // ─── Disconnection Handler ──────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      if (userId) {
        onlineUsers.delete(userId);
        console.log(`🔴 User ${userId} disconnected (reason: ${reason})`);
      }
    });

    // ─── Connection Error Handler ───────────────────────────────────────
    socket.on('error', (err) => {
      console.error(`❌ Socket error for ${userId || socket.id}: ${err.message}`);
    });
  });

  console.log('⚡ Socket.IO initialized and listening for connections');
  return io;
}

/**
 * Get the Socket.IO server instance (must call initSocket first).
 * Controllers import this to emit real-time events.
 */
function getIO() {
  if (!io) {
    throw new Error(
      'Socket.IO has not been initialized — call initSocket(httpServer) first'
    );
  }
  return io;
}

/**
 * Get the socket ID for a given user, or null if they're offline.
 * @param {string} userId - MongoDB User ObjectId as a string
 * @returns {string|null}
 */
function getSocketId(userId) {
  return onlineUsers.get(userId) || null;
}

module.exports = { initSocket, getIO, getSocketId, onlineUsers };
