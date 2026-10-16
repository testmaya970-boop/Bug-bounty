// QA drone: an animated armored sentinel that flies after the test's cursor during headed
// E2E runs and, when a test fails, locks on to the last thing the test touched and blasts it.
// Injected by e2e/qa-test.ts with context.addInitScript, so it exists only inside the test
// browser: never in the product, never in headless/CI runs, and it costs no tokens -- it is
// plain browser code. Everything lives in a closed-off shadow root with pointer-events: none,
// so it can't change what the test clicks or reads.
(() => {
  if (window.top !== window || window.__qaDrone) return;
  const STORE = "qa-drone-pos";
  let pos = { x: 80, y: 120 };
  try { pos = JSON.parse(sessionStorage.getItem(STORE)) ?? pos; } catch {}
  let lastTarget = null;
  let host, drone, root;

  const CSS = `
    :host { all: initial; }
    .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; overflow: hidden; }
    .drone { position: absolute; left: 0; top: 0; width: 90px; height: 112px; will-change: transform;
      transition: transform 700ms cubic-bezier(.22,.9,.3,1); filter: drop-shadow(0 6px 10px rgba(0,0,0,.35)); }
    .bob { animation: bob 1.6s ease-in-out infinite; transform-origin: 50% 50%; }
    @keyframes bob { 0%,100% { translate: 0 0; } 50% { translate: 0 -6px; } }
    .flame { animation: flame 120ms linear infinite alternate; transform-origin: 50% 0; }
    @keyframes flame { from { transform: scaleY(.75); opacity: .75; } to { transform: scaleY(1.15); opacity: 1; } }
    .core { animation: core 1.4s ease-in-out infinite; }
    @keyframes core { 0%,100% { opacity: .75; } 50% { opacity: 1; } }
    .charging .core { animation: charge 160ms linear infinite; }
    @keyframes charge { 0%,100% { opacity: .5; } 50% { opacity: 1; } }
    .boot { animation: boot 900ms cubic-bezier(.2,1.4,.4,1) both; }
    @keyframes boot { from { opacity: 0; scale: .2; rotate: -40deg; } to { opacity: 1; scale: 1; rotate: 0deg; } }
    .tag { position: absolute; left: 50%; top: -22px; translate: -50% 0; font: 700 10px/1 ui-monospace, Consolas, monospace;
      letter-spacing: .12em; color: #ffd166; background: rgba(10,10,14,.85); padding: 3px 6px; border-radius: 3px; white-space: nowrap; }
    .reticle { position: absolute; border: 2px solid #ff2d2d; border-radius: 6px; box-shadow: 0 0 0 9999px rgba(255,0,0,.06), 0 0 18px #ff2d2d;
      animation: lock 520ms cubic-bezier(.2,.9,.3,1) both; }
    .reticle::before, .reticle::after { content: ""; position: absolute; background: #ff2d2d; }
    .reticle::before { left: 50%; top: -14px; bottom: -14px; width: 2px; translate: -1px 0; opacity: .7; }
    .reticle::after { top: 50%; left: -14px; right: -14px; height: 2px; translate: 0 -1px; opacity: .7; }
    @keyframes lock { from { opacity: 0; scale: 2.2; rotate: 45deg; } to { opacity: 1; scale: 1; rotate: 0deg; } }
    .beam { position: absolute; height: 6px; transform-origin: 0 50%; border-radius: 3px;
      background: linear-gradient(90deg, #fff 0%, #9be7ff 25%, #3fb6ff 70%, rgba(63,182,255,0));
      box-shadow: 0 0 12px #3fb6ff, 0 0 28px #3fb6ff; animation: beam 380ms ease-out both; }
    @keyframes beam { 0% { scale: 0 1; opacity: 1; } 70% { scale: 1 1; opacity: 1; } 100% { scale: 1 .2; opacity: 0; } }
    .boom { position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%;
      background: radial-gradient(circle, #fff 0%, #ffd166 30%, #ff6b1a 60%, rgba(255,40,0,0) 72%); animation: boom 650ms ease-out both; }
    @keyframes boom { from { scale: 1; opacity: 1; } to { scale: 24; opacity: 0; } }
    .ring { position: absolute; width: 20px; height: 20px; margin: -10px 0 0 -10px; border-radius: 50%; border: 3px solid #ffb703;
      animation: ring 700ms ease-out both; }
    @keyframes ring { from { scale: 1; opacity: 1; } to { scale: 16; opacity: 0; } }
    .spark { position: absolute; width: 5px; height: 5px; border-radius: 50%; background: #ffd166; box-shadow: 0 0 6px #ff9f1c; }
    .scorch { position: absolute; border-radius: 10px; mix-blend-mode: multiply;
      background: radial-gradient(ellipse at center, rgba(20,8,0,.85) 0%, rgba(60,20,0,.55) 35%, rgba(90,30,0,.18) 60%, rgba(0,0,0,0) 75%);
      animation: scorch 400ms ease-out both; }
    @keyframes scorch { from { opacity: 0; scale: .4; } to { opacity: 1; scale: 1; } }
    .crack { position: absolute; overflow: visible; } .crack svg { overflow: visible; }
    .banner { position: absolute; left: 50%; top: 18px; translate: -50% 0; max-width: min(92vw, 640px);
      font: 800 13px/1.35 ui-monospace, Consolas, monospace; color: #fff; background: #b00000; border: 2px solid #ffd166;
      padding: 8px 12px; border-radius: 6px; letter-spacing: .04em; box-shadow: 0 8px 30px rgba(176,0,0,.5); animation: drop 420ms cubic-bezier(.2,1.4,.4,1) both; }
    @keyframes drop { from { opacity: 0; translate: -50% -40px; } to { opacity: 1; translate: -50% 0; } }
  `;

  // An original armored sentinel: helmet with glowing eye slit, chest core, gold plating, boot thrusters.
  const SVG = `
  <svg viewBox="0 0 64 80" width="90" height="112" aria-hidden="true">
    <defs>
      <linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e3262b"/><stop offset="1" stop-color="#7a0c10"/></linearGradient>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#c99212"/></linearGradient>
      <radialGradient id="c"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#9be7ff"/><stop offset="1" stop-color="#1e90ff" stop-opacity="0"/></radialGradient>
      <linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#7fd4ff"/><stop offset="1" stop-color="#1e90ff" stop-opacity="0"/></linearGradient>
    </defs>
    <g class="flame"><path d="M22 66 L26 66 L24 80 Z" fill="url(#f)"/><path d="M38 66 L42 66 L40 80 Z" fill="url(#f)"/></g>
    <path d="M20 40 L44 40 L42 62 L36 66 L28 66 L22 62 Z" fill="url(#r)"/>
    <path d="M27 44 L37 44 L35 58 L29 58 Z" fill="url(#g)" opacity=".9"/>
    <path d="M14 38 L22 36 L20 54 L13 52 Z" fill="url(#r)"/><path d="M50 38 L42 36 L44 54 L51 52 Z" fill="url(#r)"/>
    <circle class="core" cx="32" cy="47" r="6" fill="url(#c)"/>
    <path d="M18 14 Q32 2 46 14 L46 30 Q32 40 18 30 Z" fill="url(#r)"/>
    <path d="M22 16 Q32 9 42 16 L41 29 Q32 35 23 29 Z" fill="url(#g)"/>
    <path d="M24 21 L30 23 L30 25 L24 24 Z M40 21 L34 23 L34 25 L40 24 Z" fill="#cdf6ff"/>
    <path d="M27 31 L37 31" stroke="#8a5b00" stroke-width="1.2"/>
  </svg>`;

  function mount() {
    if (host || !document.body) return;
    host = document.createElement("qa-drone");
    root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${CSS}</style><div class="layer"><div class="drone"><div class="bob boot"><span class="tag">QA SENTRY</span>${SVG}</div></div></div>`;
    document.documentElement.appendChild(host);
    drone = root.querySelector(".drone");
    place(pos.x, pos.y, true);
  }

  function place(x, y, instant) {
    const maxX = window.innerWidth - 96, maxY = window.innerHeight - 120;
    pos = { x: Math.max(6, Math.min(maxX, x)), y: Math.max(28, Math.min(maxY, y)) };
    if (instant) drone.style.transition = "none";
    drone.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    if (instant) requestAnimationFrame(() => (drone.style.transition = ""));
    try { sessionStorage.setItem(STORE, JSON.stringify(pos)); } catch {}
  }

  // Hover beside whatever the test is pointing at (Playwright moves a real mouse before clicks).
  let pending = 0;
  function follow(x, y) {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      const side = x > window.innerWidth - 170 ? -124 : 44;
      place(x + side, y - 96);
    });
  }
  addEventListener("mousemove", (e) => { mount(); follow(e.clientX, e.clientY); }, { capture: true, passive: true });
  addEventListener("pointerdown", (e) => { if (e.target instanceof Element) lastTarget = e.target; }, true);
  addEventListener("focusin", (e) => {
    if (!(e.target instanceof Element)) return;
    lastTarget = e.target;
    mount();
    const r = e.target.getBoundingClientRect();
    follow(r.left + r.width / 2, r.top + r.height / 2);
  }, true);

  const fx = (cls, css) => { const el = document.createElement("div"); el.className = cls; Object.assign(el.style, css); root.querySelector(".layer").appendChild(el); return el; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function crackSvg(w, h) {
    const cx = w / 2, cy = h / 2, lines = [];
    for (let i = 0; i < 9; i++) {
      const a = (Math.PI * 2 * i) / 9 + Math.random() * 0.4;
      let x = cx, y = cy, d = `M${cx} ${cy}`;
      const len = Math.max(w, h) * (0.35 + Math.random() * 0.4);
      for (let s = 1; s <= 4; s++) { x = cx + Math.cos(a + (Math.random() - 0.5) * 0.5) * (len * s) / 4; y = cy + Math.sin(a + (Math.random() - 0.5) * 0.5) * (len * s) / 4; d += ` L${x.toFixed(1)} ${y.toFixed(1)}`; }
      lines.push(`<path d="${d}" stroke="#1a0a00" stroke-width="${(2.4 - i * 0.15).toFixed(2)}" fill="none" stroke-linecap="round"/>`);
    }
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${lines.join("")}</svg>`;
  }

  /** Lock on, charge, fire, blow the target up. Resolves when the show is over. */
  async function strike(label) {
    mount();
    let el = lastTarget && lastTarget.isConnected ? lastTarget : document.querySelector("main") ?? document.body;
    let r = el.getBoundingClientRect();
    if (r.width === 0 || r.bottom < 0 || r.top > innerHeight) { el.scrollIntoView?.({ block: "center" }); await wait(250); r = el.getBoundingClientRect(); }
    if (r.width === 0) r = { left: innerWidth / 2 - 60, top: innerHeight / 2 - 30, width: 120, height: 60 };
    const tx = r.left + r.width / 2, ty = r.top + r.height / 2;

    // Take a firing position off to one side of the target.
    place(tx < innerWidth / 2 ? tx + Math.min(260, innerWidth / 3) : tx - Math.min(260, innerWidth / 3), Math.max(40, ty - 160));
    fx("reticle", { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
    await wait(720);
    drone.classList.add("charging");
    await wait(520);

    const sx = pos.x + 45, sy = pos.y + 66; // chest core
    const dx = tx - sx, dy = ty - sy;
    fx("beam", { left: `${sx}px`, top: `${sy - 3}px`, width: `${Math.hypot(dx, dy)}px`, transform: `rotate(${Math.atan2(dy, dx)}rad)` });
    drone.style.transition = "transform 90ms";
    drone.style.transform = `translate(${pos.x - Math.sign(dx) * 10}px, ${pos.y - 6}px)`; // recoil
    await wait(260);
    drone.style.transition = "";
    place(pos.x, pos.y);
    drone.classList.remove("charging");

    fx("boom", { left: `${tx}px`, top: `${ty}px` });
    fx("ring", { left: `${tx}px`, top: `${ty}px` });
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 160;
      const s = fx("spark", { left: `${tx}px`, top: `${ty}px` });
      s.animate([{ transform: "translate(0,0)", opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d + 40}px)`, opacity: 0 }], { duration: 600 + Math.random() * 500, easing: "cubic-bezier(.2,.8,.4,1)", fill: "forwards" });
    }
    const w = Math.max(80, r.width + 40), h = Math.max(60, r.height + 40);
    fx("scorch", { left: `${tx - w / 2}px`, top: `${ty - h / 2}px`, width: `${w}px`, height: `${h}px` });
    const crack = fx("crack", { left: `${tx - w}px`, top: `${ty - h}px`, width: `${w * 2}px`, height: `${h * 2}px` });
    crack.innerHTML = crackSvg(w * 2, h * 2);

    // The page itself takes the hit: the target is knocked loose and the screen shakes.
    try {
      el.animate([{ transform: "none", filter: "none" }, { transform: "translate(6px,-4px) rotate(-3deg)", filter: "sepia(1) saturate(3) brightness(.6)" }, { transform: "translate(-4px,10px) rotate(4deg)", filter: "sepia(1) saturate(4) brightness(.45) blur(.6px)" }], { duration: 900, fill: "forwards", easing: "ease-out" });
      document.documentElement.animate([{ transform: "translate(0,0)" }, { transform: "translate(-9px,5px)" }, { transform: "translate(8px,-6px)" }, { transform: "translate(-5px,3px)" }, { transform: "translate(0,0)" }], { duration: 420 });
    } catch {}
    const b = fx("banner", {});
    b.textContent = `BUG FOUND: ${label ?? "test failed"}`;
    await wait(2200);
  }


  window.__qaDrone = { strike };
  if (document.readyState !== "loading") mount(); else addEventListener("DOMContentLoaded", mount, { once: true });
})();
