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

async function trackVisitor() {
  const counter = document.getElementById('visitor-count');

  if (!counter) return;

  try {
    let visitorId = localStorage.getItem('booth-visitor-id');

    if (!visitorId) {
      visitorId = crypto.randomUUID();
      localStorage.setItem('booth-visitor-id', visitorId);
    }

    const response = await fetch('/api/visitors/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ visitorId })
    });

    if (!response.ok) {
      throw new Error('Visitor registration failed');
    }

    const data = await response.json();

    counter.textContent = data.uniqueVisitors.toLocaleString();

  } catch (error) {
    console.error('Visitor tracking error:', error);
    counter.textContent = '--';
  }
}

trackVisitor();