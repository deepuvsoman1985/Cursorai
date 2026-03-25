(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const scoreEl = document.getElementById("score");
  const overlayEl = document.getElementById("overlay");
  const restartBtn = document.getElementById("restartBtn");
  const readyHintEl = document.getElementById("readyHint");

  const ctx = canvas.getContext("2d");

  // ---- Game tuning (feel free to tweak) ----
  const cfg = {
    gravity: 1600, // px/s^2 (lower = slower fall)
    flapVelocity: -560, // px/s
    pipeSpeed: 240, // px/s
    pipeSpawnEvery: 1.45, // seconds
    pipeWidth: 70, // px
    pipeGap: 190, // px (space between top/bottom pipes)
    birdX: 190, // px (fixed horizontal position)
    birdRadius: 18, // px
    groundHeight: 86, // px
    ceilingPad: 10, // px
  };

  const state = {
    time: 0,
    lastTs: 0,
    score: 0,
    best: 0,
    state: "ready", // ready | playing | gameover
    bird: { y: 0, v: 0 },
    pipes: [],
    pipeSpawnT: 0,
    dpr: 1,
    w: 0,
    h: 0,
  };

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  // Minimal, assetless SFX using WebAudio.
  let audioCtx = null;
  function ensureAudio() {
    if (audioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
  }

  function playTone({ freq = 440, dur = 0.06, type = "sine", gain = 0.06 } = {}) {
    ensureAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + dur);
  }

  function setOverlayVisible(visible, titleText, btnText, extraHint) {
    overlayEl.classList.toggle("show", visible);
    if (titleText) overlayEl.querySelector("h1").textContent = titleText;
    if (btnText) restartBtn.textContent = btnText;
    if (extraHint) {
      readyHintEl.textContent = extraHint;
    }
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.max(1, window.devicePixelRatio || 1);
    state.w = Math.floor(rect.width);
    state.h = Math.floor(rect.height);
    canvas.width = Math.floor(state.w * state.dpr);
    canvas.height = Math.floor(state.h * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  function resetGame() {
    state.time = 0;
    state.lastTs = 0;
    state.score = 0;
    state.pipes = [];
    state.pipeSpawnT = 0;

    // Start bird slightly above center.
    const startY = clamp(state.h * 0.45, 140, state.h - cfg.groundHeight - 120);
    state.bird.y = startY;
    state.bird.v = 0;
    state.state = "ready";

    updateScore();
    setOverlayVisible(true, "Falppy Bird", "Start", "Press Space to start");
  }

  function updateScore() {
    scoreEl.textContent = String(state.score);
  }

  function flap() {
    if (state.state === "gameover") {
      resetGame();
    }
    if (state.state === "ready") {
      state.state = "playing";
      setOverlayVisible(false);
    }
    state.bird.v = cfg.flapVelocity;
    playTone({ freq: 520, dur: 0.04, type: "triangle", gain: 0.05 });
  }

  function spawnPipe() {
    const usableH = state.h - cfg.groundHeight - cfg.ceilingPad;
    const minTop = 90;
    const maxTop = Math.max(minTop, usableH - cfg.pipeGap - 90);
    const topH = minTop + Math.random() * (maxTop - minTop);

    state.pipes.push({
      x: state.w + 20,
      topH,
      w: cfg.pipeWidth,
      passed: false,
    });
  }

  function gameOver() {
    if (state.state === "gameover") return;
    state.state = "gameover";
    setOverlayVisible(true, "Game Over", "Restart", "Press Restart or Space");
    playTone({ freq: 180, dur: 0.12, type: "sine", gain: 0.06 });
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function birdAabb() {
    const r = cfg.birdRadius;
    const x = cfg.birdX - r;
    const y = state.bird.y - r;
    return { x, y, w: r * 2, h: r * 2 };
  }

  function update(dt) {
    if (state.state !== "playing") return;

    state.time += dt;

    // Bird physics
    state.bird.v += cfg.gravity * dt;
    state.bird.y += state.bird.v * dt;

    const ceilY = cfg.ceilingPad + cfg.birdRadius;
    const groundY = state.h - cfg.groundHeight - cfg.birdRadius;

    if (state.bird.y < ceilY) {
      state.bird.y = ceilY;
      state.bird.v = 0;
    }
    if (state.bird.y > groundY) {
      state.bird.y = groundY;
      gameOver();
    }

    // Pipes
    state.pipeSpawnT += dt;
    while (state.pipeSpawnT >= cfg.pipeSpawnEvery) {
      state.pipeSpawnT -= cfg.pipeSpawnEvery;
      spawnPipe();
    }

    const speed = cfg.pipeSpeed;
    for (const p of state.pipes) {
      p.x -= speed * dt;

      // Score when pipe passes bird.
      if (!p.passed && p.x + p.w < cfg.birdX) {
        p.passed = true;
        state.score += 1;
        updateScore();
        playTone({ freq: 780, dur: 0.05, type: "square", gain: 0.045 });
      }
    }
    state.pipes = state.pipes.filter((p) => p.x + p.w > -60);

    // Collisions
    const b = birdAabb();
    for (const p of state.pipes) {
      const topRect = { x: p.x, y: 0, w: p.w, h: p.topH };
      const bottomRect = {
        x: p.x,
        y: p.topH + cfg.pipeGap,
        w: p.w,
        h: state.h - cfg.groundHeight - (p.topH + cfg.pipeGap),
      };

      if (rectsOverlap(b.x, b.y, b.w, b.h, topRect.x, topRect.y, topRect.w, topRect.h)) {
        gameOver();
        return;
      }
      if (
        rectsOverlap(b.x, b.y, b.w, b.h, bottomRect.x, bottomRect.y, bottomRect.w, bottomRect.h)
      ) {
        gameOver();
        return;
      }
    }
  }

  function renderBackground() {
    // Background (gradient-ish)
    const g = ctx.createLinearGradient(0, 0, 0, state.h);
    g.addColorStop(0, "rgba(87,211,255,0.20)");
    g.addColorStop(0.45, "rgba(11,18,32,0.25)");
    g.addColorStop(1, "rgba(7,11,22,0.45)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, state.w, state.h);

    // Subtle stars
    ctx.globalAlpha = 0.5;
    const starCount = Math.floor(state.w / 18);
    for (let i = 0; i < starCount; i++) {
      const x = (i * 37) % state.w;
      const y = (i * 91) % Math.floor(state.h * 0.6);
      ctx.fillStyle = i % 3 === 0 ? "rgba(87,211,255,0.35)" : "rgba(233,241,255,0.20)";
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function renderPipes() {
    for (const p of state.pipes) {
      const topY = 0;
      const topH = p.topH;
      const bottomY = p.topH + cfg.pipeGap;
      const bottomH = state.h - cfg.groundHeight - bottomY;

      // Top pipe
      drawPipeSegment(p.x, topY, p.w, topH, true);
      // Bottom pipe
      drawPipeSegment(p.x, bottomY, p.w, bottomH, false);
    }
  }

  function drawPipeSegment(x, y, w, h, isTop) {
    // Pipe body
    ctx.fillStyle = isTop ? "#20d05a" : "#1fd85b";
    ctx.fillRect(x, y, w, h);

    // Inner shade
    ctx.fillStyle = "rgba(20,154,61,0.95)";
    ctx.fillRect(x + w * 0.18, y + 3, w * 0.22, h - 6);

    // Caps
    ctx.fillStyle = "rgba(15,26,51,0.55)";
    ctx.fillRect(x - 2, y - 2, w + 4, 6);
    ctx.fillRect(x - 2, y + h - 4, w + 4, 6);
  }

  function renderGround() {
    const groundTop = state.h - cfg.groundHeight;
    ctx.fillStyle = "#14234a";
    ctx.fillRect(0, groundTop, state.w, cfg.groundHeight);

    // Road stripes
    const t = state.time;
    ctx.fillStyle = "rgba(87,211,255,0.18)";
    const stripeW = 46;
    const offset = ((t * 140) % stripeW) * -1;
    for (let x = offset - stripeW; x < state.w + stripeW; x += stripeW * 2) {
      ctx.fillRect(x, groundTop + 14, stripeW, 10);
    }
  }

  function renderBird() {
    const r = cfg.birdRadius;
    const x = cfg.birdX;
    const y = state.bird.y;

    // Tilt based on velocity.
    const tilt = clamp(state.bird.v / 650, -0.9, 1.1);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt * 0.55);

    // Body
    ctx.fillStyle = "#ffd34d";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Belly highlight
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.arc(-r * 0.2, -r * 0.15, r * 0.55, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = "#0b1220";
    ctx.beginPath();
    ctx.arc(r * 0.35, -r * 0.25, r * 0.22, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = "#ff9f3d";
    ctx.beginPath();
    ctx.moveTo(r * 0.92, 0);
    ctx.lineTo(r * 1.35, r * 0.18);
    ctx.lineTo(r * 0.92, r * 0.35);
    ctx.closePath();
    ctx.fill();

    // Wing
    const flapPhase = state.state === "playing" ? Math.sin(state.time * 14) : 0.0;
    ctx.fillStyle = "rgba(255,255,255,0.17)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.25, r * 0.1, r * 0.55, r * 0.28, -flapPhase * 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function render() {
    renderBackground();
    renderPipes();
    renderBird();
    renderGround();

    // Ceiling line
    ctx.strokeStyle = "rgba(87,211,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(0, cfg.ceilingPad);
    ctx.lineTo(state.w, cfg.ceilingPad);
    ctx.stroke();
  }

  function tick(ts) {
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(0.033, Math.max(0.001, (ts - state.lastTs) / 1000));
    state.lastTs = ts;

    update(dt);
    render();

    requestAnimationFrame(tick);
  }

  function onPrimaryAction(e) {
    // Only prevent default for keyboard/space-like events.
    if (e && e.type === "keydown" && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    flap();
  }

  // Controls: click/tap, space, enter.
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "Enter") onPrimaryAction(e);
    if (e.code === "KeyR") {
      // Hard reset from game over or ready.
      resetGame();
    }
  });
  canvas.addEventListener("pointerdown", () => onPrimaryAction());
  restartBtn.addEventListener("click", () => onPrimaryAction());

  // Resize handling
  resizeCanvas();
  window.addEventListener("resize", () => {
    resizeCanvas();
    // Keep bird within bounds after resize.
    const groundY = state.h - cfg.groundHeight - cfg.birdRadius;
    state.bird.y = clamp(state.bird.y, cfg.ceilingPad + cfg.birdRadius, groundY);
  });

  // Boot
  resetGame();
  requestAnimationFrame(tick);
})();

