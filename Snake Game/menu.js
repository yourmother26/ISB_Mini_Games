// menu.js — home screen: nickname, mode cards, play button, instructions, adventure pop-ups
(() => {
  const $ = id => document.getElementById(id);
  const home = $('home'), grid = $('modeGrid'), nameInput = $('nameInput');
  const playBtn = $('playBtn'), bestLine = $('bestLine'), banner = $('banner');
  const modal = $('modal'), overlay = $('overlay');

  let selected = ISB.store.get('mode', 'normal');
  if (!ISB.MODES.some(m => m.id === selected)) selected = 'normal';

  nameInput.value = ISB.store.get('nick', '');
  nameInput.addEventListener('input', () => ISB.store.set('nick', nameInput.value.trim()));

  const ordinal = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const getAdv = () => ISB.store.get('adv', { scene: 1, level: 1, mass: 10 });

  function drawCards() {
    grid.innerHTML = '';
    ISB.MODES.forEach(m => {
      const el = document.createElement('div');
      el.className = 'card' + (m.id === selected ? ' sel' : '') + (m.playable ? '' : ' soon');
      el.innerHTML = '<div class="ic">' + m.icon + '</div><div class="nm">' + m.name + '</div><div class="tg">' + m.tag + '</div>' +
        (m.playable ? '' : '<div class="badge">SOON</div>');
      el.addEventListener('click', () => { selected = m.id; ISB.store.set('mode', selected); drawCards(); refresh(); });
      grid.appendChild(el);
    });
  }

  function refresh() {
    const m = ISB.getMode(selected);
    playBtn.disabled = !m.playable;
    if (m.adventure) {
      const a = getAdv();
      playBtn.textContent = (a.level === 1 && a.scene === 1) ? '▶ START' : '▶ CONTINUE';
      bestLine.textContent = '🗺️ Scene ' + a.scene + ' · ' + (a.level === 10 ? 'King fight' : 'Level ' + a.level + '/10') +
        ' · Size ' + Math.max(0, Math.floor((a.mass - 9) * 10));
    } else if (m.survival) {
      const sv = ISB.store.get('sv', { w: 0, best: 0 });
      playBtn.textContent = '▶ PLAY';
      bestLine.textContent = '🌋 Wins ' + sv.w + ' · Best place ' + (sv.best ? ordinal(sv.best) : '-');
    } else if (m.team) {
      const rec = ISB.store.get('tb', { w: 0, l: 0 });
      playBtn.textContent = '▶ PLAY';
      bestLine.textContent = '⚔️ Team wins ' + rec.w + ' · Losses ' + rec.l;
    } else if (m.timeattack) {
      const ts = ISB.store.get('ta', { level: 1, points: 0 });
      playBtn.textContent = (ts.level === 1 && ts.points === 0) ? '▶ START' : '▶ CONTINUE';
      bestLine.textContent = '⏱️ Level ' + ts.level + ' · Saved points ' + ts.points;
    } else {
      playBtn.textContent = m.playable ? '▶ PLAY' : 'COMING SOON';
      bestLine.textContent = m.playable ? '🏆 Best score: ' + ISB.getBest(m.id) : '';
    }
  }

  function showInfo() {
    const m = ISB.getMode(selected);
    $('modalTitle').textContent = m.icon + ' ' + m.name;
    $('modalList').innerHTML = m.instructions.map(t => '<li>' + t + '</li>').join('');
    modal.classList.remove('hidden');
  }
  $('infoBtn').addEventListener('click', showInfo);
  $('modalClose').addEventListener('click', () => modal.classList.add('hidden'));

  function play(team) {
    const m = ISB.getMode(selected);
    if (!m.playable) return;
    if (m.team && typeof team !== 'number') { pickTeam(); return; }
    const nick = nameInput.value.trim() || 'Player';
    ISB.store.set('nick', nameInput.value.trim());
    banner.classList.add('hidden');
    overlay.classList.add('hidden');
    home.classList.add('hidden');
    ISB.game.start(selected, nick, { team });
  }
  playBtn.addEventListener('click', () => play());
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') play(); });

  // Team Battle: choose blue or red
  function pickTeam() {
    $('ovTitle').textContent = '⚔️ Team Battle';
    $('ovText').textContent = 'Choose your team. Never hurt your team-mates. After 4 minutes the team with the biggest total size wins!';
    const box = $('ovBtns'); box.innerHTML = '';
    [['🔵 Join Blue', 0], ['🔴 Join Red', 1]].forEach(([label, tm]) => {
      const b = document.createElement('button'); b.className = 'main'; b.textContent = label;
      b.addEventListener('click', () => { ISB.store.set('team', tm); play(tm); });
      box.appendChild(b);
    });
    const back = document.createElement('button'); back.textContent = 'Back';
    back.addEventListener('click', () => overlay.classList.add('hidden'));
    box.appendChild(back);
    overlay.classList.remove('hidden');
  }

  function showOverlay(title, text, mainLabel) {
    $('ovTitle').textContent = title;
    $('ovText').textContent = text;
    $('ovBtns').innerHTML = '';
    const b1 = document.createElement('button'); b1.className = 'main'; b1.textContent = mainLabel;
    b1.addEventListener('click', () => play(ISB.store.get('team', 0)));
    const b2 = document.createElement('button'); b2.textContent = 'Menu';
    b2.addEventListener('click', () => { overlay.classList.add('hidden'); home.classList.remove('hidden'); refresh(); });
    $('ovBtns').appendChild(b1); $('ovBtns').appendChild(b2);
    overlay.classList.remove('hidden');
  }

  // adventure: you cleared a level / beat the King
  ISB.game.onAdv = ({ title, text, label }) => showOverlay(title, text, label || 'Continue ▶');

  ISB.game.onOver = ({ score, isBest, reason, modeId, place, total }) => {
    if (modeId === 'survival' && reason !== 'quit') {        // out of the Survival
      showOverlay('☠️ You are out!', 'You came ' + ordinal(place || total) + ' of ' + total + '. Better luck next time!', 'Play again ↻');
      return;
    }
    if (modeId === 'timeattack' && reason !== 'quit') {      // hit the wall: retry
      showOverlay('💥 You hit the wall!', 'Your saved points are safe. Try again!', 'Retry ↻');
      return;
    }
    if (modeId === 'adventure' && reason !== 'quit') {      // eliminated: retry the same level
      const a = getAdv();
      showOverlay('💥 Eliminated!', (a.level === 10 ? 'The King got you. ' : 'Level ' + a.level + '/10. ') +
        'Your saved size is safe. Try again!', 'Retry ↻');
      return;
    }
    banner.className = isBest ? 'good' : '';
    banner.textContent = (reason === 'quit' ? '👋 You left the game. ' : modeId === 'foodchain' ? '🦈 You were eaten! ' : '💥 You crashed! ') +
      'Score: ' + score + (isBest ? '  🏆 New best!' : '');
    home.classList.remove('hidden');
    refresh();
  };

  // music: the home song plays while the home screen is showing, the game song plays in every game
  if (ISB.audio) {
    new MutationObserver(() => ISB.audio.play(home.classList.contains('hidden') ? 'game' : 'home'))
      .observe(home, { attributes: true, attributeFilter: ['class'] });
    ISB.audio.play('home');
  }

  drawCards();
  refresh();
})();
