const KEY = 'booth-name';
const clean = (s, fallback) => String(s || '').trim().slice(0, 16) || fallback;

// My name: saved from the homepage, or asked once if I came through an invite link
export function getMyName() {
  let n = '';
  try { n = localStorage.getItem(KEY) || ''; } catch {}
  n = clean(n, '');
  if (!n) {
    n = clean(prompt('What should we call you? (your partner will see this)'), '');
    if (n) { try { localStorage.setItem(KEY, n); } catch {} }
  }
  return n || 'Guest';
}

// Swaps names with the partner as soon as both are in the room
export function initNames(socket) {
  const listeners = [];
  const state = {
    me: getMyName(),
    partner: 'Partner',
    onChange: (fn) => listeners.push(fn),
  };
  const hello = () => socket.send('hello', { name: state.me });

  socket.on('hello', ({ name }) => {
    state.partner = clean(name, 'Partner');
    listeners.forEach((fn) => fn(state.partner));
  });
  socket.on('joined', ({ count }) => { if (count === 2) hello(); }); // I'm the newcomer
  socket.on('peer-joined', hello);                                    // someone joined me
  return state;
}