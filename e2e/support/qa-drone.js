// QA Inspector: a small robot detective (trench coat, fedora, visor eyes) and its nanobot
// swarm that live on top of the page during headed E2E runs, so a person watching can read
// what the test is doing:
//   * follow     -- it flies after the test's cursor on a spring, eyes tracking, bots orbiting;
//   * CLICK/FILL -- it squares up beside the element, the bots assemble into a gun in its hand
//                   (anticipation, then a short burst), then it leans in with a magnifying glass
//                   while the bots form corner brackets and a case label names the step;
//   * EXPECT     -- e2e/qa-test.ts reports each assertion; it investigates the element until the
//                   test moves on (which means it passed), then stamps a check and a thumbs-up;
//   * failure    -- eyes go red, the swarm forms a cannon, it blasts the failing element and a
//                   "BUG FOUND HERE" tag marks the spot.
// Injected by e2e/qa-test.ts with context.addInitScript: it exists only inside the headed test
// browser (never the product, never headless/CI) and costs no tokens -- plain browser code, no
// network, no dependencies. One canvas plus a few labels inside a closed shadow root, all
// pointer-events: none, so it can't change what a test does. One rAF loop, paused when hidden.
(() => {
  if (window.top !== window || window.__qaDrone) return;
  const KEY = "qa-inspector";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let mem = {};
  try { mem = JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch {}

  const P = { ink: "#0b0e14", steel: "#252c3b", steelHi: "#46516a", visor: "#04060a", coat: "#b38858", coatDk: "#7e5d38",
    coatHi: "#d6ad78", hat: "#4a3926", hatHi: "#6f5639", band: "#1b140d", brass: "#d9b26a", cyan: "#5be3ff", red: "#ff4545", green: "#3ddc84", amber: "#ffc857" };
  const RGB = { cyan: "91,227,255", red: "255,69,69", green: "61,220,132", amber: "255,200,87" };
  const NB = 36, MAXP = 240, S = 1.4, TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  const rand = (a, b) => a + Math.random() * (b - a);

  let host, root, layer, canvas, ctx, caseEl, hudEl, dpr = 1, raf = 0, lastDraw = 0, lastSave = 0, now = 0;
  let step = mem.step || 0, passed = mem.passed || 0;
  let seq = null, pending = null, failing = false, curExpect = 0, lastActT = -1e9, lastEl = null, lastVerb = "", lastTarget = null;
  let focusEl = null, focus = null, rectDirty = false, mouse = null, shakeAmt = 0;
  let form = "orbit", prevForm = "orbit", formT = 0;

  const me = { x: mem.x ?? 150, y: mem.y ?? 170, vx: 0, vy: 0, tx: mem.x ?? 150, ty: mem.y ?? 170, face: 1, faceS: 1, tilt: 0, tiltV: 0,
    sq: 0, sqV: 0, eyeX: 0, eyeY: 0, arm: 1.1, armV: 0, recoil: 0, hatY: 0, hatV: 0, blinkAt: 0, blinkT: -1e9, pose: "follow", poseT: 0,
    speed: 0, lookX: 0, lookY: 0, hx: 0, hy: 0, mx: 0, my: 0, aim: 0, flashT: -1e9, chargeT: -1e9, jitter: 0 };
  const bots = Array.from({ length: NB }, (_, i) => ({ i, x: me.x + rand(-30, 30), y: me.y + rand(-20, 20), vx: 0, vy: 0, ph: rand(0, TAU),
    k: rand(200, 300), back: false, led: "cyan" }));
  const shots = [], parts = [], rings = [], stamps = [];

  const CSS = `
    :host { all: initial; }
    .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; overflow: hidden; contain: strict; }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
    .case { position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: 7px; max-width: min(560px, calc(100vw - 16px));
      font: 600 11.5px/1.3 ui-monospace, "Cascadia Mono", Consolas, monospace; color: #e8f4ff; white-space: nowrap;
      background: rgba(9,12,18,.93); border: 1px solid rgba(${RGB.cyan},.38); border-radius: 8px; padding: 5px 8px 5px 6px;
      box-shadow: 0 6px 22px rgba(0,0,0,.35), 0 0 0 1px rgba(0,0,0,.4); opacity: 0;
      transition: transform 340ms cubic-bezier(.23,1,.32,1), opacity 160ms ease-out, border-color 200ms ease-out; }
    .case.on { opacity: 1; }
    .case .n { color: #7d8aa3; font-weight: 700; }
    .case .v { background: ${P.cyan}; color: #03121a; font-weight: 800; letter-spacing: .06em; padding: 1px 6px; border-radius: 4px; }
    .case .v.expect { background: ${P.amber}; }
    .case .d { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .case .s { font-weight: 800; letter-spacing: .05em; font-size: 10px; padding: 1px 5px; border-radius: 4px; color: ${P.amber}; border: 1px solid rgba(${RGB.amber},.4); }
    .case .s.ok { color: ${P.green}; border-color: rgba(${RGB.green},.45); }
    .case .s.bad { color: #fff; background: ${P.red}; border-color: ${P.red}; }
    .case.bad { border-color: ${P.red}; }
    .hud { position: absolute; left: 10px; bottom: 10px; display: flex; gap: 8px; align-items: center; padding: 4px 9px 4px 7px;
      font: 700 10.5px/1.2 ui-monospace, "Cascadia Mono", Consolas, monospace; letter-spacing: .07em; color: #cfe3f3;
      background: rgba(9,12,18,.86); border: 1px solid rgba(255,255,255,.12); border-radius: 999px; transition: border-color 200ms ease-out, background 200ms ease-out; }
    .hud i { width: 7px; height: 7px; border-radius: 50%; background: ${P.cyan}; box-shadow: 0 0 8px ${P.cyan}; }
    .hud em { font-style: normal; color: ${P.green}; }
    .hud b::before, .hud em::before { content: "·"; margin-right: 8px; color: #5d6b82; }
    .hud.bad { background: rgba(120,0,0,.92); border-color: ${P.red}; } .hud.bad i { background: ${P.red}; box-shadow: 0 0 8px ${P.red}; }
    .hud.ok i { background: ${P.green}; box-shadow: 0 0 8px ${P.green}; }
    .reticle { position: absolute; border: 2px solid ${P.red}; border-radius: 6px; box-shadow: 0 0 0 9999px rgba(255,0,0,.05), 0 0 18px rgba(${RGB.red},.8);
      animation: lock 520ms cubic-bezier(.23,1,.32,1) both; }
    @keyframes lock { from { opacity: 0; scale: 1.5; rotate: 20deg; } to { opacity: 1; scale: 1; rotate: 0deg; } }
    .bug { position: absolute; translate: -50% -100%; display: flex; flex-direction: column; align-items: center;
      animation: drop 420ms cubic-bezier(.23,1,.32,1) both; }
    .bug span { font: 800 12px/1 ui-monospace, "Cascadia Mono", Consolas, monospace; letter-spacing: .1em; color: #fff; background: ${P.red};
      padding: 6px 9px; border-radius: 5px; border: 2px solid #fff; box-shadow: 0 6px 20px rgba(${RGB.red},.55); }
    .bug::after { content: ""; width: 0; height: 0; border: 7px solid transparent; border-top-color: ${P.red}; margin-top: -1px; }
    @keyframes drop { from { opacity: 0; transform: translateY(-10px) scale(1.12); } to { opacity: 1; transform: none; } }
    .scorch { position: absolute; border-radius: 10px; mix-blend-mode: multiply; animation: fade 400ms ease-out both;
      background: radial-gradient(ellipse at center, rgba(20,8,0,.85) 0%, rgba(60,20,0,.55) 35%, rgba(90,30,0,.18) 60%, rgba(0,0,0,0) 75%); }
    .crack { position: absolute; overflow: visible; } .crack svg { overflow: visible; }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    .banner { position: absolute; left: 50%; top: 16px; translate: -50% 0; max-width: min(92vw, 660px); display: flex; flex-direction: column; gap: 3px;
      font: 700 12px/1.35 ui-monospace, "Cascadia Mono", Consolas, monospace; color: #ffe1e1; background: rgba(110,0,0,.95);
      border: 1px solid ${P.red}; padding: 9px 13px; border-radius: 8px; box-shadow: 0 10px 34px rgba(150,0,0,.45); animation: drop 420ms cubic-bezier(.23,1,.32,1) both; }
    .banner b { color: #fff; font-size: 13px; letter-spacing: .04em; } .banner small { color: #ffb3b3; font-size: 11px; }
    @media (prefers-reduced-motion: reduce) { .case, .hud { transition: opacity 160ms linear; } .reticle, .bug, .banner { animation: fade 200ms linear both; } }
  `;

  // ---------------------------------------------------------------- mount / loop
  function mount() {
    if (host || !document.documentElement) return;
    host = document.createElement("qa-swarm");
    root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${CSS}</style><div class="layer"><canvas></canvas><div class="case"></div><div class="hud"></div></div>`;
    document.documentElement.appendChild(host);
    layer = root.querySelector(".layer");
    canvas = root.querySelector("canvas");
    caseEl = root.querySelector(".case");
    hudEl = root.querySelector(".hud");
    ctx = canvas.getContext("2d");
    resize();
    hud();
    addEventListener("resize", () => { resize(); rectDirty = true; });
    addEventListener("scroll", () => { rectDirty = true; }, { capture: true, passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf) { lastDraw = 0; raf = requestAnimationFrame(tick); }
    });
    addEventListener("pagehide", save);
    raf = requestAnimationFrame(tick);
  }
  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify({ x: Math.round(me.x), y: Math.round(me.y), step, passed })); } catch {} }

  function tick(t) {
    raf = requestAnimationFrame(tick);
    const calm = !seq && !failing && !shots.length && !parts.length && !rings.length && !stamps.length && me.speed < 15;
    // Idle redraws at ~30fps: the test browser shares the machine with the app server.
    if (calm && t - lastDraw < 33) return;
    const dt = lastDraw ? Math.min(0.05, (t - lastDraw) / 1000) : 1 / 60;
    lastDraw = now = t;
    if (rectDirty) refreshFocus();
    runSeq(t);
    physics(dt, t);
    draw(t, dt);
    if (t - lastSave > 500) { lastSave = t; save(); }
  }

  // ---------------------------------------------------------------- targets
  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }
  function focusOn(el) { focusEl = el; focus = el ? rectOf(el) : null; }
  function refreshFocus() {
    rectDirty = false;
    if (focusEl?.isConnected) { focus = rectOf(focusEl); placeCase(); }
  }
  function moveBeside(f) {
    const side = f.cx > innerWidth * 0.55 ? -1 : 1;
    let x = side > 0 ? f.l + f.w + 76 : f.l - 76, y = f.cy - 40;
    if (x < 50 || x > innerWidth - 50) { x = clamp(f.cx - side * Math.min(f.w / 2 - 30, 140), 50, innerWidth - 50); y = f.t - 74; }
    if (y < 76) y = f.t + f.h + 76;
    setTarget(x, y);
  }
  function setTarget(x, y) { me.tx = clamp(x, 50, innerWidth - 50); me.ty = clamp(y, 80, innerHeight - 50); }

  const INTERACTIVE = "button, a[href], input, select, textarea, summary, label, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=radio], [role=switch], [role=option], [role=combobox], [contenteditable=''], [contenteditable=true]";
  const clean = (s, n = 42) => { s = (s || "").replace(/\s+/g, " ").trim().replace(/\s*\*$/, ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
  function roleOf(el) {
    const r = el.getAttribute("role");
    if (r) return r;
    const tag = el.tagName.toLowerCase(), type = (el.getAttribute("type") || "").toLowerCase();
    if (tag === "a") return "link";
    if (tag === "button" || tag === "summary") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") return /^(checkbox|radio)$/.test(type) ? type : /^(submit|button|reset)$/.test(type) ? "button" : "textbox";
    return tag;
  }
  function nameOf(el) {
    const by = el.getAttribute("aria-labelledby");
    return clean(el.getAttribute("aria-label") || (by && document.getElementById(by.split(" ")[0])?.textContent) || el.labels?.[0]?.textContent ||
      (el.matches("input, textarea, select") ? el.placeholder || el.name : "") || el.textContent || el.title || el.getAttribute("alt") || "");
  }
  function describe(el) { const n = nameOf(el), r = roleOf(el); return n ? `${r} '${n}'` : r; }
  function valueOf(el) {
    if (el.type === "password") return "••••••";
    if (el.tagName === "SELECT") return clean(el.selectedOptions?.[0]?.textContent, 28);
    return clean(el.value ?? el.textContent, 28);
  }

  // ---------------------------------------------------------------- signals
  function act(raw, verb, key) {
    if (failing || !(raw instanceof Element) || host?.contains(raw)) return;
    mount();
    const t = performance.now(), el = raw.closest(INTERACTIVE) || raw;
    if (el === lastEl && (verb === "FILL" || verb === "SELECT") && t - lastActT < 1200) {
      // Typing into the same field (or the input event after a checkbox click): same step, fresher text.
      if (verb === lastVerb) showCase(verb, detail(el, verb), "checking");
      lastActT = t;
      return;
    }
    completePending();
    step++; curExpect = 0;
    seq = { kind: "act", t0: t, rapid: t - lastActT < 650, shots: 0 };
    lastActT = t; lastEl = lastTarget = el; lastVerb = verb;
    focusOn(el);
    pending = { el };
    moveBeside(focus);
    showCase(verb, detail(el, verb, key), "checking");
    hud();
  }
  function detail(el, verb, key) {
    if (verb === "PRESS") return `${key} on ${describe(el)}`;
    if (verb === "FILL") { const v = valueOf(el); return `${nameOf(el) || roleOf(el)}${v ? ` = '${v}'` : ""}`; }
    if (verb === "SELECT") return `${nameOf(el) || "option"} = '${valueOf(el)}'`;
    return describe(el);
  }

  /** Called by e2e/qa-test.ts when a test starts an assertion. The test moving on means it passed. */
  function expectSignal(el, noun, fallback, id) {
    if (failing) return;
    mount();
    el = el instanceof Element ? el : null;
    if (id && id === curExpect) { // the fixture re-polls while the element is still on its way
      if (el && !pending?.el) { pending = { el }; lastTarget = el; focusOn(el); moveBeside(focus); showCase("EXPECT", expectText(el, noun, fallback), "checking"); }
      return;
    }
    completePending();
    step++; curExpect = id || -1;
    seq = { kind: "expect", t0: performance.now() };
    pending = { el };
    if (el) lastTarget = el;
    focusOn(el);
    if (focus) moveBeside(focus);
    showCase("EXPECT", expectText(el, noun, fallback), "checking");
    hud();
  }
  function expectText(el, noun, fallback) {
    if (el && /^(text|containText)$/.test(noun)) return `text '${clean(el.textContent, 48)}'`;
    if (el && noun === "value") return `${nameOf(el) || "field"} value '${valueOf(el)}'`;
    if (noun === "url" || noun === "title") return `${noun} on ${clean(location.pathname, 40)}`;
    return `${el ? describe(el) : clean(fallback, 52) || "page"} · ${noun}`;
  }
  function completePending() {
    if (!pending) return;
    const el = pending.el;
    pending = null;
    passed++;
    if (el?.isConnected) {
      const f = rectOf(el);
      if (f.w || f.h) stamps.push({ x: clamp(f.l + f.w, 16, innerWidth - 16), y: clamp(f.t, 16, innerHeight - 16), t0: now });
    }
    setStatus("passed", "ok");
    hud();
  }
  function done(ok) {
    if (failing || !ok) return;
    mount();
    completePending();
    seq = { kind: "done", t0: performance.now() };
    hud("ok");
  }

  // ---------------------------------------------------------------- labels
  function showCase(verb, text, status) {
    caseEl.className = "case on";
    caseEl.replaceChildren();
    const add = (cls, txt) => { const s = document.createElement("span"); s.className = cls; s.textContent = txt; caseEl.append(s); return s; };
    add("n", `#${String(step).padStart(2, "0")}`);
    add(verb === "EXPECT" ? "v expect" : "v", verb);
    add("d", text);
    add("s", status);
    placeCase();
  }
  function setStatus(text, cls) {
    const s = caseEl?.querySelector(".s");
    if (s) { s.textContent = text; s.className = `s ${cls}`; }
  }
  function placeCase() {
    if (!caseEl?.classList.contains("on")) return;
    const w = caseEl.offsetWidth, h = caseEl.offsetHeight;
    let x, y;
    if (focus) {
      x = clamp(focus.l, 8, innerWidth - w - 8);
      y = focus.t - h - 16;
      if (y < 8) y = focus.t + focus.h + 16;
    } else { x = clamp(me.tx - w / 2, 8, innerWidth - w - 8); y = me.ty - 96; }
    caseEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(clamp(y, 8, innerHeight - h - 8))}px)`;
  }
  function hud(state) {
    if (!hudEl) return;
    hudEl.className = `hud ${state || ""}`;
    hudEl.replaceChildren();
    const add = (tag, txt) => { const e = document.createElement(tag); if (txt) e.textContent = txt; hudEl.append(e); };
    add("i");
    add("span", state === "bad" ? "BUG FOUND" : state === "ok" ? "TEST PASSED" : "QA INSPECTOR");
    add("b", `STEP ${String(step).padStart(2, "0")}`);
    add("em", `${passed} OK`);
  }

  // ---------------------------------------------------------------- choreography
  function pose(name) {
    if (me.pose === name) return;
    const from = me.pose;
    me.pose = name; me.poseT = now;
    if (name === "aim" || name === "fire") setForm("gun");
    else if (name === "investigate") { setForm(focus ? "brackets" : "orbit"); if (from !== "success" && !reduce) me.sqV += 3.2; }
    else if (name === "success") { if (!reduce) me.sqV -= 2.4; }
    else if (name === "alarm") setForm("cannon");
    else setForm("orbit");
  }
  function setForm(name) { if (form === name) return; prevForm = form; form = name; formT = now; }

  function runSeq(t) {
    if (failing) return;
    if (!seq) { pose("follow"); return; }
    const e = t - seq.t0;
    if (seq.kind === "act") {
      const fast = seq.rapid || reduce, inv = fast ? 1000 : 1550;
      if (!fast && e < 210) pose("aim");
      else if (!fast && e < 640) {
        pose("fire");
        const due = Math.min(6, Math.floor((e - 210) / 66) + 1);
        while (seq.shots < due) { shoot(false); seq.shots++; }
      } else if (e < inv) pose("investigate");
      else if (e < inv + 700) { if (pending) completePending(); pose("success"); }
      else end();
    } else if (seq.kind === "expect") {
      if (pending) pose("investigate");
      else if (e < 700) pose("success");
      else end();
    } else if (seq.kind === "done") { if (e < 900) pose("success"); else end(); }
  }
  function end() {
    seq = null;
    focusEl = null; focus = null;
    pose("follow");
    caseEl.classList.remove("on");
  }

  function shoot(heavy) {
    if (!focus || reduce) return;
    const tx = focus.cx + rand(-0.5, 0.5) * Math.min(focus.w * 0.7, 70), ty = focus.cy + rand(-0.5, 0.5) * Math.min(focus.h * 0.7, 24);
    const d = Math.hypot(tx - me.mx, ty - me.my) || 1;
    shots.push({ x0: me.mx, y0: me.my, x1: tx, y1: ty, t0: now, dur: (d / (heavy ? 1250 : 1700)) * 1000, heavy });
    me.recoil = heavy ? 1.6 : 1; me.flashT = now;
    if (heavy) shakeAmt = Math.max(shakeAmt, 2.5);
  }
  function spark(x, y, n, power, colors) {
    for (let j = 0; j < n && parts.length < MAXP; j++) {
      const a = rand(0, TAU), v = rand(0.3, 1) * power;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.35, life: 0, max: rand(280, 520), size: rand(1.4, 2.6), c: colors[j % colors.length], kind: "spark" });
    }
  }

  // ---------------------------------------------------------------- physics
  function spring(o, k, vk, target, stiff, zeta, dt) {
    const a = stiff * (target - o[k]) - 2 * zeta * Math.sqrt(stiff) * o[vk];
    o[vk] += a * dt; o[k] += o[vk] * dt;
  }
  function physics(dt, t) {
    if (!seq && !failing && mouse) {
      const side = mouse.x < 130 ? 1 : -1;
      setTarget(mouse.x + side * 74, mouse.y - 56);
    }
    const look = focus ? { x: focus.cx, y: focus.cy } : mouse || { x: me.x + me.face * 100, y: me.y };
    me.lookX = look.x; me.lookY = look.y;
    // Body: a slightly under-damped spring, so it arrives with a small overshoot and settles.
    spring(me, "x", "vx", me.tx, reduce ? 60 : 125, reduce ? 1 : 0.7, dt);
    spring(me, "y", "vy", me.ty, reduce ? 60 : 125, reduce ? 1 : 0.7, dt);
    const sp = Math.hypot(me.vx, me.vy);
    if (!reduce && me.speed > 240 && sp < 70) me.sqV += 2.8; // landing squash
    me.speed = sp;
    if (Math.abs(look.x - me.x) > 10) me.face = look.x > me.x ? 1 : -1;
    else if (Math.abs(me.vx) > 40) me.face = me.vx > 0 ? 1 : -1;
    me.faceS += (me.face - me.faceS) * Math.min(1, dt * 16);
    // Squash/stretch and lean into motion; arm follows the pose.
    spring(me, "sq", "sqV", 0, 340, 0.32, dt);
    const lean = reduce ? 0 : clamp(me.vx / 1100, -0.3, 0.3) + (me.pose === "investigate" ? 0.13 * me.face : 0) - me.recoil * 0.06 * me.face;
    spring(me, "tilt", "tiltV", lean, 190, 0.62, dt);
    const fwd = Math.atan2(look.y - (me.y - 4), (look.x - me.x) * me.face) - me.tilt * me.face; // local angle to target
    let arm;
    const e = t - me.poseT;
    if (me.pose === "aim") arm = clamp(fwd, -1.2, 1.2) - 0.55 * easeOut(e / 120); // wind-up: pull back before the snap
    else if (me.pose === "fire") arm = clamp(fwd, -1.2, 1.2);
    else if (me.pose === "alarm") arm = clamp(fwd, -1.2, 1.2) - (t - me.chargeT < 330 ? 0.3 : 0);
    else if (me.pose === "investigate") arm = clamp(fwd, -0.9, 0.5) - 0.25;
    else if (me.pose === "success") arm = -1.45;
    else arm = 1.1 + (reduce ? 0 : Math.sin(t * 0.003) * 0.12);
    spring(me, "arm", "armV", arm, me.pose === "fire" ? 520 : 260, 0.72, dt);
    me.recoil *= Math.exp(-dt * 13);
    spring(me, "hatY", "hatV", 0, 260, 0.4, dt);
    // Eyes track whatever it is looking at.
    const ex = clamp(((look.x - me.x) * me.face) / 140, -1, 1) * 2.6, ey = clamp((look.y - (me.y - 24)) / 140, -1, 1) * 2;
    me.eyeX += (ex - me.eyeX) * Math.min(1, dt * 12); me.eyeY += (ey - me.eyeY) * Math.min(1, dt * 12);
    if (t > me.blinkAt) { me.blinkT = t; me.blinkAt = t + rand(2200, 5200); }
    me.jitter = failing && !reduce && t - me.poseT < 450 ? 2.2 : 0;
    shakeAmt *= Math.exp(-dt * 9);

    // Where the hand / muzzle are in page space (bots assemble there).
    const fs = Math.sign(me.faceS) || 1, sx = Math.max(0.3, Math.abs(me.faceS)) * fs * S;
    const lhx = 9 + Math.cos(me.arm) * 15, lhy = -4 + Math.sin(me.arm) * 15;
    const c = Math.cos(me.tilt), s = Math.sin(me.tilt), bob = reduce ? 0 : Math.sin(t * 0.0026) * 2.2;
    me.hx = me.x + (lhx * sx) * c - (lhy * S) * s;
    me.hy = me.y + bob + (lhx * sx) * s + (lhy * S) * c;
    me.aim = focus ? Math.atan2(focus.cy - me.hy, focus.cx - me.hx) : me.face > 0 ? 0 : Math.PI;
    const ml = form === "cannon" ? 66 : 52;
    me.mx = me.hx + Math.cos(me.aim) * ml; me.my = me.hy + Math.sin(me.aim) * ml;
  }

  // ---------------------------------------------------------------- nanobot formations
  function slot(b, name, t) {
    const i = b.i;
    if ((name === "gun" || name === "cannon") && focus) {
      const a = me.aim, c = Math.cos(a), s = Math.sin(a), flip = c < 0 ? -1 : 1, kick = -me.recoil * 5;
      let lx, ly;
      if (name === "gun") {
        if (i < 20) { lx = 7 + (i >> 1) * 4.6; ly = ((i & 1) - 0.5) * 4.2; }
        else if (i < 30) { const k = i - 20; lx = -1 + (k % 5) * 4.4; ly = k < 5 ? -6.2 : 6.2; }
        else { const k = i - 30; lx = 3 + (k & 1) * 4.4; ly = 10.5 + (k >> 1) * 4.2; }
      } else {
        if (i < 30) { const col = i % 10, row = Math.floor(i / 10); lx = 4 + col * 6; ly = (row - 1) * (col > 7 ? 7.6 : 5.8); }
        else { const k = i - 30; lx = -7 + (k % 3) * 5; ly = (k < 3 ? -1 : 1) * 10; }
      }
      lx += kick; ly *= flip;
      return { x: me.hx + lx * c - ly * s, y: me.hy + lx * s + ly * c, back: false };
    }
    if (name === "brackets" && focus) {
      const corner = i % 4, j = Math.floor(i / 4), sx = corner & 1 ? 1 : -1, sy = corner & 2 ? 1 : -1;
      const pad = 7 + (reduce ? 0 : Math.sin(t * 0.006) * 1.5), L = clamp(Math.min(focus.w, focus.h + 14) / 3, 8, 24) / 4;
      const cx = focus.cx + sx * (focus.w / 2 + pad), cy = focus.cy + sy * (focus.h / 2 + pad);
      if (j === 0) return { x: cx, y: cy, back: false };
      return j <= 4 ? { x: cx - sx * L * j, y: cy, back: false } : { x: cx, y: cy - sy * L * (j - 4), back: false };
    }
    const spin = reduce ? 0 : t * 0.0011 * (i % 2 ? 1 : -1) * (1 + (i % 3) * 0.25);
    const a = b.ph + spin, r = 30 + (i % 4) * 6.5;
    return { x: me.x + Math.cos(a) * r * 1.2, y: me.y - 4 + Math.sin(a) * r * 0.42, back: Math.sin(a) < 0 };
  }
  function stepBots(dt, t) {
    const led = failing ? "red" : me.pose === "success" ? "green" : me.pose === "investigate" ? "amber" : "cyan";
    for (const b of bots) {
      // Staggered assembly: each bot leaves for the new formation a beat after the one before it.
      const s = slot(b, t - formT > b.i * (form === "brackets" ? 9 : 13) ? form : prevForm, t);
      b.back = s.back; b.led = led;
      if (reduce) { b.x = s.x; b.y = s.y; continue; }
      const a = b.k * (s.x - b.x) - 2 * 0.72 * Math.sqrt(b.k) * b.vx, a2 = b.k * (s.y - b.y) - 2 * 0.72 * Math.sqrt(b.k) * b.vy;
      b.vx += a * dt; b.vy += a2 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
    }
  }
  function drawBots(back) {
    for (const b of bots) {
      if (b.back !== back) continue;
      ctx.globalAlpha = back ? 0.7 : 1;
      ctx.fillStyle = P.ink; ctx.beginPath(); ctx.roundRect(b.x - 2.8, b.y - 2.4, 5.6, 4.8, 1.3); ctx.fill();
      ctx.fillStyle = "#3a4256"; ctx.fillRect(b.x - 2, b.y - 2.2, 4, 1);
      ctx.fillStyle = P[b.led]; ctx.fillRect(b.x - 0.2, b.y - 0.6, 1.8, 1.6);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- drawing
  function draw(t, dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (shakeAmt > 0.3 && !reduce) ctx.translate(rand(-1, 1) * shakeAmt, rand(-1, 1) * shakeAmt);
    stepBots(dt, t);

    if (focus && (me.pose === "investigate" || me.pose === "success")) drawScan(t);
    drawBots(true);
    drawInspector(t);
    drawBots(false);
    drawShots(t);
    drawParts(dt);
    drawRings(t);
    drawStamps(t);
  }

  function drawScan(t) {
    const f = focus, ok = me.pose === "success", col = ok ? RGB.green : RGB.amber;
    const k = easeOut((t - me.poseT) / 260);
    // Light cone from the magnifying glass to the near edge of the element.
    const lx = me.hx + Math.cos(me.aim) * 14 * S, ly = me.hy + Math.sin(me.aim) * 14 * S;
    const nearX = lx < f.cx ? f.l - 4 : f.l + f.w + 4;
    if (!ok) {
      ctx.fillStyle = `rgba(${col},${0.09 * k})`;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(nearX, f.t - 4); ctx.lineTo(nearX, f.t + f.h + 4); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = `rgba(${col},${0.07 * k})`;
    ctx.fillRect(f.l - 5, f.t - 5, f.w + 10, f.h + 10);
    if (!reduce && !ok) {
      const y = f.t - 4 + ((t * 0.09) % (f.h + 8));
      ctx.strokeStyle = `rgba(${col},${0.75 * k})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(f.l - 4, y); ctx.lineTo(f.l + f.w + 4, y); ctx.stroke();
    }
  }

  function drawInspector(t) {
    const pose = me.pose, alarm = pose === "alarm" || failing, bob = reduce ? 0 : Math.sin(t * 0.0026) * 2.2;
    const fs = Math.sign(me.faceS) || 1, sx = Math.max(0.3, Math.abs(me.faceS)) * fs;
    const stretch = reduce ? 0 : clamp(me.speed / 2600, 0, 0.09);
    const jx = me.jitter ? rand(-1, 1) * me.jitter : 0;
    const recoilX = -Math.cos(me.aim) * me.recoil * 3, recoilY = -Math.sin(me.aim) * me.recoil * 3;
    ctx.save();
    ctx.translate(me.x + jx + recoilX, me.y + bob + recoilY);
    ctx.rotate(me.tilt);
    ctx.scale(sx * S * (1 + me.sq * 0.7 - stretch * 0.5), S * (1 - me.sq + stretch));
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const line = (w = 1.6) => { ctx.strokeStyle = P.ink; ctx.lineWidth = w; ctx.stroke(); };

    // Thruster and flame (longer when moving; orange when alarmed).
    const L = 8 + (reduce ? 0 : Math.sin(t * 0.05) * 1.6 + Math.random() * 1.6) + clamp(me.speed / 55, 0, 11);
    const g = ctx.createLinearGradient(0, 24, 0, 24 + L);
    g.addColorStop(0, "rgba(255,255,255,.95)"); g.addColorStop(0.35, alarm ? "rgba(255,140,60,.9)" : `rgba(${RGB.cyan},.85)`); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-4.5, 23); ctx.quadraticCurveTo(-3.5, 24 + L * 0.6, 0, 24 + L); ctx.quadraticCurveTo(3.5, 24 + L * 0.6, 4.5, 23); ctx.fill();
    ctx.fillStyle = P.steel; ctx.beginPath(); ctx.moveTo(-5.5, 18); ctx.lineTo(5.5, 18); ctx.lineTo(4.2, 24); ctx.lineTo(-4.2, 24); ctx.closePath(); ctx.fill(); line(1.4);

    // Back arm (hangs behind the coat, swings a little).
    const backA = 1.95 + (reduce ? 0 : Math.sin(t * 0.003 + 1.2) * 0.1) - (pose === "success" ? 0.5 : 0);
    limb(-8, -4, backA, P.coatDk, false);

    // Trench coat with popped collar, belt and lapels.
    ctx.fillStyle = P.coat;
    ctx.beginPath(); ctx.moveTo(-11, -8); ctx.quadraticCurveTo(0, -11.5, 11, -8); ctx.lineTo(14.5, 16); ctx.quadraticCurveTo(0, 21.5, -14.5, 16); ctx.closePath(); ctx.fill(); line();
    ctx.fillStyle = "rgba(0,0,0,.13)"; ctx.beginPath(); ctx.moveTo(-11, -8); ctx.lineTo(-14.5, 16); ctx.quadraticCurveTo(-11, 17.6, -8, 18.2); ctx.lineTo(-6.5, -9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.steel; ctx.beginPath(); ctx.moveTo(-5, -9.5); ctx.lineTo(5, -9.5); ctx.lineTo(1.4, 3.5); ctx.lineTo(-1.4, 3.5); ctx.closePath(); ctx.fill();
    const core = alarm ? P.red : pose === "success" ? P.green : P.cyan;
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, -4.5, 1.7, 0, TAU); ctx.fill();
    ctx.fillStyle = P.coatHi;
    ctx.beginPath(); ctx.moveTo(5, -9.5); ctx.lineTo(8.5, -6); ctx.lineTo(2, 4.5); ctx.closePath(); ctx.fill(); line(1.1);
    ctx.beginPath(); ctx.moveTo(-5, -9.5); ctx.lineTo(-8.5, -6); ctx.lineTo(-2, 4.5); ctx.closePath(); ctx.fill(); line(1.1);
    ctx.fillStyle = P.coatDk; ctx.fillRect(-13.6, 6.2, 27.2, 3.3);
    ctx.strokeStyle = P.brass; ctx.lineWidth = 1.1; ctx.strokeRect(-2.2, 5.8, 4.4, 4.1);
    ctx.strokeStyle = "rgba(11,14,20,.55)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(3, 9.6); ctx.lineTo(4.2, 18.6); ctx.stroke();
    ctx.fillStyle = P.coatDk;
    ctx.beginPath(); ctx.moveTo(-6, -9.6); ctx.lineTo(-11, -14.5); ctx.lineTo(-11.5, -7.6); ctx.closePath(); ctx.fill(); line(1.2);
    ctx.beginPath(); ctx.moveTo(6, -9.6); ctx.lineTo(11, -14.5); ctx.lineTo(11.5, -7.6); ctx.closePath(); ctx.fill(); line(1.2);

    // Head floats just above the collar, trailing the body a touch (follow-through).
    const hb = reduce ? 0 : Math.sin(t * 0.0026 - 0.7) * 0.9;
    ctx.save(); ctx.translate(0, hb + (pose === "investigate" ? 1 : 0)); ctx.rotate(pose === "investigate" ? 0.1 : 0);
    const hg = ctx.createLinearGradient(0, -34, 0, -11);
    hg.addColorStop(0, P.steelHi); hg.addColorStop(1, P.steel);
    ctx.fillStyle = hg; ctx.beginPath(); ctx.roundRect(-16, -34, 33, 22.5, 8); ctx.fill(); line(1.8);
    ctx.fillStyle = P.steel; ctx.beginPath(); ctx.arc(-15.5, -22.5, 3.2, 0, TAU); ctx.fill(); line(1.3);
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(-15.5, -22.5, 1.1, 0, TAU); ctx.fill();
    ctx.fillStyle = P.visor; ctx.beginPath(); ctx.roundRect(-7.5, -29.5, 22.5, 13.5, 5.5); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-4, -27.8); ctx.lineTo(11, -27.8); ctx.stroke();
    eyes(t, alarm);
    // Fedora: brim, pinched crown, band. Hops on alarm.
    ctx.save(); ctx.translate(1, -33.5 + me.hatY); ctx.rotate(-0.07);
    ctx.fillStyle = P.hat;
    ctx.beginPath(); ctx.ellipse(0, 0, 21, 4.3, 0, 0, TAU); ctx.fill(); line(1.5);
    ctx.beginPath(); ctx.moveTo(-12, -0.5); ctx.bezierCurveTo(-13, -12, -9, -15.5, -3, -13.6); ctx.quadraticCurveTo(0, -11.4, 3, -13.6);
    ctx.bezierCurveTo(9, -15.5, 13, -12, 12, -0.5); ctx.closePath(); ctx.fill(); line(1.5);
    ctx.strokeStyle = P.hatHi; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-9.6, -3); ctx.quadraticCurveTo(-10.4, -10, -6.5, -12.6); ctx.stroke();
    ctx.fillStyle = P.band; ctx.fillRect(-12.2, -4.6, 24.4, 3.6);
    ctx.restore();
    ctx.restore();

    // Front arm plus whatever the pose has it holding.
    limb(9, -4, me.arm, P.coat, true);
    const hx = 9 + Math.cos(me.arm) * 15, hy = -4 + Math.sin(me.arm) * 15;
    if (pose === "investigate") {
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(me.arm);
      ctx.strokeStyle = P.band; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(7, 0); ctx.stroke();
      ctx.fillStyle = "rgba(170,230,255,.28)"; ctx.beginPath(); ctx.arc(14.5, 0, 7.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = P.ink; ctx.lineWidth = 3.4; ctx.stroke();
      ctx.strokeStyle = P.brass; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(14.5, 0, 4.4, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke();
      ctx.restore();
    } else if (pose === "success") {
      ctx.fillStyle = P.steel; ctx.beginPath(); ctx.roundRect(hx - 1.6, hy - 10, 3.4, 7.5, 1.7); ctx.fill(); line(1.3);
    }
    hand(hx, hy, pose === "success" ? 4.6 : 3.8);

    // Punctuation over the hat: "!" when alarmed, "?" while an assertion is still pending.
    const mark = alarm ? "!" : seq?.kind === "expect" && pending && t - seq.t0 > 1400 ? "?" : "";
    if (mark) {
      const k = easeOut((t - (alarm ? me.poseT : seq.t0 + 1400)) / 220);
      ctx.save(); ctx.translate(fs * 4, -58 + me.hatY - 4 * k); ctx.scale(fs * (1.3 - 0.3 * k), 1.3 - 0.3 * k);
      ctx.globalAlpha = k; ctx.font = "900 15px ui-monospace, Consolas, monospace"; ctx.textAlign = "center";
      ctx.lineWidth = 3; ctx.strokeStyle = P.ink; ctx.strokeText(mark, 0, 0); ctx.fillStyle = alarm ? P.red : P.amber; ctx.fillText(mark, 0, 0);
      ctx.restore();
    }
    ctx.restore();

    function limb(x, y, a, color, front) {
      const ex = x + Math.cos(a) * 15, ey = y + Math.sin(a) * 15;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey);
      ctx.strokeStyle = P.ink; ctx.lineWidth = 8.4; ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 5.6; ctx.stroke();
      if (!front) hand(ex, ey, 3.3);
    }
    function hand(x, y, r) { ctx.fillStyle = P.steel; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); line(1.3); }
  }

  function eyes(t, alarm) {
    const blink = t - me.blinkT < 130 && !alarm, pose = me.pose;
    const ox = me.eyeX, oy = me.eyeY;
    const col = alarm ? P.red : pose === "success" ? P.green : P.cyan, rgb = alarm ? RGB.red : pose === "success" ? RGB.green : RGB.cyan;
    for (const [cx0, front] of [[1, false], [10, true]]) {
      const cx = cx0 + ox, cy = -22.8 + oy;
      ctx.fillStyle = `rgba(${rgb},.22)`; ctx.beginPath(); ctx.roundRect(cx - 4, cy - 4.8, 8, 9.6, 3.5); ctx.fill();
      ctx.fillStyle = col; ctx.strokeStyle = col;
      ctx.beginPath();
      if (pose === "success") { ctx.lineWidth = 2; ctx.arc(cx, cy + 1.8, 2.6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); continue; }
      if (alarm) { // angry: inner top corners drop
        const inner = front ? -1 : 1;
        ctx.moveTo(cx - 2.6, cy + (inner < 0 ? -1.2 : -3.4)); ctx.lineTo(cx + 2.6, cy + (inner < 0 ? -3.4 : -1.2)); ctx.lineTo(cx + 2.6, cy + 3); ctx.lineTo(cx - 2.6, cy + 3); ctx.closePath(); ctx.fill(); continue;
      }
      if (blink) { ctx.fillRect(cx - 2.6, cy - 0.5, 5.2, 1.2); continue; }
      if (pose === "investigate") { if (front) { ctx.arc(cx, cy, 3.5, 0, TAU); ctx.fill(); ctx.fillStyle = P.visor; ctx.beginPath(); ctx.arc(cx + 0.8, cy - 0.3, 1.2, 0, TAU); ctx.fill(); } else ctx.fillRect(cx - 2.6, cy - 0.6, 5.2, 1.8); continue; }
      if (pose === "aim" || pose === "fire") { ctx.roundRect(cx - 2.7, cy - 1.4, 5.4, 3, 1.2); ctx.fill(); continue; }
      ctx.roundRect(cx - 2.3, cy - 3.2, 4.6, 6.4, 2); ctx.fill();
    }
  }

  function drawShots(t) {
    for (let i = shots.length - 1; i >= 0; i--) {
      const u = shots[i], k = (t - u.t0) / u.dur;
      if (k >= 1) {
        shots.splice(i, 1);
        spark(u.x1, u.y1, u.heavy ? 9 : 5, u.heavy ? 380 : 260, ["#fff3c4", "#ffc857", "#ff8a3d"]);
        if (rings.length < 40) rings.push({ x: u.x1, y: u.y1, t0: t, dur: 260, r0: 2, r1: u.heavy ? 24 : 13, rgb: "255,210,120", w: 2 });
        continue;
      }
      const x = u.x0 + (u.x1 - u.x0) * k, y = u.y0 + (u.y1 - u.y0) * k, d = Math.hypot(u.x1 - u.x0, u.y1 - u.y0) || 1;
      const tl = u.heavy ? 30 : 22, bx = x - ((u.x1 - u.x0) / d) * tl, by = y - ((u.y1 - u.y0) / d) * tl;
      const g = ctx.createLinearGradient(bx, by, x, y);
      g.addColorStop(0, "rgba(255,200,90,0)"); g.addColorStop(1, u.heavy ? "#ffb347" : "#fff1b8");
      ctx.strokeStyle = g; ctx.lineWidth = u.heavy ? 3.6 : 2.2; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(x, y); ctx.stroke();
    }
    if (t - me.flashT < 70 && (me.pose === "fire" || failing)) { // muzzle flash
      const r = failing ? 11 : 7;
      ctx.fillStyle = "rgba(255,240,190,.95)"; ctx.beginPath();
      for (let j = 0; j < 8; j++) { const a = me.aim + (j * TAU) / 8, rr = j % 2 ? r * 0.45 : r; ctx.lineTo(me.mx + Math.cos(a) * rr, me.my + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
    }
    if (failing && t - me.chargeT < 330) { // cannon charging up before it fires (anticipation)
      const k = easeOut((t - me.chargeT) / 330);
      ctx.fillStyle = `rgba(255,120,60,${0.25 + 0.5 * k})`; ctx.beginPath(); ctx.arc(me.mx, me.my, 3 + 7 * k, 0, TAU); ctx.fill();
    }
  }
  function drawParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt * 1000;
      if (p.life > p.max) { parts.splice(i, 1); continue; }
      p.vy += 900 * dt; p.vx *= 1 - dt * 1.5; p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.c;
      if (p.kind === "chunk") {
        p.rot += p.vr * dt;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66); ctx.restore();
      } else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
  function drawRings(t) {
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i], k = (t - r.t0) / r.dur;
      if (k >= 1) { rings.splice(i, 1); continue; }
      const e = easeOut(k);
      if (r.fill) { ctx.fillStyle = `rgba(${r.rgb},${(1 - e) * 0.85})`; ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, TAU); ctx.fill(); continue; }
      ctx.strokeStyle = `rgba(${r.rgb},${1 - e})`; ctx.lineWidth = r.w * (1 - e * 0.6);
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, TAU); ctx.stroke();
    }
  }
  function drawStamps(t) {
    for (let i = stamps.length - 1; i >= 0; i--) {
      const s = stamps[i], e = t - s.t0;
      if (e > 1250) { stamps.splice(i, 1); continue; }
      const k = easeOut(e / 200), sc = reduce ? 1 : 1.35 - 0.35 * k, a = e > 950 ? 1 - (e - 950) / 300 : k;
      ctx.save(); ctx.translate(s.x, s.y); ctx.scale(sc, sc); ctx.rotate(-0.12); ctx.globalAlpha = a;
      ctx.fillStyle = P.green; ctx.beginPath(); ctx.arc(0, 0, 10.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#062a17"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(-4.6, 0.4); ctx.lineTo(-1.4, 3.6); ctx.lineTo(4.8, -3.6); ctx.stroke();
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- failure
  const fx = (cls, css) => { const el = document.createElement("div"); el.className = cls; Object.assign(el.style, css); layer.appendChild(el); return el; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function crackSvg(w, h) {
    const cx = w / 2, cy = h / 2, lines = [];
    for (let i = 0; i < 10; i++) {
      const a = (TAU * i) / 10 + Math.random() * 0.4, len = Math.min(240, Math.max(w, h) * (0.3 + Math.random() * 0.25));
      let d = `M${cx} ${cy}`;
      for (let s = 1; s <= 4; s++) d += ` L${(cx + (Math.cos(a + (Math.random() - 0.5) * 0.5) * len * s) / 4).toFixed(1)} ${(cy + (Math.sin(a + (Math.random() - 0.5) * 0.5) * len * s) / 4).toFixed(1)}`;
      lines.push(`<path d="${d}" stroke="#1a0a00" stroke-width="${(2.4 - i * 0.15).toFixed(2)}" fill="none" stroke-linecap="round"/>`);
    }
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${lines.join("")}</svg>`;
  }

  async function strike(text) {
    mount();
    if (failing) return;
    failing = true;
    const what = caseEl.querySelector(".d")?.textContent, verb = caseEl.querySelector(".v")?.textContent;
    const el = (pending?.el?.isConnected && pending.el) || (lastTarget?.isConnected && lastTarget) || document.querySelector("main") || document.body;
    seq = null; pending = null;
    let f = rectOf(el);
    if (!f.w || f.t + f.h < 0 || f.t > innerHeight) { el.scrollIntoView?.({ block: "center" }); await wait(260); f = rectOf(el); }
    if (!f.w) f = { l: innerWidth / 2 - 60, t: innerHeight / 2 - 30, w: 120, h: 60, cx: innerWidth / 2, cy: innerHeight / 2 };
    focusEl = el; focus = f;
    setTarget(f.cx < innerWidth / 2 ? f.cx + Math.min(230, innerWidth / 3) : f.cx - Math.min(230, innerWidth / 3), f.t - 90);
    pose("alarm"); me.hatV -= 300; me.sqV -= 3;
    caseEl.classList.remove("on"); // the banner carries the step; the tag owns the spot above the element
    hud("bad");
    fx("reticle", { left: `${f.l - 6}px`, top: `${f.t - 6}px`, width: `${f.w + 12}px`, height: `${f.h + 12}px` });
    fx("bug", { left: `${clamp(f.cx, 70, innerWidth - 70)}px`, top: `${Math.max(36, f.t - 10)}px` }).innerHTML = "<span>BUG FOUND HERE</span>";
    await wait(reduce ? 250 : 820); // swarm assembles the cannon, staggered
    if (!reduce) {
      me.chargeT = performance.now();
      await wait(330);
      for (let i = 0; i < 10; i++) { shoot(true); await wait(80); }
      await wait(220);
    }
    // Impact.
    const t = performance.now(), w = Math.max(80, f.w + 40), h = Math.max(60, f.h + 40);
    fx("scorch", { left: `${f.cx - w / 2}px`, top: `${f.cy - h / 2}px`, width: `${w}px`, height: `${h}px` });
    if (!reduce) fx("crack", { left: `${f.cx - w}px`, top: `${f.cy - h}px`, width: `${w * 2}px`, height: `${h * 2}px` }).innerHTML = crackSvg(w * 2, h * 2);
    if (!reduce) {
      rings.push({ x: f.cx, y: f.cy, t0: t, dur: 220, r0: 10, r1: 70, rgb: "255,245,210", fill: true });
      rings.push({ x: f.cx, y: f.cy, t0: t, dur: 650, r0: 10, r1: Math.max(f.w, f.h) * 0.7 + 70, rgb: "255,190,80", w: 5 });
      spark(f.cx, f.cy, 34, 620, ["#fff3c4", "#ffc857", "#ff8a3d", "#ff4545"]);
      const colors = ["#2a2f3a", "#6b4a2a", "#c8c2b8", "#ff8a3d", "#1b140d"];
      for (let j = 0; j < 26 && parts.length < MAXP; j++) {
        const a = rand(Math.PI * 1.05, Math.PI * 1.95), v = rand(220, 560);
        parts.push({ x: f.cx + rand(-f.w / 4, f.w / 4), y: f.cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rand(700, 1200), size: rand(3, 7.5), c: colors[j % 5], kind: "chunk", rot: rand(0, TAU), vr: rand(-12, 12) });
      }
      shakeAmt = 7;
      try {
        el.animate([{ transform: "none", filter: "none" }, { transform: "translate(6px,-4px) rotate(-3deg)", filter: "sepia(1) saturate(3) brightness(.6)" }, { transform: "translate(-4px,10px) rotate(4deg)", filter: "sepia(1) saturate(4) brightness(.45) blur(.6px)" }], { duration: 900, fill: "forwards", easing: "cubic-bezier(.23,1,.32,1)" });
        document.documentElement.animate([{ transform: "translate(0,0)" }, { transform: "translate(-9px,5px)" }, { transform: "translate(8px,-6px)" }, { transform: "translate(-5px,3px)" }, { transform: "translate(0,0)" }], { duration: 420 });
      } catch {}
    }
    const b = fx("banner", {});
    const strong = document.createElement("b"), small = document.createElement("small");
    strong.textContent = `BUG FOUND · ${text ?? "test failed"}`;
    small.textContent = `step ${step}${verb ? ` · last action ${verb}${what ? ` ${what}` : ""}` : ""}`;
    b.append(strong, small);
    await wait(reduce ? 700 : 2000);
  }

  // ---------------------------------------------------------------- page events
  addEventListener("mousemove", (e) => { mouse = { x: e.clientX, y: e.clientY }; mount(); }, { capture: true, passive: true });
  addEventListener("pointerdown", (e) => act(e.target, "CLICK"), { capture: true, passive: true });
  addEventListener("input", (e) => act(e.target, e.target?.tagName === "SELECT" ? "SELECT" : "FILL"), { capture: true, passive: true });
  addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === "Escape") && !e.repeat && e.target instanceof Element) { act(e.target, "PRESS", e.key); }
  }, { capture: true, passive: true });

  window.__qaDrone = { strike, expect: expectSignal, done };
  if (document.readyState !== "loading") mount(); else addEventListener("DOMContentLoaded", mount, { once: true });
})();
