const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

// Clean URL: /room/ABCD serves the booth page
app.get('/room/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'booth.html'));
});

const rooms = new Map(); // code -> Set of sockets (max 2)
const RELAY_TYPES = new Set(['offer', 'answer', 'ice', 'snap-start', 'reaction']);

function send(ws, type, payload = {}) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ ...payload, type }));
}

wss.on('connection', (ws) => {
  ws.room = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      const code = String(msg.room || '').toUpperCase().slice(0, 8);
      if (!code) return;

      const peers = rooms.get(code) || new Set();
      if (peers.size >= 2) return send(ws, 'room-full');

      peers.add(ws);
      rooms.set(code, peers);
      ws.room = code;

      send(ws, 'joined', { count: peers.size });
      // The peer already waiting in the room will create the WebRTC offer
      if (peers.size === 2) {
        for (const p of peers) if (p !== ws) send(p, 'peer-joined');
      }
      return;
    }

    // Everything else is relayed untouched to the other person in the room
    if (!ws.room || !RELAY_TYPES.has(msg.type)) return;
    for (const p of rooms.get(ws.room) || []) {
      if (p !== ws) send(p, msg.type, msg);
    }
  });

  ws.on('close', () => {
    if (!ws.room) return;
    const peers = rooms.get(ws.room);
    if (!peers) return;
    peers.delete(ws);
    for (const p of peers) send(p, 'peer-left');
    if (peers.size === 0) rooms.delete(ws.room); // empty rooms self-destruct
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Booth running on http://localhost:${PORT}`));