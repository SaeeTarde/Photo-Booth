const EMOJIS = ['😀','😂','🥹','😍','🥰','😎','🤩','😜','😭','😅','🥳','🤔','😴','😮','🙌','👏',
                '👍','👎','🙏','💪','❤️','💖','💔','🔥','✨','🎉','🌸','🐰','📸','🎞️','☕','🍕'];
const REACTIONS = ['❤️', '😂', '🔥', '👏', '😍', '🎉'];
const SHORTCUTS = { ':)': '🙂', ':D': '😄', ':(': '🙁', ':P': '😛', ';)': '😉', '<3': '❤️', ':o': '😮' };
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}[\uFE0F\u200D]*\s*){1,3}$/u;

export function initChat(socket, { floatLocal = 'local', floatRemote = 'remote' } = {}) {
  const $ = (id) => document.getElementById(id);
  const panel = $('chat'), toggle = $('chat-toggle'), badge = $('chat-badge');
  const list = $('chat-messages'), input = $('chat-input'), typingEl = $('chat-typing');
  const picker = $('emoji-picker'), reactBar = $('react-bar');

  let open = false, unread = 0, partnerHere = false;
  let typingHideTimer = null, lastTypingSent = 0;

  const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const scrollDown = () => (list.scrollTop = list.scrollHeight);

  // ---------- rendering (textContent only, so no HTML injection) ----------
  function addMessage(text, mine) {
    const wrap = document.createElement('div');
    wrap.className = `msg ${mine ? 'mine' : 'theirs'}`;

    const bubble = document.createElement('div');
    bubble.className = 'bubble' + (EMOJI_ONLY.test(text) ? ' emoji-only' : '');
    bubble.textContent = text;

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = clock();

    wrap.append(bubble, time);
    list.appendChild(wrap);
    scrollDown();
  }

  function addSystem(text) {
    const el = document.createElement('div');
    el.className = 'sys';
    el.textContent = text;
    list.appendChild(el);
    scrollDown();
  }

  function updateBadge() {
    badge.hidden = unread === 0;
    badge.textContent = unread > 9 ? '9+' : unread;
  }

  function setOpen(value) {
    open = value;
    panel.hidden = !open;
    toggle.hidden = open;
    if (open) {
      unread = 0;
      updateBadge();
      scrollDown();
      if (window.innerWidth > 640) input.focus();
    }
  }

  // ---------- floating reactions ----------
  function floatEmoji(emoji, videoId) {
    const wrap = $(videoId).parentElement;
    const el = document.createElement('span');
    el.className = 'float-emoji';
    el.textContent = emoji;
    el.style.marginLeft = `${Math.round(Math.random() * 80 - 40)}px`;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  function sendReaction(emoji) {
    floatEmoji(emoji, floatLocal);
    socket.send('reaction', { emoji });
  }

  // ---------- sending ----------
  function sendMessage() {
    let text = input.value.trim();
    if (!text) return;
    if (!partnerHere) return addSystem('Waiting for your partner to join…');

    text = text.split(' ').map((w) => SHORTCUTS[w] || w).join(' ');
    socket.send('chat', { text });
    addMessage(text, true);
    input.value = '';
    lastTypingSent = 0;
  }

  // ---------- build emoji picker + reaction bar ----------
  EMOJIS.forEach((e) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = e;
    b.addEventListener('click', () => {
      input.setRangeText(e, input.selectionStart, input.selectionEnd, 'end');
      input.focus();
    });
    picker.appendChild(b);
  });

  REACTIONS.forEach((e) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = e;
    b.addEventListener('click', () => sendReaction(e));
    reactBar.appendChild(b);
  });

  // ---------- UI events ----------
  toggle.addEventListener('click', () => setOpen(true));
  $('chat-close').addEventListener('click', () => setOpen(false));
  $('chat-send').addEventListener('click', sendMessage);
  $('emoji-btn').addEventListener('click', () => (picker.hidden = !picker.hidden));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
  });

  input.addEventListener('input', () => {
    const now = Date.now();
    if (partnerHere && now - lastTypingSent > 1500) {
      lastTypingSent = now;
      socket.send('typing');
    }
  });

  // ---------- incoming ----------
  socket.on('chat', ({ text }) => {
    typingEl.hidden = true;
    addMessage(String(text), false);
    if (!open) {
      unread++;
      updateBadge();
      toggle.classList.remove('pulse');
      void toggle.offsetWidth; // restart the animation
      toggle.classList.add('pulse');
    }
  });

  socket.on('typing', () => {
    typingEl.hidden = false;
    clearTimeout(typingHideTimer);
    typingHideTimer = setTimeout(() => (typingEl.hidden = true), 2500);
  });

  socket.on('reaction', ({ emoji }) => floatEmoji(String(emoji), floatRemote));

  socket.on('joined', ({ count }) => {
    partnerHere = count === 2;
    addSystem(partnerHere ? 'Your partner is here 👋' : 'Waiting for your partner…');
  });
  socket.on('peer-joined', () => { partnerHere = true; addSystem('Partner joined 🎉'); });
  socket.on('peer-left', () => { partnerHere = false; typingEl.hidden = true; addSystem('Partner left'); });

  // open by default on desktop, closed on phones
  setOpen(window.innerWidth > 640);
}