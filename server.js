
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const Database = require('better-sqlite3');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// =====================================
// VISITOR ANALYTICS - SQLITE DATABASE
// =====================================

const dataDir = process.env.DB_PATH
  ? path.dirname(process.env.DB_PATH)
  : path.join(__dirname, 'data');

fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH ||
  path.join(dataDir, 'booth-stats.sqlite');

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS visitors (
    visitor_id TEXT PRIMARY KEY,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log('SQLite visitor database connected.');

// =====================================
// VISITOR API ROUTES
// =====================================

// Register a unique visitor
app.post('/api/visitors/register', (req, res) => {
  try {
    const { visitorId } = req.body;

    if (
      typeof visitorId !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(visitorId)
    ) {
      return res.status(400).json({
        error: 'Invalid visitor ID'
      });
    }

    // Insert only if visitor doesn't already exist
    db.prepare(`
      INSERT OR IGNORE INTO visitors (visitor_id)
      VALUES (?)
    `).run(visitorId);

    // Get total unique visitors
    const result = db.prepare(`
      SELECT COUNT(*) AS total FROM visitors
    `).get();

    res.json({
      success: true,
      uniqueVisitors: result.total
    });

  } catch (error) {
    console.error('Visitor registration error:', error);

    res.status(500).json({
      error: 'Registration failed'
    });
  }
});

// Get total unique visitors
app.get('/api/visitors/count', (req, res) => {
  try {
    const result = db.prepare(`
      SELECT COUNT(*) AS total FROM visitors
    `).get();

    res.json({
      uniqueVisitors: result.total
    });

  } catch (error) {
    console.error('Visitor count error:', error);

    res.status(500).json({
      error: 'Could not fetch visitor count'
    });
  }
});

// =====================================
// STATIC FILES
// =====================================

app.use(express.static(path.join(__dirname, 'public')));

// =====================================
// PAGE ROUTES
// =====================================

// Clean URL: /room/ABCD
app.get('/room/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'booth.html'));
});

// Solo booth
app.get('/solo', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'solo.html'));
});

// Watch together
app.get('/watch/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watch.html'));
});

// =====================================
// WEBSOCKET ROOM MANAGEMENT
// =====================================

const rooms = new Map(); // code -> Set of sockets (max 2)

const RELAY_TYPES = new Set([
  'offer',
  'answer',
  'ice',
  'snap-start',
  'reaction',
  'chat',
  'typing',
  'share-start',
  'share-ready',
  'share-busy',
  'share-stop',
  'hello',
]);

function send(ws, type, payload = {}) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ ...payload, type }));
  }
}

wss.on('connection', (ws) => {
  ws.room = null;

  ws.on('message', (raw) => {
    let msg;

    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'join') {
      const code = String(msg.room || '')
        .toUpperCase()
        .slice(0, 8);

      if (!code) return;

      const peers = rooms.get(code) || new Set();

      if (peers.size >= 2) {
        return send(ws, 'room-full');
      }

      peers.add(ws);
      rooms.set(code, peers);
      ws.room = code;

      send(ws, 'joined', { count: peers.size });

      // Notify existing peer
      if (peers.size === 2) {
        for (const p of peers) {
          if (p !== ws) send(p, 'peer-joined');
        }
      }

      return;
    }

    // Relay messages to other people in the room
    if (!ws.room || !RELAY_TYPES.has(msg.type)) return;

    if (msg.type === 'chat') {
      msg.text = String(msg.text || '')
        .trim()
        .slice(0, 500);

      if (!msg.text) return;

      msg.name = String(msg.name || '')
        .trim()
        .slice(0, 16);
    }

    if (msg.type === 'hello') {
      msg.name = String(msg.name || '')
        .trim()
        .slice(0, 16);
    }

    if (msg.type === 'reaction') {
      msg.emoji = String(msg.emoji || '').slice(0, 8);
    }

    for (const p of rooms.get(ws.room) || []) {
      if (p !== ws) send(p, msg.type, msg);
    }
  });

  ws.on('close', () => {
    if (!ws.room) return;

    const peers = rooms.get(ws.room);

    if (!peers) return;

    peers.delete(ws);

    for (const p of peers) {
      send(p, 'peer-left');
    }

    // Empty rooms self-destruct
    if (peers.size === 0) {
      rooms.delete(ws.room);
    }
  });
});

// =====================================
// START SERVER
// =====================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Booth running on http://localhost:${PORT}`);
});
