// ─── Aria Browser Caller — Twilio Voice SDK v2 ───────────────────────────────
let device = null;
let activeCall = null;
let timerInterval = null;
let callStartTime = null;

// ─── Init on page load ────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initTwilio();
});

async function initTwilio() {
  setStatus('Loading SDK...', false);
  try {
    const res = await fetch('/api/token');
    const data = await res.json();
    console.log('Token response:', data);
    const token = data.token;
    if (!token) throw new Error('No token received from server');

    console.log('Creating Device with token...');
    // Browser bundle exposes Twilio.Device globally
    device = new Twilio.Device(token, {
      codecPreferences: ['opus', 'pcmu'],
      logLevel: 1,
    });
    console.log('Device created:', device);

    device.on('registered', () => {
      setStatus('Ready — click Start Call', true);
      const btn = document.getElementById('call-btn');
      btn.disabled = false;
      btn.classList.remove('btn-disabled');
      log('✅ SDK ready', 'system');
    });

    device.on('error', (twilioError) => {
      setStatus('Error: ' + twilioError.message, false);
      log('❌ ' + twilioError.message, 'error');
    });

    device.on('incoming', (call) => {
      call.accept();
    });

    // Register the device
    await device.register();

  } catch (err) {
    console.error('initTwilio error:', err);
    setStatus('Failed to initialize', false);
    log('❌ ' + err.message, 'error');
  }
}

// ─── Toggle Call ──────────────────────────────────────────────────────────────
function toggleCall() {
  if (activeCall) {
    endCall();
  } else {
    startCall();
  }
}

async function startCall() {
  if (!device) return;
  log('📞 Connecting to Aria...', 'system');
  setStatus('Connecting...', false);

  try {
    const call = await device.connect({
      params: { To: 'agent' },
    });

    activeCall = call;

    call.on('ringing', () => {
      setStatus('Ringing...', false);
      log('🔔 Ringing...', 'system');
    });

    call.on('accept', () => {
      onCallConnected();
    });

    call.on('disconnect', () => {
      onCallEnded();
    });

    call.on('cancel', () => {
      onCallEnded();
    });

    call.on('error', (err) => {
      log('❌ Call error: ' + err.message, 'error');
      onCallEnded();
    });

  } catch (err) {
    setStatus('Ready — click Start Call', true);
    log('❌ Could not connect: ' + err.message, 'error');
  }
}

function endCall() {
  if (activeCall) {
    activeCall.disconnect();
    activeCall = null;
  }
}

// ─── Call Events ──────────────────────────────────────────────────────────────
function onCallConnected() {
  setStatus('Connected — speak now', true);
  log('✅ Connected to Aria — speak now!', 'system');

  const btn = document.getElementById('call-btn');
  btn.classList.add('call-btn-active');
  document.getElementById('call-btn-text').textContent = 'End Call';
  document.getElementById('call-icon').innerHTML = `
    <line x1="1" y1="1" x2="23" y2="23"/>
    <path d="M16.5 19.5c-1.5-1-3-1.5-4.5-1.5s-3 .5-4.5 1.5M5 12.5A12 12 0 0 1 12 10a12 12 0 0 1 7 2.5"/>
  `;

  document.getElementById('mic-bar').style.display = 'flex';
  document.getElementById('call-timer').style.display = 'flex';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('log-messages').style.display = 'flex';

  callStartTime = Date.now();
  timerInterval = setInterval(updateTimer, 1000);
}

function onCallEnded() {
  activeCall = null;
  clearInterval(timerInterval);

  setStatus('Ready — click Start Call', true);
  log('📵 Call ended', 'system');

  const btn = document.getElementById('call-btn');
  btn.classList.remove('call-btn-active');
  document.getElementById('call-btn-text').textContent = 'Start Call';
  document.getElementById('call-icon').innerHTML = `
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.42C1.6 2.33 2.43 1.43 3.52 1.43h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.08 6.08l1.65-1.65a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  `;

  document.getElementById('mic-bar').style.display = 'none';
  document.getElementById('call-timer').style.display = 'none';
}

// ─── Timer ────────────────────────────────────────────────────────────────────
function updateTimer() {
  const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  document.getElementById('timer-text').textContent = `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setStatus(text, ready) {
  document.getElementById('agent-status').textContent = text;
  const dot = document.getElementById('sdk-dot');
  document.getElementById('sdk-status-text').textContent = text;
  if (ready) {
    dot.style.background = 'var(--green)';
    dot.style.boxShadow = '0 0 8px var(--green)';
    dot.style.animation = 'pulse 2s infinite';
  } else {
    dot.style.background = 'var(--orange)';
    dot.style.boxShadow = '0 0 8px var(--orange)';
    dot.style.animation = 'pulse 1s infinite';
  }
}

function log(msg, type = 'system') {
  const container = document.getElementById('log-messages');
  const el = document.createElement('div');
  el.style.cssText = `
    padding: 8px 12px; border-radius: 8px; font-size: 0.85rem;
    background: ${type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)'};
    border: 1px solid ${type === 'error' ? 'rgba(239,68,68,0.2)' : 'var(--border)'};
    color: ${type === 'error' ? 'var(--red)' : 'var(--text-secondary)'};
  `;
  el.textContent = msg;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}
