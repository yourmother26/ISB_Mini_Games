// audio.js — plays YOUR two looping songs.
//   homepageaudio.mp3  -> plays on the home screen
//   gamesaudio.mp3     -> plays in every game mode
// Put both files in the same folder as index.html. If a file is missing, that screen is just silent.
window.ISB = window.ISB || {};

(() => {
  const FILES = { home: 'homepageaudio.mp3', game: 'gamesaudio.mp3' };
  const tracks = {};
  let want = null, current = null, unlocked = false;
  let muted = ISB.store ? ISB.store.get('muted', false) : false;

  for (const k in FILES) {
    const el = new Audio(FILES[k]);
    el.loop = true;            // loops forever
    el.preload = 'auto';
    el.volume = 0.6;
    el.muted = muted;
    tracks[k] = el;
  }

  function stopCurrent() {
    if (current) tracks[current].pause();
    current = null;
  }

  function switchTo(kind) {
    if (!kind || !unlocked || !tracks[kind]) return;
    if (current === kind && !tracks[kind].paused) return;     // already playing
    stopCurrent();
    current = kind;
    const el = tracks[kind];
    el.currentTime = 0;
    const p = el.play();
    if (p && p.catch) p.catch(() => {});                       // file missing or blocked: stay silent
  }

  // browsers only allow sound after the first tap on the page
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    switchTo(want);
  }
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // silence when you leave the page, come back when you return
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCurrent();
    else if (unlocked) switchTo(want);
  });

  const btn = document.getElementById('muteBtn');
  function setMuted(m) {
    muted = m;
    if (ISB.store) ISB.store.set('muted', m);
    for (const k in tracks) tracks[k].muted = m;
    if (btn) btn.textContent = m ? '🔇' : '🔊';
  }
  if (btn) {
    btn.textContent = muted ? '🔇' : '🔊';
    btn.addEventListener('click', () => setMuted(!muted));
  }

  ISB.audio = {
    play(kind) { want = kind; switchTo(kind); },
    toggleMute() { setMuted(!muted); }
  };
})();
