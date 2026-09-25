export function createSocket() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  const handlers = {};

  const opened = new Promise((resolve) => ws.addEventListener('open', resolve));

  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    (handlers[msg.type] || []).forEach((fn) => fn(msg));
  });

  function send(type, payload = {}) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ...payload, type }));
  }

  function on(type, fn) {
    (handlers[type] ||= []).push(fn);
  }

  // Joining is separate so handlers can be registered first
  async function join(room) {
    await opened;
    send('join', { room });
  }

  return { send, on, join };
}