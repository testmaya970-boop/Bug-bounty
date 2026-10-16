// QA swarm: a cloud of tiny black nanobots that live on top of the page during headed E2E runs.
//   * the swarm streams after the test's cursor, wearing a detective's hat;
//   * when the test clicks or types, the bots snap into a machine gun and fire a burst at the
//     element being checked, then re-form as a magnifying glass around it with a case label;
//   * when a test fails, they build a cannon, barrage the last element the test touched and
//     shatter the page, so whoever is watching sees exactly where it broke.
// Injected by e2e/qa-test.ts with context.addInitScript: it exists only inside the test browser
// (never in the product, never headless/CI) and costs no tokens -- it is plain browser code.
// One canvas plus a shadow root, all pointer-events: none, so it can't change what a test does.
(() => {
  if (window.top !== window || window.__qaDrone) return;
  const STORE = "qa-swarm-anchor";
  const N = 64;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let anchor = { x: 120, y: 140 };
  try { anchor = JSON.parse(sessionStorage.getItem(STORE)) ?? anchor; } catch {}

  let host, root, layer, canvas, ctx, dpr = 1;
  let lastTarget = null, mode = "cloud", modeUntil = 0, focus = null, aim = null, caseNo = 0, label = null;
  const bots = Array.from({ length: N }, (_, i) => ({ x: anchor.x + Math.random() * 40, y: anchor.y + Math.random() * 40, vx: 0, vy: 0, i, phase: Math.random() * Math.PI * 2 }));
  const bullets = [], sparks = [];

  const CSS = `
    :host { all: initial; }
    .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; overflow: hidden; }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
    .case { position: absolute; font: 700 11px/1.3 ui-monospace, Consolas, monospace; color: #e6f7ff; background: rgba(8,10,14,.88);
      border: 1px solid #39c6ff; border-radius: 4px; padding: 4px 7px; letter-spacing: .06em; white-space: nowrap; max-width: 60vw; overflow: hidden; text-overflow: ellipsis;
      box-shadow: 0 0 12px rgba(57,198,255,.35); animation: pop 220ms cubic-bezier(.2,1.4,.4,1) both; }
    .case b { color: #ffd166; font-weight: 800; }
    @keyframes pop { from { opacity: 0; translate: 0 6px; } to { opacity: 1; translate: 0 0; } }
    .reticle { position: absolute; border: 2px solid #ff2d2d; border-radius: 6px; box-shadow: 0 0 0 9999px rgba(255,0,0,.06), 0 0 18px #ff2d2d;
      animation: lock 520ms cubic-bezier(.2,.9,.3,1) both; }
    .reticle::before, .reticle::after { content: ""; position: absolute; background: #ff2d2d; opacity: .7; }
    .reticle::before { left: 50%; top: -14px; bottom: -14px; width: 2px; translate: -1px 0; }
    .reticle::after { top: 50%; left: -14px; right: -14px; height: 2px; translate: 0 -1px; }
    @keyframes lock { from { opacity: 0; scale: 2.2; rotate: 45deg; } to { opacity: 1; scale: 1; rotate: 0deg; } }
    .boom { position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%;
      background: radial-gradient(circle, #fff 0%, #ffd166 30%, #ff6b1a 60%, rgba(255,40,0,0) 72%); animation: boom 650ms ease-out both; }
    @keyframes boom { from { scale: 1; opacity: 1; } to { scale: 26; opacity: 0; } }
    .ring { position: absolute; width: 20px; height: 20px; margin: -10px 0 0 -10px; border-radius: 50%; border: 3px solid #ffb703; animation: ring 700ms ease-out both; }
    @keyframes ring { from { scale: 1; opacity: 1; } to { scale: 18; opacity: 0; } }
    .scorch { position: absolute; border-radius: 10px; mix-blend-mode: multiply;
      background: radial-gradient(ellipse at center, rgba(20,8,0,.85) 0%, rgba(60,20,0,.55) 35%, rgba(90,30,0,.18) 60%, rgba(0,0,0,0) 75%); animation: pop 400ms ease-out both; }
    .crack { position: absolute; overflow: visible; } .crack svg { overflow: visible; }
    .banner { position: absolute; left: 50%; top: 18px; translate: -50% 0; max-width: min(92vw, 640px);
      font: 800 13px/1.35 ui-monospace, Consolas, monospace; color: #fff; background: #b00000; border: 2px solid #ffd166;
      padding: 8px 12px; border-radius: 6px; letter-spacing: .04em; box-shadow: 0 8px 30px rgba(176,0,0,.5); animation: pop 420ms cubic-bezier(.2,1.4,.4,1) both; }
  `;

  function mount() {
    if (host || !document.documentElement) return;
    host = document.createElement("qa-swarm");
    root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${CSS}</style><div class="layer"><canvas></canvas></div>`;
    document.documentElement.appendChild(host);
    layer = root.querySelector(".layer");
    canvas = root.querySelector("canvas");
    ctx = canvas.getContext("2d");
    resize();
    addEventListener("resize", resize);
    requestAnimationFrame(tick);
  }
  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  }
  const clampX = (x) => Math.max(20, Math.min(innerWidth - 20, x));
  const clampY = (y) => Math.max(20, Math.min(innerHeight - 20, y));
  function setAnchor(x, y) {
    anchor = { x: clampX(x), y: clampY(y) };
    try { sessionStorage.setItem(STORE, JSON.stringify(anchor)); } catch {}
  }
  const lensRadius = (f) => Math.min(110, Math.max(26, Math.hypot(f.w, f.h) / 2 + 10));

  // --- Formations: where bot i wants to be this frame -------------------------------------
  function slot(b, t) {
    const i = b.i;
    if ((mode === "gun" || mode === "cannon") && aim) {
      const a = Math.atan2(aim.y - anchor.y, aim.x - anchor.x), c = Math.cos(a), s = Math.sin(a);
      let lx, ly;
      if (mode === "cannon") { lx = (i % 16) * 4.2 - 20; ly = (Math.floor(i / 16) - 1.5) * 5.5; }
      else if (i < 28) { lx = -10 + i * 3.1; ly = (i % 2) * 3 - 1.5; } // barrel
      else if (i < 46) { const k = i - 28; lx = -26 + (k % 6) * 4; ly = -6 + Math.floor(k / 6) * 5; } // receiver
      else { const k = i - 46; lx = 2 + (k % 3) * 4; ly = 6 + Math.floor(k / 3) * 4; } // magazine
      lx *= 1.35; ly *= 1.35;
      return { x: anchor.x + lx * c - ly * s, y: anchor.y + lx * s + ly * c };
    }
    if (mode === "lens" && focus) {
      const r = lensRadius(focus);
      if (i < 48) { const a = (i / 48) * Math.PI * 2 + t * 0.0015; return { x: focus.cx + Math.cos(a) * r, y: focus.cy + Math.sin(a) * r }; }
      const k = i - 48, d = r + 6 + k * 4.2; // handle
      return { x: focus.cx + Math.cos(Math.PI / 4) * d + (k % 2) * 3, y: focus.cy + Math.sin(Math.PI / 4) * d };
    }
    // Idle cloud: bots orbit the anchor in loose shells.
    const shell = 14 + (i % 4) * 9, a = b.phase + t * (0.0012 + (i % 5) * 0.0002) * (i % 2 ? 1 : -1);
    return { x: anchor.x + Math.cos(a) * shell, y: anchor.y + Math.sin(a * 1.3) * shell * 0.7 };
  }

  function tick(t) {
    requestAnimationFrame(tick);
    if ((mode === "gun" || mode === "lens") && t > modeUntil) { mode = "cloud"; label?.remove(); label = null; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    if (mode === "lens" && focus) {
      const r = lensRadius(focus);
      ctx.fillStyle = "rgba(120,210,255,0.10)"; ctx.beginPath(); ctx.arc(focus.cx, focus.cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(focus.cx, focus.cy, r * 0.72, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
      const sy = focus.cy - r + ((t / 6) % (2 * r)); // scan line sweeping the lens
      const half = Math.sqrt(Math.max(0, r * r - (sy - focus.cy) ** 2));
      ctx.strokeStyle = "rgba(57,198,255,0.8)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(focus.cx - half, sy); ctx.lineTo(focus.cx + half, sy); ctx.stroke();
    }

    const k = reduce ? 1 : 0.16, damp = 0.72;
    for (const b of bots) {
      const s = slot(b, t);
      b.vx = (b.vx + (s.x - b.x) * k) * damp;
      b.vy = (b.vy + (s.y - b.y) * k) * damp;
      b.x += b.vx; b.y += b.vy;
      ctx.fillStyle = "#0b0d12"; ctx.fillRect(b.x - 4, b.y - 3, 8, 6);
      ctx.fillStyle = "#2b303b"; ctx.fillRect(b.x - 4, b.y - 3, 8, 1.6);
      ctx.fillStyle = mode === "cannon" ? "#ff3b3b" : "#39c6ff"; ctx.fillRect(b.x + 0.8, b.y - 0.6, 2.2, 1.8);
    }

    if (mode === "cloud") { // the detective's hat
      const hx = anchor.x, hy = anchor.y - 46;
      ctx.fillStyle = "#3a2c1d"; ctx.beginPath(); ctx.ellipse(hx, hy + 8, 18, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#4a3824"; ctx.beginPath(); ctx.moveTo(hx - 11, hy + 7); ctx.quadraticCurveTo(hx - 10, hy - 6, hx, hy - 4); ctx.quadraticCurveTo(hx + 10, hy - 6, hx + 11, hy + 7); ctx.fill();
      ctx.fillStyle = "#1e1710"; ctx.fillRect(hx - 11, hy + 3, 22, 3);
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
      const u = bullets[i];
      u.x += u.vx; u.y += u.vy; u.life--;
      ctx.strokeStyle = u.heavy ? "#ff9f1c" : "#ffe08a"; ctx.lineWidth = u.heavy ? 3.5 : 2;
      ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(u.x - u.vx * 2.2, u.y - u.vy * 2.2); ctx.stroke();
      if (u.life <= 0) {
        bullets.splice(i, 1);
        for (let j = 0; j < (u.heavy ? 8 : 4); j++) sparks.push({ x: u.x, y: u.y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.8) * 5, life: 14 + Math.random() * 10 });
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.life--;
      ctx.fillStyle = `rgba(255,${150 + Math.floor(p.life * 4)},60,${Math.min(1, p.life / 12)})`;
      ctx.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4);
      if (p.life <= 0) sparks.splice(i, 1);
    }
  }

  // --- What the test is doing -----------------------------------------------------------
  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, r };
  }
  function describe(el) {
    const role = el.getAttribute("role") || el.tagName.toLowerCase();
    const name = (el.getAttribute("aria-label") || el.labels?.[0]?.textContent || el.placeholder || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return name ? `${role} "${name}"` : role;
  }
  function fireBurst(from, to, n, heavy) {
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const jx = to.x + (Math.random() - 0.5) * Math.min(40, (focus?.w ?? 40) * 0.6);
        const jy = to.y + (Math.random() - 0.5) * Math.min(16, (focus?.h ?? 16) * 0.6);
        const dx = jx - from.x, dy = jy - from.y, d = Math.hypot(dx, dy) || 1, sp = heavy ? 22 : 26;
        bullets.push({ x: from.x, y: from.y, vx: (dx / d) * sp, vy: (dy / d) * sp, life: Math.max(1, Math.round(d / sp)), heavy });
      }, i * (heavy ? 70 : 45));
    }
  }
  function muzzle() {
    const a = Math.atan2(aim.y - anchor.y, aim.x - anchor.x);
    return { x: anchor.x + Math.cos(a) * 105, y: anchor.y + Math.sin(a) * 105 };
  }

  function check(el, verb) {
    if (!(el instanceof Element) || reduce || mode === "cannon") return;
    mount();
    lastTarget = el;
    focus = rectOf(el);
    aim = { x: focus.cx, y: focus.cy };
    const side = focus.cx > innerWidth / 2 ? -1 : 1;
    setAnchor(focus.cx + side * Math.min(200, innerWidth / 4), focus.cy - 60);
    mode = "gun"; modeUntil = performance.now() + 900;
    setTimeout(() => fireBurst(muzzle(), aim, 10, false), 260);
    setTimeout(() => {
      if (!lastTarget?.isConnected || mode === "cannon") return;
      focus = rectOf(lastTarget);
      mode = "lens"; modeUntil = performance.now() + 1100;
      label?.remove();
      label = document.createElement("div");
      label.className = "case";
      const tag = document.createElement("b");
      tag.textContent = `CASE #${++caseNo}`;
      label.append(tag, ` ${verb}: ${describe(lastTarget)}`);
      Object.assign(label.style, { left: `${Math.max(8, Math.min(innerWidth - 260, focus.r.left))}px`, top: `${Math.max(8, focus.r.top - 30)}px` });
      layer.appendChild(label);
    }, 900);
  }

  let followPending = 0;
  addEventListener("mousemove", (e) => {
    mount();
    if (mode !== "cloud") return;
    cancelAnimationFrame(followPending);
    followPending = requestAnimationFrame(() => setAnchor(e.clientX + (e.clientX > innerWidth - 160 ? -70 : 70), e.clientY - 50));
  }, { capture: true, passive: true });
  addEventListener("pointerdown", (e) => check(e.target, "checking"), true);
  addEventListener("input", (e) => { if (mode === "cloud") check(e.target, "testing input"); }, true);
  addEventListener("focusin", (e) => { if (e.target instanceof Element) lastTarget = e.target; }, true);

  // --- Failure: cannon, barrage, destruction --------------------------------------------
  const fx = (cls, css) => { const el = document.createElement("div"); el.className = cls; Object.assign(el.style, css); layer.appendChild(el); return el; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function crackSvg(w, h) {
    const cx = w / 2, cy = h / 2, lines = [];
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI * 2 * i) / 10 + Math.random() * 0.4, len = Math.max(w, h) * (0.35 + Math.random() * 0.4);
      let d = `M${cx} ${cy}`;
      for (let s = 1; s <= 4; s++) d += ` L${(cx + (Math.cos(a + (Math.random() - 0.5) * 0.5) * len * s) / 4).toFixed(1)} ${(cy + (Math.sin(a + (Math.random() - 0.5) * 0.5) * len * s) / 4).toFixed(1)}`;
      lines.push(`<path d="${d}" stroke="#1a0a00" stroke-width="${(2.4 - i * 0.15).toFixed(2)}" fill="none" stroke-linecap="round"/>`);
    }
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${lines.join("")}</svg>`;
  }

  async function strike(text) {
    mount();
    label?.remove(); label = null;
    let el = lastTarget && lastTarget.isConnected ? lastTarget : document.querySelector("main") ?? document.body;
    let f = rectOf(el);
    if (f.w === 0 || f.r.bottom < 0 || f.r.top > innerHeight) { el.scrollIntoView?.({ block: "center" }); await wait(250); f = rectOf(el); }
    if (f.w === 0) f = { cx: innerWidth / 2, cy: innerHeight / 2, w: 120, h: 60, r: { left: innerWidth / 2 - 60, top: innerHeight / 2 - 30, width: 120, height: 60 } };
    focus = f;
    aim = { x: f.cx, y: f.cy };
    setAnchor(f.cx < innerWidth / 2 ? f.cx + Math.min(280, innerWidth / 3) : f.cx - Math.min(280, innerWidth / 3), Math.max(60, f.cy - 170));
    mode = "cannon";
    fx("reticle", { left: `${f.r.left - 6}px`, top: `${f.r.top - 6}px`, width: `${f.r.width + 12}px`, height: `${f.r.height + 12}px` });
    await wait(900);
    fireBurst(muzzle(), aim, 18, true);
    await wait(18 * 70 + 200);

    fx("boom", { left: `${f.cx}px`, top: `${f.cy}px` });
    fx("ring", { left: `${f.cx}px`, top: `${f.cy}px` });
    const w = Math.max(80, f.w + 40), h = Math.max(60, f.h + 40);
    fx("scorch", { left: `${f.cx - w / 2}px`, top: `${f.cy - h / 2}px`, width: `${w}px`, height: `${h}px` });
    fx("crack", { left: `${f.cx - w}px`, top: `${f.cy - h}px`, width: `${w * 2}px`, height: `${h * 2}px` }).innerHTML = crackSvg(w * 2, h * 2);
    for (let j = 0; j < 40; j++) sparks.push({ x: f.cx, y: f.cy, vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.7) * 12, life: 30 + Math.random() * 20 });
    try {
      el.animate([{ transform: "none", filter: "none" }, { transform: "translate(6px,-4px) rotate(-3deg)", filter: "sepia(1) saturate(3) brightness(.6)" }, { transform: "translate(-4px,10px) rotate(4deg)", filter: "sepia(1) saturate(4) brightness(.45) blur(.6px)" }], { duration: 900, fill: "forwards", easing: "ease-out" });
      document.documentElement.animate([{ transform: "translate(0,0)" }, { transform: "translate(-9px,5px)" }, { transform: "translate(8px,-6px)" }, { transform: "translate(-5px,3px)" }, { transform: "translate(0,0)" }], { duration: 420 });
    } catch {}
    fx("banner", {}).textContent = `BUG FOUND: ${text ?? "test failed"}`;
    await wait(2200);
  }

  window.__qaDrone = { strike };
  if (document.readyState !== "loading") mount(); else addEventListener("DOMContentLoaded", mount, { once: true });
})();
