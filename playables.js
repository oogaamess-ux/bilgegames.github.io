// YouTube owns ytgame. Never replace it with a mock in a shipping build.
window.FindTheNPlatform = (() => {
  const sdk = window.ytgame;
  const active = !!(sdk && sdk.IN_PLAYABLES_ENV);
  let data = {version: 1, values: {}};
  let loaded = !active, dirty = false, saving = false, ready = false;
  let paused = false, audio = active ? sdk.system.isAudioEnabled() : true;
  let engine = null;
  const report = error => console.warn('[Playables]', error);
  const platform = {
    active,
    async prepare() {
      if (!sdk) throw new Error('YouTube SDK could not load. Refresh to retry.');
      if (!active) return;
      const raw = await sdk.game.loadData();
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') throw new Error('Invalid cloud save.');
        if (parsed.version === 1 && parsed.values && typeof parsed.values === 'object' && !Array.isArray(parsed.values)) {
          data = parsed;
        } else if (Array.isArray(parsed.highScores)) {
          // Migrate the earlier high-score-only prototype.
          parsed.highScores.slice(0, 3).forEach((score, i) => data.values['HighScore' + i] = String(score));
        } else throw new Error('Unsupported cloud save; existing progress has been preserved.');
      }
      loaded = true;
    },
    get(key, fallback) { return Object.prototype.hasOwnProperty.call(data.values, key) ? String(data.values[key]) : fallback; },
    has(key) { return Object.prototype.hasOwnProperty.call(data.values, key); },
    set(key, value) { if (data.values[key] !== value) { data.values[key] = value; dirty = true; } },
    async save() {
      if (!active || !loaded || !dirty || saving) return;
      saving = true;
      try {
        while (dirty) {
          const snapshot = JSON.stringify(data);
          if (snapshot.length * 2 >= 3 * 1024 * 1024) throw new Error('Cloud save exceeds 3 MiB.');
          dirty = false;
          try { await sdk.game.saveData(snapshot); }
          catch (error) { dirty = true; throw error; }
        }
      } catch (error) { report(error); }
      finally { saving = false; }
    },
    bind(hooks) { engine = hooks; engine.audio(audio); if (paused) engine.pause(); },
    ready() {
      if (ready) return;
      ready = true;
      if (active) sdk.game.gameReady();
    },
    score(value) {
      if (active && Number.isSafeInteger(value) && value >= 0)
        sdk.engagement.sendScore({value}).catch(report);
    }
  };
  if (active) {
    // A visible HTML loading screen is already in the document.
    sdk.game.firstFrameReady();
    sdk.system.onAudioEnabledChange(value => { audio = value; if (engine) engine.audio(value); });
    sdk.system.onPause(() => {
      paused = true;
      void platform.save();
      if (engine) engine.pause();
    });
    sdk.system.onResume(() => {
      paused = false;
      if (engine) engine.resume();
      void platform.save();
    });
  }
  return platform;
})();
