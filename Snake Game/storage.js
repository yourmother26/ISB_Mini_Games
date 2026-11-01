// storage.js — saves things (nickname, high scores, adventure progress) in the phone's browser
window.ISB = window.ISB || {};

ISB.store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('isb_snake_' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('isb_snake_' + key, JSON.stringify(value)); } catch (e) {}
  }
};

ISB.getBest = id => ISB.store.get('best_' + id, 0);

// returns true if this is a new high score
ISB.saveBest = (id, score) => {
  if (score > ISB.getBest(id)) { ISB.store.set('best_' + id, score); return true; }
  return false;
};
