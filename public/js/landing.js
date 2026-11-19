// No 0/O or 1/I so codes are easy to read out loud
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode(len = 4) {
  let code = '';
  for (let i = 0; i < len; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

document.getElementById('create').addEventListener('click', () => {
  location.href = `/room/${makeCode()}`;
});

document.getElementById('join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = document.getElementById('code').value.trim().toUpperCase();
  if (code) location.href = `/room/${code}`;
});

document.getElementById('watch-create').addEventListener('click', () => {
  location.href = `/watch/${makeCode()}`;
});

document.getElementById('watch-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = document.getElementById('watch-code').value.trim().toUpperCase();
  if (code) location.href = `/watch/${code}`;
});

// remember the name for the booth and watch rooms
const nameInput = document.getElementById('your-name');
try { nameInput.value = localStorage.getItem('booth-name') || ''; } catch {}
nameInput.addEventListener('input', () => {
  const n = nameInput.value.trim().slice(0, 16);
  try { if (n) localStorage.setItem('booth-name', n); } catch {}
});

