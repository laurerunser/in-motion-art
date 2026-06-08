/* ============================================================
   art-fields.js  —  generative "motion field" stills
   Luminous cream-on-black fields, one per work, each tuned to
   its piece (flow / fall / wave / force / blob / noise /
   trajectory / branch / neural / orbit). A single shared rAF
   drives only canvases currently in view; idle + reduced-motion
   render a single static frame.
   ============================================================ */
(function () {
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const INK = '232,224,205';            // cream, used as rgba(INK, a)
  const registry = [];
  let docHidden = false;

  /* ---- cheap layered value-noise (good enough for flow fields) ---- */
  function noise(x, y, t) {
    return (
      Math.sin(x * 1.7 + t) +
      Math.sin(y * 1.3 - t * 0.8) +
      Math.sin((x + y) * 0.9 + t * 0.5) +
      Math.sin((x - y) * 1.1 - t * 0.35)
    ) / 4; // -1..1
  }
  // seeded RNG (mulberry32)
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Field {
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.mode = opts.mode || 'flow';
      this.params = opts.params || {};
      this.rand = rng((opts.seed || 1) * 2654435761 % 2147483647);
      this.hot = 0;          // 0..1 hover intensity (eased)
      this.hotTarget = 0;
      this.visible = false;
      this.t = 0;
      this.W = 0; this.H = 0; this.dpr = 1;
      this.parts = [];
      this.nodes = null;
      this.resize();
      this.seedParts();
      this.prime();
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(canvas);
      registry.push(this);
    }

    /* compose an initial frame so the card is never blank, even before the
       rAF loop activates it (and as the full static frame under reduced-motion). */
    prime() {
      const k = REDUCED ? 90 : 38;
      const wasV = this.visible, h = this.hot, ht = this.hotTarget;
      this.visible = true; this.hot = 0; this.hotTarget = 0;
      for (let i = 0; i < k; i++) this.step(0.033);
      this.hot = h; this.hotTarget = ht; this.visible = wasV;
      this._primed = true;
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(2, Math.round(r.width));
      const h = Math.max(2, Math.round(r.height));
      if (w === this.W && h === this.H && dpr === this.dpr) return;
      this.W = w; this.H = h; this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this.nodes) this.buildNodes();
      if (this._primed) this.prime();
    }

    seedParts() {
      const R = this.rand, W = this.W, H = this.H;
      const n = this.mode === 'neural' || this.mode === 'branch' ? 0
        : this.mode === 'flow' || this.mode === 'wake' || this.mode === 'stream' ? 150
        : this.mode === 'fall' ? 150
        : this.mode === 'flutter' ? 150
        : this.mode === 'noise' ? 220
        : this.mode === 'orbit' || this.mode === 'trajectory' ? 70
        : this.mode === 'force' ? 60
        : this.mode === 'wave' ? 0
        : this.mode === 'blob' ? 0
        : 120;
      this.parts = [];
      for (let i = 0; i < n; i++) {
        this.parts.push({
          x: R() * W, y: R() * H,
          px: 0, py: 0,
          vx: 0, vy: 0,
          a: R() * Math.PI * 2,
          sp: 0.4 + R() * 0.9,
          life: R(),
          seed: R() * 1000,
          ph: R() * Math.PI * 2,
        });
      }
      if (this.mode === 'neural') this.buildNodes();
    }

    buildNodes() {
      const R = this.rand, W = this.W, H = this.H;
      const N = 16;
      const nodes = [];
      for (let i = 0; i < N; i++) {
        nodes.push({ x: 0.08 * W + R() * 0.84 * W, y: 0.1 * H + R() * 0.8 * H, r: 1.2 + R() * 1.8, ph: R() * 6.28 });
      }
      // edges: connect to a few nearest
      const edges = [];
      for (let i = 0; i < N; i++) {
        const d = [];
        for (let j = 0; j < N; j++) if (j !== i) d.push([j, Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y)]);
        d.sort((p, q) => p[1] - q[1]);
        const k = 2 + Math.floor(R() * 2);
        for (let m = 0; m < k; m++) {
          const j = d[m][0];
          if (i < j) edges.push({ a: i, b: j, off: R() }); else edges.push({ a: j, b: i, off: R() });
        }
      }
      this.nodes = nodes; this.edges = edges;
    }

    setHot(v) { this.hotTarget = v ? 1 : 0; }

    /* advance + draw one frame. dt in seconds. */
    step(dt) {
      this.hot += (this.hotTarget - this.hot) * Math.min(1, dt * 6);
      const ease = this.hot;
      this.t += dt * (0.5 + ease * 0.5);
      const ctx = this.ctx, W = this.W, H = this.H, t = this.t;

      // fade previous frame (motion trails). Flow-type fields keep a longer
      // trail so streamlines accumulate and read; structural fields fade faster.
      const longTrail = (this.mode === 'flow' || this.mode === 'stream' ||
        this.mode === 'wake' || this.mode === 'trajectory' || this.mode === 'orbit');
      const fade = longTrail ? 0.055 : 0.12;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(8,8,9,' + (fade - ease * 0.02) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      const mul = ({ flow: 2.4, stream: 2.4, wake: 2.2, trajectory: 3.4,
        flutter: 2.3, noise: 1.6 })[this.mode] || 1;
      const baseA = (0.085 + ease * 0.09) * mul;
      switch (this.mode) {
        case 'flow': case 'stream': case 'wake': this.drawFlow(ctx, W, H, t, baseA); break;
        case 'fall': this.drawFall(ctx, W, H, t, baseA); break;
        case 'flutter': this.drawFlutter(ctx, W, H, t, baseA); break;
        case 'noise': this.drawNoise(ctx, W, H, t, baseA); break;
        case 'orbit': case 'trajectory': this.drawTraj(ctx, W, H, t, baseA); break;
        case 'force': this.drawForce(ctx, W, H, t, baseA); break;
        case 'wave': this.drawWave(ctx, W, H, t, baseA); break;
        case 'blob': this.drawBlob(ctx, W, H, t, baseA); break;
        case 'neural': this.drawNeural(ctx, W, H, t, baseA); break;
        case 'branch': this.drawBranch(ctx, W, H, t, baseA); break;
        default: this.drawFlow(ctx, W, H, t, baseA);
      }
    }

    drawFlow(ctx, W, H, t, baseA) {
      const sc = 1 / Math.max(W, H);
      const bias = this.params.bias;        // {x,y} added angle pull
      const src = this.params.source;        // emit from left edge
      const downBias = this.mode === 'stream' ? 0.9 : 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + INK + ',' + baseA + ')';
      for (const p of this.parts) {
        let ang = noise(p.x * sc * 3, p.y * sc * 3, t * 0.25 + p.seed * 0.001) * Math.PI * 1.6;
        if (bias) ang = ang * (1 - 0.5) + Math.atan2(bias.y, bias.x) * 0.5;
        if (downBias) ang = ang * (1 - downBias) + (Math.PI / 2) * downBias;
        p.px = p.x; p.py = p.y;
        const sp = p.sp * (0.7 + this.hot * 0.8) * 1.4;
        p.x += Math.cos(ang) * sp;
        p.y += Math.sin(ang) * sp + downBias * sp * 0.6;
        if (p.x < -4 || p.x > W + 4 || p.y < -4 || p.y > H + 4 || Math.random() < 0.004) {
          if (src) { p.x = -2; p.y = Math.random() * H; }
          else if (downBias) { p.x = Math.random() * W; p.y = -2; }
          else { p.x = Math.random() * W; p.y = Math.random() * H; }
          p.px = p.x; p.py = p.y;
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      // wake: a small bright source gliding through the field, leaving the
      // flow streaks as its wake (kept tiny so it doesn't flood the frame)
      if (this.mode === 'wake') {
        const cx = W * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.3)));
        const cy = H * (0.5 + 0.25 * Math.sin(t * 0.21 + 1));
        const rr = Math.max(2, W * 0.013);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr * 3);
        g.addColorStop(0, 'rgba(' + INK + ',' + (0.6 + this.hot * 0.3) + ')');
        g.addColorStop(1, 'rgba(' + INK + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, rr * 3, 0, 6.29); ctx.fill();
      }
    }

    drawFall(ctx, W, H, t, baseA) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + INK + ',' + baseA + ')';
      for (const p of this.parts) {
        p.px = p.x; p.py = p.y;
        const drift = Math.sin(t * 0.6 + p.seed) * 0.5;
        p.y += (0.7 + p.sp * 1.4) * (0.8 + this.hot * 0.9);
        p.x += drift;
        if (p.y > H + 4) { p.y = -4; p.x = Math.random() * W; p.px = p.x; p.py = p.y; continue; }
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y + 2 + p.sp * 3);
        ctx.stroke();
      }
    }

    drawFlutter(ctx, W, H, t, baseA) {
      ctx.fillStyle = 'rgba(' + INK + ',' + (baseA + 0.05) + ')';
      for (const p of this.parts) {
        const fl = Math.sin(t * 2.4 + p.ph) * (1.4 + this.hot * 1.6);
        p.x += Math.cos(p.a) * 0.3 + fl * 0.4;
        p.y += Math.sin(p.a) * 0.3 + Math.cos(t * 1.7 + p.ph) * 0.6;
        p.a += (noise(p.x * 0.01, p.y * 0.01, t * 0.4)) * 0.3;
        if (p.x < -6) p.x = W + 6; if (p.x > W + 6) p.x = -6;
        if (p.y < -6) p.y = H + 6; if (p.y > H + 6) p.y = -6;
        const s = 1.3 + Math.abs(fl) * 0.6;
        ctx.fillRect(p.x, p.y, s, s * 0.55);
      }
    }

    drawNoise(ctx, W, H, t, baseA) {
      for (const p of this.parts) {
        p.x += (this.rand() - 0.5) * 6 * (0.5 + this.hot);
        p.y += (this.rand() - 0.5) * 6 * (0.5 + this.hot);
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        const flick = 0.5 + 0.5 * Math.sin(t * 9 + p.seed);
        ctx.fillStyle = 'rgba(' + INK + ',' + (baseA * (0.4 + flick)) + ')';
        ctx.fillRect(p.x, p.y, 1.3, 1.3);
      }
    }

    drawTraj(ctx, W, H, t, baseA) {
      const orbit = this.mode === 'orbit';
      ctx.lineWidth = 1;
      for (const p of this.parts) {
        p.px = p.x; p.py = p.y;
        if (orbit) {
          const cx = W * 0.5, cy = H * 0.5;
          p.a += (0.004 + p.sp * 0.006) * (0.6 + this.hot * 0.8);
          const rad = (0.12 + (p.seed % 0.4)) * Math.min(W, H) + p.life * Math.min(W, H) * 0.35;
          p.x = cx + Math.cos(p.a * (1 + p.life)) * rad;
          p.y = cy + Math.sin(p.a * (1 + p.life)) * rad * 0.7;
        } else {
          // parabolic launches
          p.life += 0.01 * (0.6 + this.hot * 0.8);
          if (p.life > 1) { p.life = 0; p.x = W * (0.1 + this.rand() * 0.2); p.y = H * 0.9; p.vx = (0.4 + this.rand()) * 2.2; p.vy = -(2 + this.rand() * 2); p.px = p.x; p.py = p.y; continue; }
          p.x += p.vx; p.vy += 0.06; p.y += p.vy;
        }
        const a = baseA * (orbit ? 1 : (1 - p.life));
        ctx.strokeStyle = 'rgba(' + INK + ',' + a + ')';
        ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
    }

    drawForce(ctx, W, H, t, baseA) {
      // grid of slowly rotating vectors
      const cols = 9, rows = 5;
      const gw = W / cols, gh = H / rows;
      ctx.lineWidth = 1;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const x = (i + 0.5) * gw, y = (j + 0.5) * gh;
        const ang = noise(x / W * 3, y / H * 3, t * 0.3) * Math.PI * 2;
        const len = (Math.min(gw, gh) * 0.42) * (0.6 + 0.4 * Math.sin(t + i + j));
        const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
        ctx.strokeStyle = 'rgba(' + INK + ',' + (baseA + 0.03) + ')';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
        // arrowhead
        const ah = 3 + this.hot * 2;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(ang - 0.4) * ah, ey - Math.sin(ang - 0.4) * ah);
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(ang + 0.4) * ah, ey - Math.sin(ang + 0.4) * ah);
        ctx.stroke();
      }
      // a free particle obeying the field
      const p = this.parts[0];
      if (p) {
        const ang = noise(p.x / W * 3, p.y / H * 3, t * 0.3) * Math.PI * 2;
        p.vx += Math.cos(ang) * 0.15; p.vy += Math.sin(ang) * 0.15;
        p.vx *= 0.96; p.vy *= 0.96; p.px = p.x; p.py = p.y; p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) { p.x = W / 2; p.y = H / 2; p.vx = p.vy = 0; }
        ctx.strokeStyle = 'rgba(' + INK + ',' + (0.4 + this.hot * 0.3) + ')';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
    }

    drawWave(ctx, W, H, t, baseA) {
      ctx.lineWidth = 1;
      const sx = W * 0.5, sy = H * 0.5;
      const rings = 7;
      for (let r = 0; r < rings; r++) {
        const phase = (t * 0.5 + r / rings) % 1;
        const rad = phase * Math.hypot(W, H) * 0.6;
        const a = baseA * (1 - phase) * 1.6;
        ctx.strokeStyle = 'rgba(' + INK + ',' + a + ')';
        ctx.beginPath();
        ctx.ellipse(sx, sy, rad, rad * 0.82, 0, 0, 6.29);
        ctx.stroke();
      }
      // travelling sine across
      ctx.strokeStyle = 'rgba(' + INK + ',' + (baseA + 0.05) + ')';
      ctx.beginPath();
      for (let x = 0; x <= W; x += 4) {
        const y = sy + Math.sin(x * 0.03 - t * 2.4) * H * 0.16 * (0.7 + this.hot * 0.5);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    drawBlob(ctx, W, H, t, baseA) {
      const cx = W * 0.5, cy = H * 0.5;
      const R0 = Math.min(W, H) * (0.22 + this.hot * 0.03);
      ctx.lineWidth = 1.2;
      // a few nested wobbling contours
      for (let layer = 0; layer < 3; layer++) {
        ctx.strokeStyle = 'rgba(' + INK + ',' + (baseA + 0.02 - layer * 0.012) + ')';
        ctx.beginPath();
        const seg = 60;
        for (let i = 0; i <= seg; i++) {
          const ang = (i / seg) * Math.PI * 2;
          const wob = 1
            + 0.28 * Math.sin(ang * 3 + t * 0.9 + layer)
            + 0.18 * Math.sin(ang * 5 - t * 1.3 + layer * 2)
            + 0.12 * Math.sin(ang * 8 + t * 0.6);
          const rad = R0 * (1 + layer * 0.16) * wob;
          const x = cx + Math.cos(ang) * rad;
          const y = cy + Math.sin(ang) * rad * 0.92;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    drawNeural(ctx, W, H, t, baseA) {
      const ns = this.nodes, es = this.edges;
      if (!ns) return;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + INK + ',' + (baseA * 0.8) + ')';
      for (const e of es) {
        const a = ns[e.a], b = ns[e.b];
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        // travelling pulse
        const ph = (t * (0.25 + this.hot * 0.25) + e.off) % 1;
        const px = a.x + (b.x - a.x) * ph, py = a.y + (b.y - a.y) * ph;
        ctx.fillStyle = 'rgba(' + INK + ',' + (0.5 + this.hot * 0.3) + ')';
        ctx.beginPath(); ctx.arc(px, py, 1.3, 0, 6.29); ctx.fill();
      }
      for (const nd of ns) {
        const pulse = 0.6 + 0.4 * Math.sin(t * 1.6 + nd.ph);
        ctx.fillStyle = 'rgba(' + INK + ',' + (baseA + 0.06) + ')';
        ctx.beginPath(); ctx.arc(nd.x, nd.y, nd.r * (0.8 + pulse * 0.5), 0, 6.29); ctx.fill();
      }
    }

    drawBranch(ctx, W, H, t, baseA) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + INK + ',' + (baseA + 0.03) + ')';
      const grow = 0.5 + 0.5 * Math.sin(t * 0.4);
      const depth = 7;
      const R = rng(99); // stable shape
      const self = this;
      function branch(x, y, ang, len, d) {
        if (d > depth || len < 2) return;
        const sway = Math.sin(t * 0.8 + d) * 0.06 * (1 + self.hot);
        const ex = x + Math.cos(ang + sway) * len * grow;
        const ey = y - Math.sin(ang + sway) * len * grow;
        ctx.globalAlpha = Math.max(0, 1 - d / depth);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
        const spread = 0.35 + R() * 0.2;
        branch(ex, ey, ang + spread, len * 0.72, d + 1);
        branch(ex, ey, ang - spread, len * 0.72, d + 1);
      }
      branch(W * 0.5, H, Math.PI / 2, H * 0.26, 0);
      ctx.globalAlpha = 1;
    }
  }

  /* ---- shared loop: only step visible canvases ---- */
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!docHidden && !REDUCED) {
      for (const f of registry) if (f.visible) f.step(dt);
    }
    requestAnimationFrame(loop);
  }
  if (!REDUCED) requestAnimationFrame(loop);

  document.addEventListener('visibilitychange', () => { docHidden = document.hidden; last = performance.now(); });

  /* ---- public API ---- */
  window.ArtField = {
    create(canvas, opts) { return new Field(canvas, opts || {}); },
    observe(field) {
      const io = new IntersectionObserver((es) => {
        es.forEach((e) => { field.visible = e.isIntersecting; });
      }, { rootMargin: '120px', threshold: 0.01 });
      io.observe(field.canvas);
      return io;
    },
  };
})();
