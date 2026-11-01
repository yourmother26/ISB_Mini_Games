// game.js — the game engine (snakes, food, bots, drawing, controls)
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const hud = $('hud'), lbEl = $('leaderboard'), boostWrap = $('boostWrap'), boostBtn = $('boost');
  const joy = $('joy'), knob = $('joyKnob'), quitBtn = $('quitBtn'), cdEl = $('countdown');

  let WORLD = 9000, BOT_COUNT = 199, FOOD_TARGET = 6750;   // set by each mode (see modes.js)
  const BASE_SPEED = 175, BOOST_SPEED = 350;
  const MIN_MASS = 10;
  const CELL = 200;

  // A grid that sorts things into boxes, so we only look at things nearby (this keeps 200 snakes fast)
  class Grid {
    constructor(c) { this.c = c; this.m = new Map(); }
    clear() { for (const a of this.m.values()) a.length = 0; }
    key(cx, cy) { return ((Math.max(-63, Math.min(63, cx)) + 64) << 8) | (Math.max(-63, Math.min(63, cy)) + 64); }
    add(x, y, o) {
      const k = this.key(Math.floor(x / this.c), Math.floor(y / this.c));
      let a = this.m.get(k);
      if (!a) { a = []; this.m.set(k, a); }
      a.push(o);
    }
    cell(cx, cy) { return this.m.get(this.key(cx, cy)); }
  }
  const segGrid = new Grid(CELL), foodGrid = new Grid(CELL);

  const PRIORITY = ['Israelbs', 'blacktomi', 'mr.joseph'];
  const OTHERS = ['lordfred', 'dannybtc', 'yahoo-boi', 'the-evil-bot', '7th.okumura', 'nigerian-bot',
    'naija-viper', 'lagos-mamba', 'cyber-koro', 'coil-master', 'abuja-boa', 'zero-day', 'ghost-fang',
    'ninja-noodle', 'pixel-python', 'turbo-tunde', 'byte-cobra', 'wire-wizard', 'crypto-croc', 'glitchy',
    'ogbonge', 'kingsley-x', 'sir-slither', 'mega-mamba', 'dark-noodle', 'blue-fang'];

  const PALS = [
    ['#ff3b3b', '#ff9f1c', '#ffe14d', '#4cd964', '#2ec4ff', '#6a5cff', '#c04dff'],
    ['#ececec', '#d62828', '#ececec', '#1b8a4a'],
    ['#ffd60a', '#ff3b3b'],
    ['#1E90FF', '#00E5FF'],
    ['#00E676', '#0b8a4a'],
    ['#ff8c42', '#ffd166'],
    ['#b57cff', '#6a5cff'],
    ['#ff5fa2', '#ffffff'],
    ['#4DA3FF'], ['#9be34a'], ['#2ee6d6']
  ];
  const TEAM_PALS = [
    [['#1E90FF', '#4DA3FF'], ['#00E5FF', '#0077FF'], ['#4DA3FF', '#1E90FF']],      // blue team
    [['#FF2D55', '#ff7a45'], ['#d62828', '#FF2D55'], ['#ff5fa2', '#FF2D55']]       // red team
  ];
  // SURVIVAL: the safe circle shrinks on a 3 minute clock (each shrink takes 8s; the last 22s squeeze it almost to nothing)
  const ZONE_T = [30, 60, 90, 120, 150], ZONE_R = [2400, 1800, 1300, 900, 550, 300];
  const SURVIVAL_TIME = 180;
  function zoneRadius(t) {
    let r = ZONE_R[0];
    for (let i = 0; i < 5; i++) if (t >= ZONE_T[i]) { const p = clamp((t - ZONE_T[i]) / 8, 0, 1); r = ZONE_R[i] + (ZONE_R[i + 1] - ZONE_R[i]) * p; }
    if (t > 158) r = Math.min(r, 300 - 240 * clamp((t - 158) / 22, 0, 1));
    return r;
  }
  const ordinal = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const FOOD_COLORS = ['#ff4d6d', '#ffe14d', '#4dff88', '#00E5FF', '#b06bff', '#ff8c42', '#4DA3FF'];

  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- helpers ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function angleDiff(to, from) {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  const radiusOf = s => 9 + 51 * (1 - Math.exp(-Math.max(0, s.mass - 10) / 300));   // fatter as it eats, max 60
  const spacingOf = s => radiusOf(s) * 0.55;
  const scoreOf = s => Math.max(0, Math.floor((s.mass - 9) * 10));
  // friends glide over each other: Adventure enemies, and team-mates in Team Battle
  const friend = (a, b) => (mode.adventure && a.isBot && b.isBot) || (mode.team && a.team !== undefined && a.team === b.team);
  function setTeam(sn, team) { sn.team = team; sn.pal = TEAM_PALS[team][(Math.random() * 3) | 0]; sn.iq = 0.9; }

  // FOOD CHAIN helpers
  const TIERS = [{ m: 0, e: '🐟', n: 'Minnow' }, { m: 25, e: '🐠', n: 'Piranha' }, { m: 60, e: '🦈', n: 'Shark' },
                 { m: 150, e: '🐋', n: 'Whale' }, { m: 400, e: '🐉', n: 'Apex' }];
  const tierOf = s => { let r = TIERS[0]; for (const x of TIERS) if (s.mass >= x.m) r = x; return r; };
  const fcSpeed = s => clamp(1.2 - (radiusOf(s) - 9) * 0.0065, 0.85, 1.2);       // small = faster, big = slower
  const ignoreBody = (s, o) => friend(s, o) || (mode.foodchain && o.mass <= s.mass * 1.08);   // only bigger snakes are dangerous
  function nameColor(s) {
    if (s === player) return mode.team ? '#ffe14d' : '#00E5FF';
    if (s.team === 0) return '#7cc4ff';
    if (s.team === 1) return '#ff8aa0';
    if (mode.foodchain && player && player.alive) {
      if (player.mass > s.mass * 1.08) return '#7dffb0';
      if (s.mass > player.mass * 1.08) return '#ff8aa0';
    }
    return 'rgba(255,255,255,.82)';
  }   // new snake = 10 points
  const esc = t => t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- floor: a glowing circuit grid (not a honeycomb) ----------
  const floorPattern = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = '#080b11'; g.fillRect(0, 0, 160, 160);
    g.strokeStyle = 'rgba(30,144,255,.09)'; g.lineWidth = 2;
    for (let i = 0; i < 160; i += 40) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 160); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(160, i); g.stroke();
    }
    g.strokeStyle = 'rgba(30,144,255,.22)'; g.lineWidth = 2;        // main lines
    g.beginPath(); g.moveTo(0, 0.5); g.lineTo(160, 0.5); g.moveTo(0.5, 0); g.lineTo(0.5, 160); g.stroke();
    g.strokeStyle = 'rgba(0,229,255,.16)'; g.lineWidth = 3; g.lineJoin = 'round';  // circuit trace
    g.beginPath(); g.moveTo(40, 120); g.lineTo(80, 120); g.lineTo(80, 80); g.lineTo(120, 80); g.lineTo(120, 40); g.stroke();
    g.fillStyle = 'rgba(0,229,255,.55)';
    for (const [x, y] of [[0, 0], [80, 80], [40, 120], [120, 40]]) { g.beginPath(); g.arc(x, y, 3.5, 0, 6.2832); g.fill(); }
    g.fillStyle = 'rgba(30,144,255,.5)';
    g.fillRect(38, 118, 4, 4); g.fillRect(118, 38, 4, 4);
    return ctx.createPattern(c, 'repeat');
  })();

  // ---------- state ----------
  let mode = ISB.getMode('normal');
  let snakes = [], food = [], particles = [];
  let player = null, playing = false, lastScore = 0, worldGen = 0;
  let inputAngle = 0, wantBoost = false, prevBoost = false, boostStart = MIN_MASS;
  let lbTimer = 0, eaten = 0, reserved = '', adv = null, advDone = false;
  let svT = 0, svRun = false, svCount = 0, svDone = false, svPlace = 0, svWave = 0, zoneR = 99999;   // Survival
  let tbT = 0, tbTeam = 0, crownHolder = null, fcLastTier = null, fcToast = 0;                                                              // Team Battle
  let ta = null, taT = 0, taRun = false, taCount = 0, taDone = false, taGoldT = 0;   // Time Attack
  const cam = { x: 0, y: 0, zoom: 1 };

  function addFood(x, y, v, color, r) {
    food.push({ x, y, v, r: r || 4, c: color || FOOD_COLORS[(Math.random() * FOOD_COLORS.length) | 0], p: Math.random() * 6.28 });
  }
  function spawnAmbientFood() {
    while (food.length < FOOD_TARGET) {
      const a = Math.random() * 6.2832, d = Math.sqrt(Math.random()) * (WORLD - 60);
      addFood(Math.cos(a) * d, Math.sin(a) * d, 0.4, null, rand(3, 5.5));
    }
  }
  function emit(x, y, c, n) {
    for (let i = 0; i < n && particles.length < 350; i++) {
      const a = Math.random() * 6.2832, sp = rand(30, 140);
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, l: rand(0.3, 0.8), m: 0.8, c });
    }
  }

  const PRE = ['Lagos', 'Naija', 'Abuja', 'Kano', 'Zero', 'Neo', 'Cyber', 'Pixel', 'Turbo', 'Ghost', 'Ninja', 'Dark', 'Blue', 'Red', 'Gold', 'Iron', 'Sky', 'Storm', 'Hyper', 'Mega'];
  const SUF = ['Viper', 'Mamba', 'Coil', 'Fang', 'Noodle', 'Python', 'Cobra', 'Boa', 'Slither', 'Worm', 'Racer', 'King', 'Hunter', 'Bytes', 'Glitch'];
  function pickName() {
    const used = new Set(snakes.map(s => s.name.toLowerCase()));
    if (reserved) used.add(reserved);
    const pool = OTHERS.concat(PRIORITY).filter(n => !used.has(n.toLowerCase()));
    if (pool.length) return pool[(Math.random() * pool.length) | 0];
    for (let k = 0; k < 40; k++) {
      const n = PRE[(Math.random() * PRE.length) | 0] + '-' + SUF[(Math.random() * SUF.length) | 0] + (k > 20 ? ((Math.random() * 99) | 0) : '');
      if (!used.has(n.toLowerCase())) return n;
    }
    return 'snake' + ((Math.random() * 9999) | 0);
  }

  const clearAt = (x, y) => {
    for (const o of snakes) {
      if (Math.hypot(o.x - x, o.y - y) < 220) return false;
      for (let i = 0; i < o.segs.length; i += 4) {
        if (Math.abs(o.segs[i].x - x) < 90 && Math.abs(o.segs[i].y - y) < 90) return false;
      }
    }
    return true;
  };

  function newSnake(name, isBot, mass, opts) {
    if (mode.survival && !opts) opts = { hole: true, wait: 3 + Math.random() * 0.4 };
    let x = 0, y = 0;
    if (opts && opts.safe) {            // look at 70 spots and take the emptiest one (never a crowd)
      let best = -1;
      for (let t = 0; t < 70; t++) {
        const a = Math.random() * 6.2832, d = Math.sqrt(Math.random()) * WORLD * 0.7;
        const px = Math.cos(a) * d, py = Math.sin(a) * d;
        let md = 1e9;
        for (const o of snakes) {
          md = Math.min(md, Math.hypot(o.x - px, o.y - py));
          for (let i = 0; i < o.segs.length; i += 4) md = Math.min(md, Math.hypot(o.segs[i].x - px, o.segs[i].y - py));
        }
        if (md > best) { best = md; x = px; y = py; }
      }
    } else {
      for (let t = 0; t < 14; t++) {
        const a = Math.random() * 6.2832, d = Math.sqrt(Math.random()) * WORLD * 0.8;
        x = Math.cos(a) * d; y = Math.sin(a) * d;
        if (clearAt(x, y)) break;
      }
    }
    const angle = Math.random() * 6.2832;
    const s = {
      name, isBot, mass, x, y, angle, target: angle, pal: PALS[(Math.random() * PALS.length) | 0],
      segs: [], boost: false, dropT: 0, alive: true, aiT: Math.random() * 0.4, prey: null, r: 9, blinkT: rand(1.5, 4.5), blink: 0, ex: Math.cos(angle), ey: Math.sin(angle), lookA: angle, lookT: 0, eyeT: Math.random() * 0.3, watch: null
    };
    const sp = spacingOf(s), n = Math.max(4, Math.floor(8 + (mass * 9) / sp));
    let sx = x, sy = y;
    for (let i = 0; i < n; i++) {
      s.segs.push({ x: sx, y: sy });
      const dir = angle + Math.PI + i * (sp / 450);        // body curls gently so big snakes start compact
      sx += Math.cos(dir) * sp; sy += Math.sin(dir) * sp;
    }
    if (mode.survival && isBot) {                 // OG-style brain, but only medium intelligent
      s.iq = rand(0.6, 0.8);
      s.thinkStep = 0.12;                           // quick reactions, medium brain
      s.noBoost = false;
    }
    if (mode.foodchain && isBot) {
      s.iq = rand(0.25, 0.5);
      s.thinkStep = 0.7 - 0.6 * s.iq;
      s.noBoost = s.iq <= 0.5;
    }
    if (opts && opts.hole) {            // comes out of a hole in the ground: body starts hidden inside it
      for (const g of s.segs) { g.x = x; g.y = y; }
      s.hx = x; s.hy = y; s.wait = opts.wait || 0.6; s.wait0 = s.wait; s.emerging = true; s.emT = 0;
    }
    snakes.push(s);
    return s;
  }

  // ADVENTURE: level 1 = weak and dumb ... level 9 = as smart as OG bots, level 10 = the King. Each scene is +10% harder.
  function spawnAdventureEnemies(a) {
    const diff = 1 + 0.1 * (a.scene - 1);
    if (a.level === 10) {
      const k = newSnake('👑 The King', true, 260 * diff, { hole: true, wait: 1.4 });
      k.iq = Math.min(2, 1.5 + 0.05 * (a.scene - 1));
      k.thinkStep = 0.05; k.noBoost = false; k.spd = Math.min(1.5, diff); k.pal = ['#ffd60a', '#ff9f1c'];
      return;
    }
    const n = Math.min(16, 10 + Math.floor((a.scene - 1) / 3));
    const base = (a.level - 1) / 8;                       // 0 = dumb ... 1 = as smart as OG bots
    for (let i = 0; i < n; i++) {
      const s = newSnake(pickName(), true, (10 + (a.level - 1) * 2.5 + rand(0, 4)) * diff);
      s.iq = Math.min(1.2, base * diff);
      s.thinkStep = 0.7 - 0.6 * Math.min(s.iq, 1);        // dumb snakes think slowly
      s.noBoost = s.iq <= 0.5;
      s.spd = Math.min(1.5, diff);
    }
  }

  // ---------- TIME ATTACK ----------
  // goals: 500, 1000, 1700, 2600 ... (each jump is 200 bigger). Time: 2:00 then +15s every level.
  function taGoal(k) { let g = 500, d = 500; for (let i = 2; i <= k; i++) { g += d; d += 200; } return g; }
  const fmtTime = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  function makeTA() {
    const sv = ISB.store.get('ta', { level: 1, points: 0 });
    const k = Math.max(1, sv.level | 0), pts = Math.max(0, sv.points | 0);
    ta = {
      level: k, goal: Math.max(taGoal(k), pts + 100), time: Math.min(1200, 120 + 15 * (k - 1)),
      food: Math.max(200, 700 - 12 * (k - 1)),                // less food on higher levels
      mass: Math.max(MIN_MASS, 9 + pts / 10)                   // your saved points = your size
    };
    taT = ta.time; taRun = false; taCount = 3; taDone = false; taGoldT = 0;
    return ta;
  }
  function ensureGold() {                                      // always 3 gold dots on the map
    let n = 0;
    for (const f of food) if (f.gold && !f.dead) n++;
    for (; n < 3; n++) {
      const a = Math.random() * 6.2832, d = Math.sqrt(Math.random()) * (WORLD - 120);
      food.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, v: 4, r: 9, c: '#ffd60a', p: 0, gold: true });
    }
  }
  function taEnd() { playing = false; wantBoost = false; hud.classList.add('hidden'); cdEl.textContent = ''; }
  function taWin() {
    if (!playing) return;
    const pts = scoreOf(player);
    taEnd();
    ISB.store.set('ta', { level: ta.level + 1, points: pts });
    const nk = ta.level + 1;
    if (ISB.game.onAdv) ISB.game.onAdv({
      title: '🏆 Mission complete!', label: 'Next level ▶',
      text: 'Level ' + ta.level + ' done with ' + pts + ' points (saved). Level ' + nk + ': reach ' + Math.max(taGoal(nk), pts + 100) +
            ' points in ' + fmtTime(Math.min(1200, 120 + 15 * (nk - 1))) + '.'
    });
  }
  function taFail() {
    if (!playing) return;
    const pts = scoreOf(player);
    taEnd();
    if (ISB.game.onAdv) ISB.game.onAdv({
      title: "⏰ Time's up!", label: 'Retry ↻',
      text: 'Mission failed. You needed ' + ta.goal + ' points and got ' + pts + '. Your saved points are safe, so try again!'
    });
  }

  // ---------- TEAM BATTLE ----------
  function respawnPlayer() {
    if (!playing || !mode.team) return;
    const old = player;
    player = newSnake(old.name, false, MIN_MASS, { safe: true, hole: true, wait: 0.8 });
    setTeam(player, tbTeam); player.iq = undefined;
    inputAngle = player.angle; wantBoost = prevBoost = false;
    cam.x = player.x; cam.y = player.y;
  }
  function tbEnd() {
    if (!playing) return;
    const sc = [0, 0];
    for (const s of snakes) if (s.team !== undefined) sc[s.team] += scoreOf(s);
    const draw = sc[0] === sc[1], won = sc[tbTeam] > sc[1 - tbTeam];
    playing = false; wantBoost = false; hud.classList.add('hidden'); cdEl.textContent = '';
    if (!draw) { const rec = ISB.store.get('tb', { w: 0, l: 0 }); if (won) rec.w++; else rec.l++; ISB.store.set('tb', rec); }
    if (ISB.game.onAdv) ISB.game.onAdv({
      title: draw ? '🤝 Draw!' : (won ? '🏆 Your team wins!' : '😵 Your team lost'), label: 'Play again ↻',
      text: '🔵 Blue ' + sc[0] + '   vs   🔴 Red ' + sc[1] + '.'
    });
  }

  function levelComplete() {
    if (!playing) return;
    playing = false; wantBoost = false;
    hud.classList.add('hidden');
    const a = adv, now = player ? player.mass : a.mass;
    let next, title, text;
    if (a.level === 10) {
      next = { scene: a.scene + 1, level: 1, mass: MIN_MASS };
      title = '👑 You beat the King!';
      text = 'Scene ' + a.scene + ' complete! Scene ' + next.scene + ' starts now. Your snake starts small again and everything is 10% harder.';
    } else {
      next = { scene: a.scene, level: a.level + 1, mass: now };
      title = 'Level ' + a.level + ' complete!';
      text = (a.level === 9 ? 'Next up: the KING! ' : '') + 'Your size is saved: ' + Math.max(0, Math.floor((now - 9) * 10)) + '.';
    }
    ISB.store.set('adv', next);
    if (ISB.game.onAdv) ISB.game.onAdv({ title, text });
  }

  // Builds a fresh arena. Top 3 start with 70 / 50 / 30 points at most, in a random order of the 3 priority names.
  function setupWorld(nick, extra) {
    worldGen++;
    WORLD = mode.world || 5200; BOT_COUNT = mode.bots !== undefined ? mode.bots : 29; FOOD_TARGET = mode.food || 1500;
    if (mode.timeattack && extra) FOOD_TARGET = extra.food;
    snakes = []; food = []; particles = []; player = null;
    reserved = nick ? nick.toLowerCase() : '';
    const pri = shuffle(PRIORITY.filter(n => n.toLowerCase() !== reserved));
    const tough = !!mode.tough;      // OG mode: lots of big snakes from the start
    if (BOT_COUNT > 0 && !mode.survival) (tough ? [420, 300, 220] : [15.9, 13.9, 11.9]).forEach((m, i) => newSnake(pri[i] || pickName(), true, m));
    while (snakes.filter(s => s.isBot).length < BOT_COUNT) {
      newSnake(pickName(), true, mode.survival ? 14 : tough ? Math.min(200, 10 + -Math.log(1 - Math.random()) * 45) : rand(10, 11.8));
    }
    spawnAmbientFood();
    if (mode.adventure && extra) spawnAdventureEnemies(extra);
    if (mode.team && extra) {
      const bots = shuffle(snakes.filter(s => s.isBot)), mine = Math.floor(bots.length / 2);
      bots.forEach((s, i) => setTeam(s, i < mine ? extra.team : 1 - extra.team));
    }
    if (nick) player = newSnake(nick, false, (extra && extra.mass) || MIN_MASS, { safe: true, hole: true, wait: (mode.timeattack || mode.survival) ? 3 : 0.6 });
    if (mode.team && extra && player) { setTeam(player, extra.team); player.iq = undefined; }
  }

  // ---------- update ----------
  // Eyes: look around by themselves, lock on to the nearest snake, and blink
  function updateEyes(s, dt) {
    s.blinkT -= dt;
    if (s.blink > 0) s.blink -= dt;
    else if (s.blinkT <= 0) { s.blink = 0.16; s.blinkT = Math.random() < 0.2 ? 0.35 : rand(2, 5.5); }
    s.eyeT -= dt;
    if (s.eyeT <= 0) {
      s.eyeT = 0.2 + Math.random() * 0.2;
      let best = null, bd = 450 * 450;
      for (const o of snakes) {
        if (o === s || !o.alive || o.wait > 0) continue;
        const d2 = (o.x - s.x) ** 2 + (o.y - s.y) ** 2;
        if (d2 < bd) { bd = d2; best = o; }
      }
      s.watch = best;
    }
    let tx, ty;
    if (s.watch && s.watch.alive) {
      const a = Math.atan2(s.watch.y - s.y, s.watch.x - s.x); tx = Math.cos(a); ty = Math.sin(a);
    } else {
      s.lookT -= dt;
      if (s.lookT <= 0) { s.lookT = rand(0.8, 2.2); s.lookA = s.angle + rand(-1.3, 1.3); }
      tx = Math.cos(s.lookA); ty = Math.sin(s.lookA);
    }
    const k = Math.min(1, dt * 9);
    s.ex += (tx - s.ex) * k; s.ey += (ty - s.ey) * k;
  }

  // FOOD CHAIN: a bigger snake bites a smaller one
  function cutTail(s, i) {
    const segs = s.segs, cutN = segs.length - i, sp = spacingOf(s);
    const newMass = Math.max(MIN_MASS, ((i - 8) * sp) / 9);
    const lost = Math.max(0, s.mass - newMass);
    const per = Math.max(0.3, lost * 0.7 / Math.max(1, cutN / 2));
    for (let k = i; k < segs.length; k += 2) {                         // the bitten part becomes food for anyone
      addFood(segs[k].x + rand(-6, 6), segs[k].y + rand(-6, 6), per, s.pal[k % s.pal.length], clamp(5 + per * 2, 6, 14));
      if (k % 8 === 0) emit(segs[k].x, segs[k].y, s.pal[k % s.pal.length], 2);
    }
    segs.length = i;
    s.mass = newMass;
  }
  function fcBite(a, o, i) {
    if (!o.alive || !a.alive || i >= o.segs.length) return;
    if (a.mass > o.mass * 1.08) {                 // a is bigger: it bites o
      if (i < 8) kill(o);                         // head or neck: game over
      else cutTail(o, i);                         // body: from the bite to the tail turns into food
    } else if (o.mass > a.mass * 1.08) {          // a tried to bite someone bigger: game over
      kill(a);
    }                                             // about the same size: nothing happens
  }

  // SURVIVAL helpers
  function spawnCrates(R) {                       // gold crates drop inside the new safe circle
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * 6.2832, d = Math.sqrt(Math.random()) * R * 0.8;
      food.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, v: 5, r: 10, c: '#ffd60a', p: 0, gold: true });
    }
  }
  function zoneDamage(s, dt) {                    // outside the circle you slowly shrink and your tail turns into food
    if (s.wait > 0 || !s.alive) return;
    if (Math.hypot(s.x, s.y) <= zoneR) return;
    s.mass -= (1.2 + s.mass * 0.02) * dt;
    s.zoneT = (s.zoneT || 0) + dt;
    if (s.zoneT > 0.4) { s.zoneT = 0; const tl = s.segs[s.segs.length - 1]; addFood(tl.x, tl.y, 0.3, s.pal[0], 4.5); }
    if (s.mass < 8) kill(s);
  }
  function svEnd() {
    if (!playing) return;
    const alive = snakes.filter(o => o.alive).sort((a, b) => b.mass - a.mass);
    const place = Math.max(1, alive.indexOf(player) + 1), total = BOT_COUNT + 1, won = place === 1;
    playing = false; wantBoost = false; hud.classList.add('hidden'); cdEl.textContent = '';
    const rec = ISB.store.get('sv', { w: 0, best: 0 });
    if (won) rec.w++;
    if (!rec.best || place < rec.best) rec.best = place;
    ISB.store.set('sv', rec);
    if (ISB.game.onAdv) ISB.game.onAdv({
      title: won ? '🏆 Last snake alive!' : '⏱️ Time is up!', label: 'Play again ↻',
      text: won ? 'You won the Survival!' : 'You survived and finished ' + ordinal(place) + ' of ' + total + '. The biggest snakes alive rank higher.'
    });
  }

  function buildFoodGrid() { foodGrid.clear(); for (const f of food) foodGrid.add(f.x, f.y, f); }
  function buildSegGrid() {
    segGrid.clear();
    for (const s of snakes) {
      s.r = radiusOf(s);
      if (s.wait > 0 || s.emerging) continue;          // snakes coming out of a hole cannot be hit
      const sg = s.segs;
      for (let i = 0; i < sg.length; i += 2) { sg[i].o = s; sg[i].i = i; segGrid.add(sg[i].x, sg[i].y, sg[i]); }
    }
  }

  function updateSnake(s, dt) {
    if (s.emerging) {                   // done when the tail has left the hole
      const tl = s.segs[s.segs.length - 1];
      s.emT += dt;
      if (Math.hypot(tl.x - s.hx, tl.y - s.hy) > 24 || s.emT > 7) { s.emerging = false; s.holeT = 0.6; }
    }
    updateEyes(s, dt);
    const turnRate = Math.max(1.8, 4.6 / (1 + s.mass / 350));
    const maxTurn = turnRate * dt;
    s.angle += clamp(angleDiff(s.target, s.angle), -maxTurn, maxTurn);

    let speed = BASE_SPEED * (s.spd || 1) * (mode.foodchain ? fcSpeed(s) : 1);
    const boosting = s.boost && s.mass > MIN_MASS + 0.5;
    if (boosting) {
      speed = BOOST_SPEED * (s.spd || 1) * (mode.foodchain ? fcSpeed(s) : 1);
      s.mass -= (1.2 + s.mass * 0.02) * dt;           // bigger snakes burn more
      s.dropT += dt;
      if (s.dropT > 0.25) {
        s.dropT = 0;
        const t = s.segs[s.segs.length - 1];
        addFood(t.x, t.y, 0.3, s.pal[0], 4.5);
      }
      if (Math.random() < 0.5) { const t = s.segs[s.segs.length - 1]; emit(t.x, t.y, s.pal[0], 1); }
    } else if (s.isBot) s.boost = false;

    s.x += Math.cos(s.angle) * speed * dt;
    s.y += Math.sin(s.angle) * speed * dt;

    const want = Math.min(900, Math.floor(8 + (s.mass * 9) / spacingOf(s)));
    while (s.segs.length < want) { const t = s.segs[s.segs.length - 1] || { x: s.x, y: s.y }; s.segs.push({ x: t.x, y: t.y }); }
    while (s.segs.length > want && s.segs.length > 4) s.segs.pop();

    const sp = spacingOf(s);
    s.segs[0].x = s.x; s.segs[0].y = s.y;
    for (let i = 1; i < s.segs.length; i++) {
      const p = s.segs[i - 1], c = s.segs[i];
      const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy);
      if (d > sp) { const k = (d - sp) / d; c.x += dx * k; c.y += dy * k; }
    }

    const reach = radiusOf(s) + 10;
    const ecx = Math.floor(s.x / CELL), ecy = Math.floor(s.y / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = foodGrid.cell(ecx + i, ecy + j);
      if (!a) continue;
      for (let k = 0; k < a.length; k++) {
        const f = a[k];
        if (f.dead) continue;
        const dx = f.x - s.x, dy = f.y - s.y, d2 = dx * dx + dy * dy;
        if (d2 < (reach + f.r) * (reach + f.r)) { s.mass += f.v; f.dead = true; eaten++; }
        else if (d2 < reach * reach * 9) { f.x -= dx * 0.12; f.y -= dy * 0.12; }
      }
    }
  }

  function thinkBot(s) {
    const STEP = s.thinkStep || (mode.aggressive ? 0.15 : 0.33);
    const r = radiusOf(s), dc = Math.hypot(s.x, s.y);
    s.boost = false;
    if (s.skipFood > 0) s.skipFood -= STEP;
    if (s.lm !== undefined && s.mass > s.lm + 0.05) s.chase = 0;   // it ate something, so the chase worked
    s.lm = s.mass;
    s.goalT = (s.goalT || 0) - STEP;

    // 1) stay inside the arena
    if (dc > WORLD - 250) { s.target = Math.atan2(-s.y, -s.x); s.goal = null; return; }

    // 2) OG mode: pick a smaller snake to hunt
    s.prey = null;
    let prey = null;
    if (false) {   // (hunting now lives in thinkBotOG)
      let pd = 750 * 750;
      for (const o of snakes) {
        if (o === s || !o.alive || o.mass > s.mass * 1.15) continue;
        const d2 = (o.x - s.x) ** 2 + (o.y - s.y) ** 2;
        if (d2 < pd) { pd = d2; prey = o; }
      }
      s.prey = prey;
    }

    // 3) avoid other bodies (except the prey we are hunting)
    let near = null, nd = Math.min(190, 70 + r * 2.5) ** 2;
    const cx = Math.floor(s.x / CELL), cy = Math.floor(s.y / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = segGrid.cell(cx + i, cy + j);
      if (!a) continue;
      for (let k = 0; k < a.length; k++) {
        const g = a[k], o = g.o;
        if (o === s || o === prey || !o.alive || ignoreBody(s, o)) continue;
        const dx = g.x - s.x, dy = g.y - s.y, d2 = dx * dx + dy * dy;
        if (d2 < nd) { nd = d2; near = g; }
      }
    }
    if (near && (s.iq === undefined || s.iq >= 1 || Math.random() < 0.35 + 0.65 * s.iq)) {
      s.target = Math.atan2(s.y - near.y, s.x - near.x);
      s.boost = s.mass > 16 && Math.random() < 0.5;
      return;
    }
    if (prey) {   // aim ahead of the prey's head to cut it off
      const tx = prey.x + Math.cos(prey.angle) * 160, ty = prey.y + Math.sin(prey.angle) * 160;
      s.target = Math.atan2(ty - s.y, tx - s.x);
      s.boost = Math.hypot(prey.x - s.x, prey.y - s.y) < 380 && s.mass > 14;
      return;
    }

    // 4) food in front of us (or very close). If a chase takes too long, give up and roam.
    if (!(s.skipFood > 0)) {
      let best = null, bd = 400 * 400;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const a = foodGrid.cell(cx + i, cy + j);
        if (!a) continue;
        for (let k = 0; k < a.length; k++) {
          const f = a[k];
          if (f.dead) continue;
          const d2 = (f.x - s.x) ** 2 + (f.y - s.y) ** 2;
          if (d2 >= bd) continue;
          if (d2 > 12100 && Math.abs(angleDiff(Math.atan2(f.y - s.y, f.x - s.x), s.angle)) > 1.4) continue;
          bd = d2; best = f;
        }
      }
      if (best) {
        s.chase = (s.chase || 0) + STEP;
        if (s.chase > 3) { s.skipFood = 3; s.chase = 0; }
        else { s.target = Math.atan2(best.y - s.y, best.x - s.x); return; }
      }
    }

    // 5) roam: walk toward a far-away spot, then pick a new one
    if (!s.goal || s.goalT <= 0 || Math.hypot(s.goal.x - s.x, s.goal.y - s.y) < 250) {
      const a = Math.random() * 6.2832, d = Math.sqrt(Math.random()) * (mode.survival ? Math.max(40, zoneR * 0.6) : WORLD * 0.75);
      s.goal = { x: Math.cos(a) * d, y: Math.sin(a) * d };
      s.goalT = rand(6, 12);
    }
    s.target = Math.atan2(s.goal.y - s.y, s.goal.x - s.x) + rand(-0.2, 0.2);
  }

  // OG mode brain: smart about bodies, hunts anyone smaller, runs from much bigger snakes,
  // and when a head is close it speeds up and curls around it to cut it off.
  function thinkBotOG(s) {
    const STEP = s.thinkStep || 0.15;
    const iq = s.iq === undefined ? 1 : s.iq;            // 0 = dumb ... 1 = OG bot ... 1.5+ = the King
    const r = radiusOf(s), dc = Math.hypot(s.x, s.y);
    s.boost = false;
    s.curlT = (s.curlT || 0) - STEP;
    s.curlCd = (s.curlCd || 0) - STEP;

    // 1) stay inside the arena (big snakes need more room to turn)
    if (dc > WORLD - (200 + r * 4)) { s.target = Math.atan2(-s.y, -s.x); s.curlT = 0; return; }
    if (mode.survival && dc > zoneR - 60 - r * 2) {      // near or outside the red zone: run to the middle
      s.target = Math.atan2(-s.y, -s.x); s.curlT = 0;
      s.boost = dc > zoneR && s.mass > 14;
      return;
    }

    // 2) find the nearest victim (smaller) and the nearest danger (much bigger)
    let prey = null, pd = (iq < 0.25 ? 0 : (mode.survival ? 120 + 300 * iq : 150 + 550 * Math.min(iq, 1.2)) ** 2), threat = null, td = (iq > 0.4 ? 330 * 330 : 0);
    for (const o of snakes) {
      if (o === s || !o.alive || friend(s, o)) continue;
      const dx = o.x - s.x, dy = o.y - s.y, d2 = dx * dx + dy * dy;
      if (d2 > pd && d2 > td) continue;
      const big = mode.foodchain ? o.mass > s.mass * 1.08 : (o.mass > s.mass * 1.3 && iq <= 1.1);
      if (big) { if (d2 < td) { td = d2; threat = o; } }
      else if (d2 < pd && (!mode.foodchain || s.mass > o.mass * 1.08)) { pd = d2; prey = o; }
    }
    if (prey && (mode.foodchain || mode.survival)) {
      s.huntCd = (s.huntCd || 0) - STEP;
      if (s.huntCd > 0) prey = null;                                  // resting: not hunting right now
      else {
        if (s.chaseTarget !== prey) {                                  // new victim: choose where to aim (often the BODY)
          s.chaseTarget = prey; s.chaseT = 0; s.chaseMax = rand(1.6, 2.8);
          s.aimFrac = Math.random() < 0.3 ? 0 : rand(0.15, 0.9);       // 0 = the head, otherwise a spot on the body
        }
        s.chaseT += STEP;
        if (s.chaseT > s.chaseMax) { s.huntCd = rand(2.5, 5); s.chaseTarget = null; prey = null; }   // let go after ~2 seconds
      }
    }
    s.prey = prey;

    // 3) ALWAYS dodge bodies. Only look at things in front of us (and very close ones).
    let near = null, nd = Math.min(195, 35 + 55 * Math.min(iq, 1.3) + r * 2.5 * (0.4 + 0.6 * Math.min(iq, 1)) + (mode.survival ? 70 : 0)) ** 2, nrel = 0;
    const cx = Math.floor(s.x / CELL), cy = Math.floor(s.y / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = segGrid.cell(cx + i, cy + j);
      if (!a) continue;
      for (let k = 0; k < a.length; k++) {
        const g = a[k], o = g.o;
        if (o === s || !o.alive || ignoreBody(s, o)) continue;
        if (o === prey && g.i < 8 && !mode.survival) continue;            // we want to reach the victim's head area
        const dx = g.x - s.x, dy = g.y - s.y, d2 = dx * dx + dy * dy;
        if (d2 >= nd) continue;
        const rel = angleDiff(Math.atan2(dy, dx), s.angle);
        if (Math.abs(rel) > 1.9 && d2 > (r * 3) ** 2) continue;
        nd = d2; near = g; nrel = rel;
      }
    }
    if (near && iq < 1 && Math.random() > 0.35 + 0.65 * iq) near = null;   // dumb snakes sometimes do not see it
    if (near) {
      if (Math.abs(nrel) < 0.05) { if (!s.dodge) s.dodge = Math.random() < 0.5 ? 1 : -1; nrel = s.dodge * 0.05; }
      s.target = s.angle - Math.sign(nrel) * 1.4;      // turn away from the side the obstacle is on
      s.boost = s.mass > 14 && nd < (r * 3 + 60) ** 2;
      s.curlT = 0;
      return;
    }
    s.dodge = 0;

    // 4) run away from a much bigger head that is close
    if (threat) {
      s.target = Math.atan2(s.y - threat.y, s.x - threat.x);
      s.boost = s.mass > 12;
      s.curlT = 0;
      return;
    }

    // 5) hunt
    if (prey) {
      const dx = prey.x - s.x, dy = prey.y - s.y, dist = Math.hypot(dx, dy);
      if (s.curlT > 0) {                                // the twist: speed up and curl around its head
        s.target = s.angle + s.curlDir * 1.7;
        s.boost = s.mass > 12;
        return;
      }
      if (iq > 0.6 && dist < 230 + r && s.curlCd <= 0) {
        const rel = angleDiff(Math.atan2(dy, dx), s.angle);
        if (Math.abs(rel) < 1.2) {
          s.curlDir = rel >= 0 ? 1 : -1;
          s.curlT = rand(1.0, 1.6);
          s.curlCd = rand(2.5, 4) / Math.max(1, iq);
          s.target = s.angle + s.curlDir * 1.7;
          s.boost = s.mass > 12;
          return;
        }
      }
      const lead = iq > 1.1 ? clamp(dist * 0.95, 100, 540) : clamp(dist * 0.7, 80, 380);          // aim ahead of its head to cut it off
      let tx = prey.x + Math.cos(prey.angle) * lead, ty = prey.y + Math.sin(prey.angle) * lead;
      if (mode.foodchain && s.aimFrac > 0) {                          // go for a spot on the body, not only the head
        const sg = prey.segs[Math.min(prey.segs.length - 1, Math.floor(s.aimFrac * prey.segs.length))];
        tx = sg.x; ty = sg.y;
      }
      s.target = Math.atan2(ty - s.y, tx - s.x);
      s.boost = dist < 420 && s.mass > 12 && Math.abs(angleDiff(s.target, s.angle)) < 0.8;
      return;
    }

    // 6) nobody around: eat and roam like normal bots do
    thinkBot(s);
  }

  function kill(s, quit) {
    if (!s.alive) return;
    s.alive = false;
    const per = Math.max(0.6, s.mass * 0.6 / Math.max(1, s.segs.length / 2));
    for (let i = 0; i < s.segs.length; i += 2) {
      const g = s.segs[i];
      addFood(g.x + rand(-6, 6), g.y + rand(-6, 6), per, s.pal[i % s.pal.length], clamp(5 + per * 2, 6, 14));
      if (i % 6 === 0) emit(g.x, g.y, s.pal[i % s.pal.length], 2);
    }
    snakes = snakes.filter(o => o !== s);
    if (s === player && mode.survival) svPlace = snakes.filter(o => o.alive).length + 1;
    if (s === player) {
      if (quit) finish('quit');
      else if (mode.team) { const gen = worldGen; setTimeout(() => { if (gen === worldGen) respawnPlayer(); }, 2500); }
      else setTimeout(() => finish('crash'), 700);
    } else {
      if (mode.survival) return;
      const gen = worldGen;
      setTimeout(() => {
        if (gen !== worldGen) return;
        if (snakes.filter(o => o.isBot).length < BOT_COUNT) {
          const nb = newSnake(pickName(), true, mode.tough ? rand(15, 90) : rand(10, 13), { hole: true, wait: 0.7 });
          if (mode.team) setTeam(nb, s.team);
        }
      }, 800);
    }
  }

  function finish(reason) {
    if (!playing) return;
    playing = false;
    wantBoost = false;
    hud.classList.add('hidden');
    cdEl.textContent = '';
    const isBest = ISB.saveBest(mode.id, lastScore);
    if (mode.survival && reason !== 'quit' && svPlace) {
      const rec = ISB.store.get('sv', { w: 0, best: 0 });
      if (!rec.best || svPlace < rec.best) { rec.best = svPlace; ISB.store.set('sv', rec); }
    }
    if (ISB.game.onOver) ISB.game.onOver({ score: lastScore, isBest, reason, modeId: mode.id, place: svPlace, total: BOT_COUNT + 1 });
  }

  function checkCollisions() {
    for (const a of snakes) {
      if (!a.alive || a.wait > 0 || a.emerging) continue;
      if (Math.hypot(a.x, a.y) > WORLD) { kill(a); continue; }
      const ra = radiusOf(a);
      const cx = Math.floor(a.x / CELL), cy = Math.floor(a.y / CELL);
      let hit = false, hitO = null, hitI = 0;
      for (let i = -1; i <= 1 && !hit; i++) for (let j = -1; j <= 1 && !hit; j++) {
        const arr = segGrid.cell(cx + i, cy + j);
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const g = arr[k], o = g.o;
          if (o === a || !o.alive) continue;
          if (friend(a, o)) continue;      // friends glide over each other
          const lim = (ra + o.r) * 0.85, dx = g.x - a.x, dy = g.y - a.y;
          if (dx * dx + dy * dy < lim * lim) { hit = true; hitO = o; hitI = g.i; break; }
        }
      }
      if (hit) { if (mode.foodchain) fcBite(a, hitO, hitI); else kill(a); }
    }
  }

  function update(dt) {
    if (playing && player && player.alive) {
      if (wantBoost && !prevBoost) boostStart = player.mass;
      prevBoost = wantBoost;
      player.target = inputAngle;
      player.boost = wantBoost;
    }
    buildFoodGrid(); eaten = 0;
    for (const s of snakes) {
      if (s.holeT > 0) s.holeT -= dt;
      if (s.wait > 0) { s.wait -= dt; continue; }      // the hole is still opening
      if (s.isBot) {
        s.aiT -= dt;
        if (s.aiT <= 0) {
          if (mode.adventure) { s.aiT = (s.thinkStep || 0.3) * (0.8 + Math.random() * 0.4); thinkBotOG(s); if (s.noBoost) s.boost = false; }
          else if (mode.team) { s.aiT = 0.12 + Math.random() * 0.1; thinkBotOG(s); }
          else if (mode.aggressive) {
            s.aiT = (mode.foodchain || mode.survival) ? (s.thinkStep || 0.3) * (0.8 + Math.random() * 0.4) : 0.1 + Math.random() * 0.1;
            thinkBotOG(s);
            if (s.noBoost) s.boost = false;
          }
          else { s.aiT = 0.2 + Math.random() * 0.25; thinkBot(s); }
        }
      }
      updateSnake(s, dt);
      if (mode.survival && svRun) zoneDamage(s, dt);
    }
    if (eaten) food = food.filter(f => !f.dead);
    buildSegGrid();
    checkCollisions();
    spawnAmbientFood();
    if (mode.adventure && playing && player && player.alive && !advDone && !snakes.some(o => o.isBot && o.alive)) {
      advDone = true;
      setTimeout(levelComplete, 700);
    }
    if (mode.timeattack && playing && player && ta) {
      taGoldT -= dt;
      if (taGoldT <= 0) { taGoldT = 0.5; ensureGold(); }
      if (taCount > 0) { taCount -= dt; if (taCount <= 0) taRun = true; }
      else if (taRun && player.alive && !taDone) {
        taT -= dt;
        if (scoreOf(player) >= ta.goal) { taDone = true; setTimeout(taWin, 500); }
        else if (taT <= 0) { taDone = true; taT = 0; setTimeout(taFail, 300); }
      }
    }
    if (mode.team && playing) { tbT -= dt; if (tbT <= 0) tbEnd(); }
    if (mode.survival && playing) {
      if (svCount > 0) { svCount -= dt; if (svCount <= 0) svRun = true; }
      else if (svRun && !svDone) {
        svT += dt;
        zoneR = zoneRadius(svT);
        while (svWave < 5 && svT >= ZONE_T[svWave]) { spawnCrates(ZONE_R[svWave + 1]); svWave++; }
        if (player && player.alive) {
          if (snakes.filter(o => o.alive).length <= 1) { svDone = true; setTimeout(svEnd, 500); }
          else if (svT >= SURVIVAL_TIME) { svDone = true; svEnd(); }
        }
      }
    }
    if (mode.foodchain) {
      let b = null;
      for (const s of snakes) if (s.alive && !(s.wait > 0) && (!b || s.mass > b.mass)) b = s;
      crownHolder = b;
      if (playing && player && player.alive) {
        const tr = tierOf(player);
        if (tr !== fcLastTier) { if (fcLastTier) { cdEl.textContent = tr.e + ' ' + tr.n + '!'; fcToast = 1.8; } fcLastTier = tr; }
      }
      if (fcToast > 0) { fcToast -= dt; if (fcToast <= 0) cdEl.textContent = ''; }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.l -= dt;
      if (p.l <= 0) { particles[i] = particles[particles.length - 1]; particles.pop(); }
    }

    const focus = (playing && player && player.alive) ? player : snakes[0];
    if (focus) {
      cam.x += (focus.x - cam.x) * Math.min(1, dt * 8);
      cam.y += (focus.y - cam.y) * Math.min(1, dt * 8);
      const base = clamp(Math.min(W, H) / 560, 0.65, 1.25);
      const tz = base * clamp(1.15 - (radiusOf(focus) - 9) * 0.014, 0.35, 1.15);
      cam.zoom += (tz - cam.zoom) * Math.min(1, dt * 2);
    }

    if (playing && player && player.alive) {
      lastScore = scoreOf(player);
      // turbo outline = fuel meter. Full when you press, unwraps as you burn fat.
      if (wantBoost) {
        const span = Math.max(0.5, boostStart - MIN_MASS);
        const p = clamp((player.mass - MIN_MASS) / span, 0, 1) * 100;
        boostWrap.classList.add('on');
        boostWrap.style.setProperty('--p', p + '%');
        boostWrap.style.setProperty('--ring', p < 25 ? '#FF2D55' : '#00E5FF');
      } else boostWrap.classList.remove('on');
    }

    lbTimer -= dt;
    if (lbTimer <= 0) { lbTimer = 0.3; updateLeaderboard(); }
  }

  function updateLeaderboard() {
    if (mode.survival && playing) {
      const alive = snakes.filter(o => o.alive).length, left = Math.max(0, Math.ceil(SURVIVAL_TIME - svT));
      let nxt = null;
      for (const z of ZONE_T) if (z > svT) { nxt = z; break; }
      const shrinking = svT > 0 && ZONE_T.some(z => svT >= z && svT < z + 8);
      const zoneTxt = svT >= 158 ? 'Final zone!' : shrinking ? 'Shrinking!' : nxt ? 'Shrinks in ' + Math.ceil(nxt - svT) + 's' : 'Final zone!';
      const out = player && player.alive && svRun && Math.hypot(player.x, player.y) > zoneR;
      lbEl.innerHTML = '<h3>Survival</h3><div class="big' + (svRun && left <= 20 ? ' warn' : '') + '">' + fmtTime(left) + '</div>' +
        '<div class="row"><span>🐍 Alive</span><span>' + alive + '</span></div>' +
        '<div class="row"><span>⭕ Zone</span><span>' + zoneTxt + '</span></div>';
      cdEl.textContent = svCount > 0 ? String(Math.ceil(svCount)) : (svT < 1 && svRun ? 'GO!' : (out ? '⚠️' : ''));
      return;
    }
    if (mode.team && playing) {
      const sc = [0, 0];
      for (const s of snakes) if (s.team !== undefined) sc[s.team] += scoreOf(s);
      const tot = Math.max(1, sc[0] + sc[1]), left = Math.max(0, Math.ceil(tbT));
      lbEl.innerHTML = '<h3>' + (tbTeam === 0 ? '🔵 You: Blue team' : '🔴 You: Red team') + '</h3>' +
        '<div class="big' + (left <= 15 ? ' warn' : '') + '">' + fmtTime(left) + '</div>' +
        '<div class="row"><span>🔵 Blue</span><span>' + sc[0] + '</span></div>' +
        '<div class="row"><span>🔴 Red</span><span>' + sc[1] + '</span></div>' +
        '<div class="tbar"><i style="width:' + (sc[0] / tot * 100) + '%;background:#1E90FF"></i><i style="width:' + (sc[1] / tot * 100) + '%;background:#FF2D55"></i></div>';
      cdEl.textContent = (player && !player.alive) ? '💀' : '';
      return;
    }
    if (!playing || !mode.leaderboard) { lbEl.innerHTML = ''; return; }
    if (mode.timeattack && ta) {
      const pts = player && player.alive ? scoreOf(player) : 0;
      const left = Math.max(0, Math.ceil(taT)), pct = Math.min(100, Math.round(pts / ta.goal * 100));
      lbEl.innerHTML = '<h3>Level ' + ta.level + '</h3><div class="big' + (taRun && left <= 15 ? ' warn' : '') + '">' + fmtTime(left) + '</div>' +
        '<div class="row"><span>Points</span><span>' + pts + ' / ' + ta.goal + '</span></div><div class="bar"><i style="width:' + pct + '%"></i></div>';
      cdEl.textContent = taCount > 0 ? String(Math.ceil(taCount)) : (ta.time - taT < 1 ? 'GO!' : '');
      return;
    }
    if (mode.adventure && adv) {
      const left = snakes.filter(o => o.isBot && o.alive).length;
      lbEl.innerHTML = '<h3>Scene ' + adv.scene + ' · Level ' + adv.level + '/10</h3>' +
        (adv.level === 10 ? '<div class="row"><span>👑 Defeat the King!</span><span></span></div>'
                          : '<div class="row"><span>Snakes left</span><span>' + left + '</span></div>');
      return;
    }
    const sorted = snakes.slice().sort((a, b) => b.mass - a.mass);
    let html = '<h3>Leaderboard</h3>';
    sorted.slice(0, 8).forEach((s, i) => {
      html += '<div class="row' + (s === player ? ' me' : '') + '"><span>' + (i + 1) + '. ' + (mode.foodchain ? tierOf(s).e + ' ' : '') + esc(s.name) + '</span><span>' + scoreOf(s) + '</span></div>';
    });
    if (player && player.alive) {
      html += '<div class="row mine"><span>' + (sorted.indexOf(player) + 1) + '. ' + (mode.foodchain ? tierOf(player).e + ' ' : '') + esc(player.name) + '</span><span>' + scoreOf(player) + '</span></div>';
    }
    lbEl.innerHTML = html;
  }

  // ---------- drawing ----------
  function drawHole(s) {
    const R = Math.max(28, radiusOf(s) * 2.4);
    let k = 1;
    if (s.wait > 0) k = 1 - s.wait / (s.wait0 || 0.6);          // hole opens
    else if (!s.emerging && s.holeT > 0) k = s.holeT / 0.6;     // hole closes
    k = clamp(k, 0, 1);
    ctx.save();
    ctx.translate(s.hx, s.hy); ctx.scale(1, 0.62);
    ctx.globalAlpha = 0.92 * k; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(0, 0, R * k, 0, 6.2832); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 6; ctx.strokeStyle = '#00E5FF'; ctx.globalAlpha = 0.85 * k;
    ctx.beginPath(); ctx.arc(0, 0, R * k, 0, 6.2832); ctx.stroke();
    ctx.lineWidth = 16; ctx.globalAlpha = 0.18 * k;
    ctx.beginPath(); ctx.arc(0, 0, R * k * 1.08, 0, 6.2832); ctx.stroke();
    ctx.restore();
  }

  function drawSnake(s, view, t) {
    if (s.wait > 0) return;
    const r = radiusOf(s), pal = s.pal;
    const boosting = s.boost && s.mass > MIN_MASS + 0.5;
    for (let i = s.segs.length - 1; i >= 0; i--) {
      const g = s.segs[i];
      if (g.x < view.x0 - r * 2 || g.x > view.x1 + r * 2 || g.y < view.y0 - r * 2 || g.y > view.y1 + r * 2) continue;
      if (s.emerging && i > 0 && Math.abs(g.x - s.hx) < 2 && Math.abs(g.y - s.hy) < 2) continue;   // still inside the hole
      const col = pal[Math.floor(i / 3) % pal.length];
      if (boosting && i % 3 === 0) {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.14; ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(g.x, g.y, r * 2.1, 0, 6.2832); ctx.fill();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
      ctx.fillStyle = 'rgba(0,0,0,.4)';                         // dark outline
      ctx.beginPath(); ctx.arc(g.x, g.y, r * 1.1, 0, 6.2832); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 0.22; ctx.fillStyle = '#fff';           // shine
      ctx.beginPath(); ctx.arc(g.x - r * 0.28, g.y - r * 0.3, r * 0.5, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (s.x < view.x0 - 80 || s.x > view.x1 + 80 || s.y < view.y0 - 80 || s.y > view.y1 + 80) return;
    if (mode.foodchain && player && player.alive && s !== player) {      // green = you can eat it, red = it can eat you
      const edible = player.mass > s.mass * 1.08, danger = s.mass > player.mass * 1.08;
      if (edible || danger) {
        const gc = edible ? '#00E676' : '#FF2D55';
        ctx.globalAlpha = 0.55; ctx.lineWidth = 4; ctx.strokeStyle = gc;
        ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.7, 0, 6.2832); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.1; ctx.fillStyle = gc;
        for (let i = 0; i < s.segs.length; i += 3) {
          const g = s.segs[i];
          if (g.x < view.x0 - r * 2 || g.x > view.x1 + r * 2 || g.y < view.y0 - r * 2 || g.y > view.y1 + r * 2) continue;
          ctx.beginPath(); ctx.arc(g.x, g.y, r * 1.5, 0, 6.2832); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
    }
    if (s.team !== undefined) {                          // team ring around the head
      ctx.globalAlpha = 0.45; ctx.lineWidth = 3; ctx.strokeStyle = s.team === 0 ? '#1E90FF' : '#FF2D55';
      ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.55, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // eyes (pupils look where the snake is going)
    const ex = Math.cos(s.angle), ey = Math.sin(s.angle), px = -ey, py = ex;
    const lid = s.blink > 0 ? Math.sin((1 - s.blink / 0.16) * Math.PI) : 0;       // 0 = open ... 1 = closed
    const open = Math.max(0.08, 1 - lid * 0.92);
    for (const side of [-1, 1]) {
      const cx = s.x + ex * r * 0.4 + px * r * 0.58 * side, cy = s.y + ey * r * 0.4 + py * r * 0.58 * side;
      const rx = Math.max(r * 0.42 * open, 0.5);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, r * 0.42, s.angle, 0, 6.2832); ctx.fill();
      const qx = cx + s.ex * r * 0.2, qy = cy + s.ey * r * 0.2;                   // the pupil follows what the snake is watching
      ctx.fillStyle = '#05070a';
      ctx.beginPath(); ctx.ellipse(qx, qy, Math.min(r * 0.22, Math.max(rx * 0.9, 0.4)), r * 0.22, s.angle, 0, 6.2832); ctx.fill();
      if (open > 0.5) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(qx - r * 0.06, qy - r * 0.07, r * 0.06, 0, 6.2832); ctx.fill(); }
    }
    ctx.font = '600 ' + (13 / cam.zoom) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const label = mode.foodchain ? tierOf(s).e + ' ' + s.name : s.name;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(label, s.x + 1, s.y + r + 17 / cam.zoom);
    ctx.fillStyle = nameColor(s);
    ctx.fillText(label, s.x, s.y + r + 16 / cam.zoom);
    if (mode.foodchain && s === crownHolder) {                                     // the crown
      ctx.font = Math.round(r * 1.8) + 'px serif'; ctx.fillStyle = '#fff';
      ctx.fillText('👑', s.x, s.y - r * 1.5);
    }
  }

  // Adventure: 3 small arrows around you point to the 3 nearest enemies (nearest = red, brightest)
  function drawPointers() {
    const list = snakes.filter(o => o.isBot && o.alive)
      .map(o => ({ o, d: Math.hypot(o.x - player.x, o.y - player.y) }))
      .sort((a, b) => a.d - b.d).slice(0, 3);
    const R = Math.min(W, H) * 0.3;
    const px = (player.x - cam.x) * cam.zoom + W / 2, py = (player.y - cam.y) * cam.zoom + H / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    list.forEach((e, i) => {
      const a = Math.atan2(e.o.y - player.y, e.o.x - player.x);
      ctx.save();
      ctx.translate(px + Math.cos(a) * R, py + Math.sin(a) * R);
      ctx.rotate(a);
      ctx.globalAlpha = 1 - i * 0.25;
      ctx.fillStyle = i === 0 ? '#FF2D55' : '#00E5FF';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
      ctx.restore();
    });
  }

  // Time Attack: a gold arrow points to the nearest gold dot
  function drawGoldPointer() {
    let best = null, bd = 1e18;
    for (const f of food) {
      if (!f.gold || f.dead) continue;
      const d2 = (f.x - player.x) ** 2 + (f.y - player.y) ** 2;
      if (d2 < bd) { bd = d2; best = f; }
    }
    if (!best) return;
    const R = Math.min(W, H) * 0.3;
    const px = (player.x - cam.x) * cam.zoom + W / 2, py = (player.y - cam.y) * cam.zoom + H / 2;
    const a = Math.atan2(best.y - player.y, best.x - player.x);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.translate(px + Math.cos(a) * R, py + Math.sin(a) * R);
    ctx.rotate(a);
    ctx.fillStyle = '#ffd60a'; ctx.shadowColor = '#ffd60a'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-7, -8); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Food Chain: only the crown holder gets a pointer, and the pointer is a crown
  function drawCrownPointer() {
    if (!crownHolder || crownHolder === player || !crownHolder.alive) return;
    const R = Math.min(W, H) * 0.3;
    const px = (player.x - cam.x) * cam.zoom + W / 2, py = (player.y - cam.y) * cam.zoom + H / 2;
    const a = Math.atan2(crownHolder.y - player.y, crownHolder.x - player.x);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '26px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    ctx.fillText('👑', px + Math.cos(a) * R, py + Math.sin(a) * R);
    ctx.textBaseline = 'alphabetic';
  }

  // Survival: when you are outside the safe circle an arrow points back to it
  function drawZonePointer() {
    if (Math.hypot(player.x, player.y) <= zoneR) return;
    const R = Math.min(W, H) * 0.3;
    const px = (player.x - cam.x) * cam.zoom + W / 2, py = (player.y - cam.y) * cam.zoom + H / 2;
    const a = Math.atan2(-player.y, -player.x);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.translate(px + Math.cos(a) * R, py + Math.sin(a) * R);
    ctx.rotate(a);
    ctx.fillStyle = '#00E5FF'; ctx.shadowColor = '#00E5FF'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function render(time) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#050608'; ctx.fillRect(0, 0, W, H);

    const z = cam.zoom;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - cam.x * z), dpr * (H / 2 - cam.y * z));
    const view = { x0: cam.x - W / 2 / z, x1: cam.x + W / 2 / z, y0: cam.y - H / 2 / z, y1: cam.y + H / 2 / z };

    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, WORLD, 0, 6.2832); ctx.clip();
    ctx.fillStyle = floorPattern;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    ctx.restore();

    // glowing danger wall
    ctx.lineWidth = 36; ctx.strokeStyle = 'rgba(255,45,85,.18)';
    ctx.beginPath(); ctx.arc(0, 0, WORLD + 12, 0, 6.2832); ctx.stroke();
    ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(255,45,85,.85)';
    ctx.beginPath(); ctx.arc(0, 0, WORLD + 6, 0, 6.2832); ctx.stroke();

    if (mode.survival && zoneR < WORLD - 2) {            // the red zone outside the safe circle
      ctx.save();
      ctx.beginPath();
      ctx.rect(view.x0 - 60, view.y0 - 60, view.x1 - view.x0 + 120, view.y1 - view.y0 + 120);
      ctx.arc(0, 0, zoneR, 0, 6.2832, true);
      ctx.fillStyle = 'rgba(255,45,85,.17)'; ctx.fill('evenodd');
      ctx.restore();
      ctx.lineWidth = 34; ctx.strokeStyle = 'rgba(255,45,85,.22)';
      ctx.beginPath(); ctx.arc(0, 0, zoneR, 0, 6.2832); ctx.stroke();
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(255,100,130,.95)';
      ctx.beginPath(); ctx.arc(0, 0, zoneR, 0, 6.2832); ctx.stroke();
    }

    // food: soft glow, then bright core (only the boxes you can see)
    const t = time / 1000;
    const fx0 = Math.floor(view.x0 / CELL) - 1, fx1 = Math.floor(view.x1 / CELL) + 1;
    const fy0 = Math.floor(view.y0 / CELL) - 1, fy1 = Math.floor(view.y1 / CELL) + 1;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = fx0; i <= fx1; i++) for (let j = fy0; j <= fy1; j++) {
      const a = foodGrid.cell(i, j);
      if (!a) continue;
      for (let k = 0; k < a.length; k++) {
        const f = a[k];
        if (f.dead) continue;
        const pulse = 1 + Math.sin(t * 3 + f.p) * 0.18;
        ctx.globalAlpha = 0.22; ctx.fillStyle = f.c;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 2.6 * pulse, 0, 6.2832); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    for (let i = fx0; i <= fx1; i++) for (let j = fy0; j <= fy1; j++) {
      const a = foodGrid.cell(i, j);
      if (!a) continue;
      for (let k = 0; k < a.length; k++) {
        const f = a[k];
        if (f.dead) continue;
        const pulse = 1 + Math.sin(t * 3 + f.p) * 0.18;
        ctx.fillStyle = f.c;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * pulse, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        ctx.beginPath(); ctx.arc(f.x - f.r * 0.25, f.y - f.r * 0.25, f.r * 0.35, 0, 6.2832); ctx.fill();
      }
    }

    for (const s of snakes) {
      if (s.hx !== undefined && (s.wait > 0 || s.emerging || s.holeT > 0)) drawHole(s);
    }
    for (const s of snakes.slice().sort((a, b) => a.mass - b.mass)) drawSnake(s, view, t);

    // sparks
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.l / p.m, 0, 1) * 0.9; ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 6.2832); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (mode.adventure && playing && player && player.alive) drawPointers();
    if (mode.timeattack && playing && player && player.alive) drawGoldPointer();
    if (mode.foodchain && playing && player && player.alive) drawCrownPointer();
    if (mode.survival && playing && player && player.alive) drawZonePointer();
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render(now);
    requestAnimationFrame(frame);
  }

  // ---------- controls ----------
  canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') inputAngle = Math.atan2(e.clientY - H / 2, e.clientX - W / 2); });
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') { inputAngle = Math.atan2(e.clientY - H / 2, e.clientX - W / 2); wantBoost = true; }
  });
  window.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') wantBoost = false; });
  window.addEventListener('keydown', e => { if (e.code === 'Space' && playing) wantBoost = true; });
  window.addEventListener('keyup', e => { if (e.code === 'Space') wantBoost = false; });

  // left analog stick
  let joyId = null;
  function joyMove(e) {
    const r = joy.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy), max = 48;
    if (m > 10) inputAngle = Math.atan2(dy, dx);
    if (m > max) { dx = dx / m * max; dy = dy / m * max; }
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }
  const joyEnd = e => { if (e.pointerId === joyId) { joyId = null; knob.style.transform = 'translate(0,0)'; } };
  joy.addEventListener('pointerdown', e => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); joyMove(e); });
  joy.addEventListener('pointermove', e => { if (e.pointerId === joyId) joyMove(e); });
  joy.addEventListener('pointerup', joyEnd);
  joy.addEventListener('pointercancel', joyEnd);

  // right turbo button
  const boostOn = e => { e.preventDefault(); boostBtn.setPointerCapture(e.pointerId); wantBoost = true; };
  const boostOff = () => { wantBoost = false; };
  boostBtn.addEventListener('pointerdown', boostOn);
  boostBtn.addEventListener('pointerup', boostOff);
  boostBtn.addEventListener('pointercancel', boostOff);
  boostBtn.addEventListener('contextmenu', e => e.preventDefault());

  quitBtn.addEventListener('click', () => ISB.game.quit());

  // ---------- public ----------
  ISB.game = {
    onOver: null,
    start(modeId, nick, opts) {
      mode = ISB.getMode(modeId);
      advDone = false;
      adv = mode.adventure ? ISB.store.get('adv', { scene: 1, level: 1, mass: MIN_MASS }) : null;
      ta = null; crownHolder = null; fcLastTier = null; fcToast = 0;
      let extra = mode.timeattack ? makeTA() : adv;
      if (mode.team) { tbTeam = (opts && opts.team) || 0; tbT = 240; extra = { team: tbTeam }; }
      if (mode.survival) { extra = { mass: 14 }; svT = 0; svRun = false; svCount = 3; svDone = false; svPlace = 0; svWave = 0; zoneR = ZONE_R[0]; }
      setupWorld(nick, extra);
      inputAngle = player.angle; wantBoost = prevBoost = false;
      lastScore = scoreOf(player); playing = true;
      cam.x = player.x; cam.y = player.y;
      boostWrap.classList.remove('on');
      hud.classList.remove('hidden');
      lbTimer = 0;
    },
    quit() {
      if (!playing) return;
      if (player && player.alive) { lastScore = scoreOf(player); kill(player, true); } else finish('quit');
    }
  };

  // background "demo" arena behind the home screen
  setupWorld(null);
  cam.x = snakes[0].x; cam.y = snakes[0].y;
  requestAnimationFrame(frame);
})();
