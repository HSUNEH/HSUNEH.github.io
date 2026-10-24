// 랙을 WebGL로 그린다. 자리와 크기는 숨긴 DOM 랙에서 읽고(레이아웃의 원천은 그대로 DOM), 카메라는 CSS 카메라 값을 옮긴다(y만 뒤집는다).
// 부품 모양은 Blender로 만든 models/parts.glb(assets/blender/rack_parts.py). WebGL이 없으면 이 파일은 아무것도 하지 않고 CSS 랙이 남는다.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from './vendor/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from './vendor/jsm/environments/RoomEnvironment.js';

const R = window.RACK;
const doc = document.documentElement;
// 높이(y, 책상 0 기준 px): 케이스 윗면 26, 판 윗면 28.5. 케이블은 플러그 위에서 나온다
const Y = { case: 26, panel: 28.5, plug: 11 };
const SIGNAL = new THREE.Color('#ff5a1f');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) { renderer = null; }
if (renderer && R && !R.flat()) start();

async function start() {
  const parts = await new GLTFLoader().loadAsync('models/parts.glb').catch(() => null);
  if (!parts) return;
  await document.fonts.ready;
  const P = {}; parts.scene.children.forEach(o => { P[o.name] = o; });

  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const cvs = renderer.domElement; cvs.className = 'gl'; cvs.setAttribute('aria-hidden', 'true');
  document.getElementById('stage').appendChild(cvs);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, 40, 20000);
  const hemi = new THREE.HemisphereLight(0xfff4ea, 0x2a2522, .6); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1e4, 2.2); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0004; key.shadow.radius = 6;
  scene.add(key, key.target);
  const glow = new THREE.PointLight(0xff6a30, 0, 520, 1.6); scene.add(glow);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: .42 })); floor.receiveShadow = true; scene.add(floor);

  // ── 재질 ──
  const M = {
    metal: new THREE.MeshStandardMaterial({ color: 0xbdbdb8, metalness: 1, roughness: .32 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe2e2df, metalness: 1, roughness: .15 }),
    dark_metal: new THREE.MeshStandardMaterial({ color: 0x55565a, metalness: 1, roughness: .4 }),
    knob: new THREE.MeshStandardMaterial({ color: 0x0f1013, roughness: .45 }),
    knob_cap: new THREE.MeshPhysicalMaterial({ color: 0x1d1e22, roughness: .3, clearcoat: .6, clearcoatRoughness: .25 }),
    line: new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: .5 }),
    hole: new THREE.MeshBasicMaterial({ color: 0x050506 }),
    pad: new THREE.MeshPhysicalMaterial({ color: 0xd9d7d1, roughness: .7, sheen: .5, sheenRoughness: .8, sheenColor: 0xffffff }),
    led: new THREE.MeshPhysicalMaterial({ color: 0x5a2a1c, roughness: .12, transmission: 0, clearcoat: 1, emissive: SIGNAL, emissiveIntensity: 0 }),
    case: new THREE.MeshStandardMaterial({ color: 0x232428, metalness: .55, roughness: .5 }),
    cheek: new THREE.MeshStandardMaterial({ color: 0x2c2d32, metalness: .7, roughness: .38 }),
    cable: new THREE.MeshPhysicalMaterial({ color: 0x1f2024, roughness: .42, clearcoat: .5, clearcoatRoughness: .4 }),
    sig: new THREE.MeshPhysicalMaterial({ color: 0xc8380a, emissive: 0xff3c00, emissiveIntensity: .32, roughness: .38, clearcoat: .6, clearcoatRoughness: .3 }),
    boot: new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: .5, metalness: .2 }),
  };
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,120,60,.9)'); gr.addColorStop(.3, 'rgba(255,80,20,.4)'); gr.addColorStop(1, 'rgba(255,90,31,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const part = (name, mats = {}) => {
    const g = P[name].clone(true);
    g.traverse(o => { if (o.isMesh) { const n = o.material.name; o.material = mats[n] || M[n] || o.material; o.castShadow = true; o.receiveShadow = true; } });
    return g;
  };

  const root = new THREE.Group(); scene.add(root);
  let built = null, lastKey = '', gen = 0;
  const relBox = (el, top) => { let x = 0, y = 0, n = el; while (n && n !== top) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; } return [x, y, el.offsetWidth, el.offsetHeight]; };

  // ── 패널 인쇄: DOM 글자 자리에 같은 글꼴로 캔버스에 찍는다 ──
  const logoImg = {};
  const loadLogo = src => logoImg[src] || (logoImg[src] = new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; }));
  function drawText(ctx, el, ox, oy) {
    const cs = getComputedStyle(el), [x, y, w, h] = relBox(el, ox);
    let t = el.textContent.trim(); if (!t) return; if (cs.textTransform === 'uppercase') t = t.toUpperCase();
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    ctx.fillStyle = cs.color; ctx.textBaseline = 'middle';
    const align = cs.textAlign === 'center' ? 'center' : 'left'; ctx.textAlign = align;
    // 줄바꿈은 DOM 폭으로 다시 나눈다
    const lines = [], words = t.split(/\s+/); let cur = '';
    words.forEach(wd => { const nx = cur ? cur + ' ' + wd : wd; if (ctx.measureText(nx).width > w + 1 && cur) { lines.push(cur); cur = wd; } else cur = nx; }); lines.push(cur);
    const lh = h / lines.length;
    lines.forEach((ln, i) => ctx.fillText(ln, align === 'center' ? x + w / 2 : x, y + lh * (i + .5)));
  }
  async function drawLogo(ctx, el, top, color) {
    const src = (el.style.getPropertyValue('--src').match(/url\((.+)\)/) || [])[1]; if (!src) return;
    const img = await loadLogo(src); if (!img) return;
    const [x, y, w, h] = relBox(el, top), s = 4, o = document.createElement('canvas'); o.width = w * s; o.height = h * s;
    const c = o.getContext('2d'); const ar = img.width / img.height || w / h;
    let dw = w * s, dh = dw / ar; if (dh > h * s) { dh = h * s; dw = dh * ar; }
    c.drawImage(img, (w * s - dw) / 2, (h * s - dh) / 2, dw, dh); c.globalCompositeOperation = 'source-in'; c.fillStyle = color; c.fillRect(0, 0, w * s, h * s);
    ctx.drawImage(o, x, y, w, h);
  }
  async function printPanel(m) {
    const el = m.el, w = el.offsetWidth, h = el.offsetHeight, s = 3, cv = document.createElement('canvas'); cv.width = w * s; cv.height = h * s;
    const ctx = cv.getContext('2d'); ctx.scale(s, s);
    const dark = el.classList.contains('dark');
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (dark) { g.addColorStop(0, '#34353b'); g.addColorStop(1, '#202126'); } else { g.addColorStop(0, '#e4e4e0'); g.addColorStop(1, '#c9c9c4'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // 헤어라인: 세로 결
    for (let x = 0; x < w; x += .5) { ctx.fillStyle = `rgba(${dark ? '255,255,255' : '0,0,0'},${(Math.sin(x * 12.9898) * 43758.5453 % 1 + 1) % 1 * (dark ? .025 : .045)})`; ctx.fillRect(x, 0, .5, h); }
    const name = el.querySelector('.name');
    if (name.classList.contains('logos')) { const col = getComputedStyle(name).color; for (const l of name.querySelectorAll('.logo')) await drawLogo(ctx, l, el, col); }
    else drawText(ctx, name, el);
    el.querySelectorAll('.sub, .jack-l').forEach(t => drawText(ctx, t, el));
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return tex;
  }

  // ── 화면들: 스코프는 본 스크립트가 그린 캔버스를, 장르·VU는 여기서 그린 캔버스를 쓴다 ──
  function screenTex(cv) { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; }
  function drawGenres(sc) {
    const el = sc.el, w = el.offsetWidth, h = el.offsetHeight, s = 3, c = sc.cv.getContext('2d');
    c.setTransform(s, 0, 0, s, 0, 0); c.fillStyle = '#0e1011'; c.fillRect(0, 0, w, h);
    const on = el.closest('.mod').classList.contains('on');
    el.querySelectorAll('span').forEach(sp => {
      const [x, y, sw, sh] = relBox(sp, el), cs = getComputedStyle(sp);
      c.font = `500 ${cs.fontSize} ${cs.fontFamily}`; c.letterSpacing = cs.letterSpacing; c.textBaseline = 'middle';
      c.fillStyle = '#5d5f5f'; c.textAlign = 'left'; c.fillText('TRK', x, y + sh / 2);
      if (on) { c.fillStyle = '#ff5a1f'; c.textAlign = 'right'; c.fillText(sp.querySelector('b').textContent, x + sw, y + sh / 2); }
    });
    sc.key = String(on);
  }
  function drawVU(sc) {
    const el = sc.el, w = el.offsetWidth, h = el.offsetHeight, s = 3, c = sc.cv.getContext('2d');
    c.setTransform(s, 0, 0, s, 0, 0);
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f6efd9'); g.addColorStop(1, '#e4d9b9'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(58,59,63,.5)'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(w / 2, h + 28 - 35, w / 2 - 14, 35, 0, Math.PI, 2 * Math.PI); c.stroke();
    const t = el.querySelector('.t'), v = el.querySelector('.v');
    c.font = `500 7.5px "IBM Plex Mono"`; c.letterSpacing = '.9px'; c.fillStyle = '#3a3b3f'; c.textBaseline = 'top'; c.textAlign = 'left'; c.fillText(t.textContent, 8, 6);
    c.font = `800 13px "Bricolage Grotesque"`; c.letterSpacing = '0px'; c.fillStyle = '#1c1d21'; c.textAlign = 'right'; c.fillText(v.textContent, w - 8, 5);
    const a = (+el.dataset.a || -50) * Math.PI / 180; c.strokeStyle = '#1c1d21'; c.lineWidth = 2; c.beginPath(); c.moveTo(w / 2, h + 8); c.lineTo(w / 2 + Math.sin(a) * 58, h + 8 - Math.cos(a) * 58); c.stroke();
    c.strokeStyle = '#3a3b3f'; c.lineWidth = 4; c.strokeRect(0, 0, w, h);
    sc.key = v.textContent + el.dataset.a;
  }

  // ── 케이블: 튜브. 신호는 같은 길을 따라 그려지는 주황 튜브(drawRange) ──
  function cable(pts, r = 3.6) {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), seg = 96, rad = 12;
    const base = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, rad), M.cable); base.castShadow = true;
    // 신호가 지나간 구간은 같은 길의 조금 굵은 주황 튜브가 덮는다
    const sig = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r * 1.06, rad), M.sig); sig.castShadow = true;
    root.add(base, sig);
    return { base, sig, per: rad * 6, seg };
  }
  const setRange = (m, f, c) => m.geometry.setDrawRange(0, Math.round(c.seg * Math.max(0, Math.min(1, f))) * c.per);
  function plugAt(x, y, z) { // 잭에 꽂힌 플러그 몸통
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.4, Y.plug, 24), M.boot); body.position.y = Y.plug / 2; body.castShadow = true;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 1.6, 24), M.chrome); ring.position.y = .8;
    g.add(body, ring); g.position.set(x, y, z); root.add(g);
  }

  async function build(info) {
    const run = ++gen; // 크기가 바뀌어 다시 빌드하면 앞선 빌드는 멈춘다
    root.clear();
    const { rack, mods, rackX, rackZ, rackW, rackH } = info;
    const W2 = (rx, ry, y = Y.panel) => new THREE.Vector3(rackX + rx, y, rackZ + ry);
    const B = { mods: [], knobs: [], pads: [], toggles: [], leds: [], screens: [], patches: [], hit: [] };

    // 케이스, 레일, 옆판
    const cs = new THREE.Mesh(new RoundedBoxGeometry(rackW, Y.case, rackH, 3, 5), M.case); cs.position.copy(W2(rackW / 2, rackH / 2, Y.case / 2)); cs.castShadow = cs.receiveShadow = true; root.add(cs);
    const railTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 16; const x = c.getContext('2d'); x.fillStyle = '#c4c4be'; x.fillRect(0, 0, 64, 16); x.fillStyle = '#5c5c58'; x.fillRect(0, 0, 4, 16); x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(0, 0, 64, 2); const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set((rackW - 28) / 22, 1); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const railM = new THREE.MeshStandardMaterial({ map: railTex, metalness: .85, roughness: .35 });
    [8.5, rackH - 8.5].forEach(z => { const r = new THREE.Mesh(new THREE.BoxGeometry(rackW - 28, 2.4, 9), railM); r.position.copy(W2(rackW / 2, z, Y.case + 1.2)); r.receiveShadow = r.castShadow = true; root.add(r); });
    [[-6, 16], [rackW - 10, 16]].forEach(([x, w]) => { const c = new THREE.Mesh(new RoundedBoxGeometry(w, Y.case + 22, rackH + 4, 3, 4), M.cheek); c.position.copy(W2(x + w / 2, rackH / 2, (Y.case + 22) / 2)); c.castShadow = c.receiveShadow = true; root.add(c); });

    for (const m of mods) {
      const el = m.el, [mx, my, mw, mh] = relBox(el, rack);
      const dark = el.classList.contains('dark');
      const tex = await printPanel(m);
      if (run !== gen) return false;
      const mat = new THREE.MeshStandardMaterial({ map: tex, metalness: dark ? .35 : .55, roughness: dark ? .5 : .36 });
      const edgeM = new THREE.MeshStandardMaterial({ color: dark ? 0x1a1b1f : 0xa9a9a4, metalness: .8, roughness: .35 });
      const plate = new THREE.Mesh(new RoundedBoxGeometry(mw - .6, Y.panel - Y.case, mh, 2, .7), edgeM); plate.position.copy(W2(mx + mw / 2, my + mh / 2, (Y.case + Y.panel) / 2)); plate.castShadow = plate.receiveShadow = true;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(mw - 1.4, mh - 1.4).rotateX(-Math.PI / 2), mat); face.position.copy(W2(mx + mw / 2, my + mh / 2, Y.panel + .25)); face.receiveShadow = true;
      root.add(plate, face);
      B.mods.push({ el, mat, edgeM });

      const at = (sel, fn) => el.querySelectorAll(sel).forEach(d => { const [x, y, w, h] = relBox(d, rack); fn(d, x + w / 2, y + h / 2, w, h); });
      at('.screw', (d, x, y, w) => { const s = part('screw'); s.scale.setScalar(w); s.scale.y = w * .8; s.position.copy(W2(x, y)); s.rotation.y = Math.random() * 3; root.add(s); });
      at('.led', (d, x, y, w) => { const mt = M.led.clone(); const l = part('led', { led: mt }); l.scale.setScalar(w); l.position.copy(W2(x, y)); root.add(l);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.scale.setScalar(w * 4.2); sp.position.copy(W2(x, y, Y.panel + 6)); root.add(sp);
        B.leds.push({ d, mt, sp, pos: W2(x, y, Y.panel + 4) }); });
      at('.jack', (d, x, y, w) => { const j = part('jack'); j.scale.setScalar(w); j.position.copy(W2(x, y)); root.add(j); if (d.closest('.bigjack')) B.outJack = { pos: W2(x, y, Y.panel + .282 * w), r: .205 * w }; });
      at('.knob', (d, x, y, w) => {
        const k = part('knob'); k.scale.set(w, w * .72, w); k.position.copy(W2(x, y)); root.add(k);
        const ent = R.knobs.find(q => q.el === d); B.knobs.push({ g: k, ent }); k.traverse(o => { if (o.isMesh) { o.userData.hit = { type: 'knob', ent }; B.hit.push(o); } });
      });
      at('.toggle', (d, x, y, w) => {
        const t = part('toggle'); t.scale.setScalar(w); t.position.copy(W2(x, y)); root.add(t);
        B.toggles.push({ d, lever: t.getObjectByName('toggle_lever'), a: 0 }); t.traverse(o => { if (o.isMesh) { o.userData.hit = { type: 'click', d }; B.hit.push(o); } });
      });
      at('.pads button', (d, x, y, w, h) => {
        const mt = M.pad.clone(); const p = part('pad', { pad: mt }); p.scale.set(w / 2.66, 22, h); p.position.copy(W2(x, y)); root.add(p);
        // 윗면 글자: 투명 캔버스를 패드 윗면 바로 위에 얹는다
        const lc = document.createElement('canvas'), s = 4; lc.width = w * s; lc.height = h * s;
        const lx = lc.getContext('2d'), cs = getComputedStyle(d); lx.scale(s, s);
        lx.font = `500 ${cs.fontSize} ${cs.fontFamily}`; lx.letterSpacing = cs.letterSpacing; lx.textAlign = 'center'; lx.textBaseline = 'middle';
        const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace; lt.anisotropy = 8;
        const label = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: lt, transparent: true, depthWrite: false }));
        label.position.copy(W2(x, y, Y.panel + 6.9)); root.add(label);
        B.pads.push({ d, p, mt, z: 0, label, lx, lt, w, h, text: d.textContent.trim(), lit: null }); p.traverse(o => { if (o.isMesh) { o.userData.hit = { type: 'click', d }; B.hit.push(o); } });
      });
      at('.screen, .vu', (d, x, y, w, h) => {
        let cv, kind;
        cv = document.createElement('canvas'); cv.width = w * 3; cv.height = h * 3;
        const src = d.querySelector('canvas'); kind = src ? 'scope' : d.classList.contains('vu') ? 'vu' : 'genres';
        const tex = screenTex(cv);
        const glass = new THREE.MeshPhysicalMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: kind === 'vu' ? .95 : 1.25, roughness: .12, clearcoat: 1, clearcoatRoughness: .05 });
        const bez = new THREE.Mesh(new RoundedBoxGeometry(w + 4, 1.6, h + 4, 2, .7), M.case); bez.position.copy(W2(x, y, Y.panel + .8)); bez.receiveShadow = true;
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), glass); scr.position.copy(W2(x, y, Y.panel + 2.1));
        root.add(bez, scr);
        B.screens.push({ el: d, cv, tex, kind, key: '', src });
      });
    }
    // 패치 케이블: OUT → 다음 IN. 플러그에서 위로 나와 앞으로 늘어지고, 랙 앞 모서리를 넘으면 책상 쪽으로 처진다
    const front = rackZ + rackH;
    const top = d => { const [x, y, w] = relBox(d, rack); return W2(x + w / 2, y + w / 2, Y.panel + .282 * w); };
    for (let i = 0; i < mods.length - 1; i++) {
      const a = top(mods[i].el.querySelector('.jack.out')), b = top(mods[i + 1].el.querySelector('.jack.in'));
      plugAt(a.x, a.y, a.z); plugAt(b.x, b.y, b.z);
      const dx = b.x - a.x, sag = 60 + dx * .3, low = z => z > front ? Math.max(6, Y.case + 6 - (z - front) * .9) : Y.case + 8;
      const pts = [new THREE.Vector3(a.x, a.y + Y.plug, a.z), new THREE.Vector3(a.x + 2, a.y + Y.plug + 10, a.z + 14), new THREE.Vector3(a.x + dx * .18, low(a.z + sag * .7) + 4, a.z + sag * .7), new THREE.Vector3(a.x + dx * .5, low(a.z + sag), a.z + sag), new THREE.Vector3(b.x - dx * .18, low(b.z + sag * .7) + 4, b.z + sag * .7), new THREE.Vector3(b.x - 2, b.y + Y.plug + 10, b.z + 14), new THREE.Vector3(b.x, b.y + Y.plug, b.z)];
      B.patches.push(cable(pts));
    }
    // 책상 케이블: 벽 소켓 밑에서 내려와 책상을 따라 앞으로, 랙 앞 모서리를 넘어 첫 IN으로
    {
      const j = top(mods[0].el.querySelector('.jack.in')), ex = info.edgeX;
      plugAt(j.x, j.y, j.z);
      const pts = [new THREE.Vector3(ex, info.lift - 8, 3), new THREE.Vector3(ex, 10, 26), new THREE.Vector3(ex + 8, 4.5, 90), new THREE.Vector3(ex + 30, 4.5, front + 30), new THREE.Vector3(j.x - 40, 4.5, front + 46), new THREE.Vector3(j.x - 12, Y.case + 12, front + 6), new THREE.Vector3(j.x - 2, j.y + Y.plug + 12, j.z + 16), new THREE.Vector3(j.x, j.y + Y.plug, j.z)];
      B.desk = cable(pts);
    }
    // 빛과 그림자 범위
    const cx = rackX + rackW / 2, cz = rackZ + rackH / 2;
    key.position.set(cx - 420, 1100, cz + 700); key.target.position.set(cx, 0, cz);
    const sc = key.shadow.camera, ext = Math.max(rackW, rackH) * .7 + 200; Object.assign(sc, { left: -ext, right: ext, top: ext, bottom: -ext, near: 100, far: 3000 }); sc.updateProjectionMatrix();
    floor.scale.set(rackW * 4, 1, rackH * 6); floor.position.set(cx, 0, cz);
    built = B;
    return true;
  }

  // ── 손: 노브 끌기, 패드·토글 누르기 ──
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let knobDrag = null, hover = null;
  const pick = e => { if (!built || R.camTh() < 20) return null; ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); const h = ray.intersectObjects(built.hit, false)[0]; return h ? h.object.userData.hit : null; };
  const overText = e => e.target.closest && e.target.closest('.info .card.show, .chrome, .stops, .page.open');
  addEventListener('pointerdown', e => {
    if (overText(e)) return;
    const h = pick(e); if (!h) return;
    if (h.type === 'knob') { knobDrag = { ent: h.ent, y0: e.clientY, v0: h.ent.v }; h.ent.touched = true; e.preventDefault(); }
    else { h.d.click(); const p = built.pads.find(q => q.d === h.d); if (p) { p.pressed = true; setTimeout(() => { p.pressed = false; R.kick(); }, 120); } }
    R.kick();
  });
  addEventListener('pointermove', e => {
    if (knobDrag) { R.setKnob(knobDrag.ent, knobDrag.v0 + (knobDrag.y0 - e.clientY) / 160); return; }
    const h = overText(e) ? null : pick(e), c = h ? (h.type === 'knob' ? 'ns-resize' : 'pointer') : '';
    if (c !== hover) { document.body.style.cursor = c; hover = c; }
  }, { passive: true });
  addEventListener('pointerup', () => { knobDrag = null; });

  // ── 매 프레임: 본 스크립트의 render()가 부른다 ──
  const tmp = new THREE.Vector3();
  function frame(s) {
    if (!built) return;
    const { W, H, P, cam, dk } = s;
    // CSS: world = translateZ(P − d) rotateX(−θ) translate(−c). 눈은 c + Rx(θ)(0,0,d), 시선은 Rx(θ)(0,0,−1). y를 뒤집는다
    const th = cam.th * Math.PI / 180, sn = Math.sin(th), co = Math.cos(th);
    camera.fov = 2 * Math.atan(H / 2 / P) * 180 / Math.PI; camera.aspect = W / H; camera.updateProjectionMatrix();
    camera.position.set(cam.x, -(cam.y - cam.d * sn), cam.z + cam.d * co);
    camera.up.set(0, co, -sn);
    camera.lookAt(tmp.set(camera.position.x, camera.position.y - sn, camera.position.z - co));
    // 방이 어두워질수록 환경광을 줄이고, 켜진 모듈은 덜 어둡게
    scene.environmentIntensity = 1 - dk * .55; hemi.intensity = .6 - dk * .4; key.intensity = 2.2 - dk * 1.1;
    built.mods.forEach(m => { const on = m.el.classList.contains('on'), f = 1 - dk * (on ? .16 : .45); m.mat.color.setScalar(f); m.edgeM.color.setScalar(m.el.classList.contains('dark') ? .1 * f : .66 * f); });
    let lit = 0, lx = 0, lz = 0;
    built.leds.forEach(l => { const on = l.d.classList.contains('lit') || (l.d.parentElement.classList.contains('on') && l.d.parentElement.classList.contains('mod')); l.mt.emissiveIntensity = on ? 1.6 : 0; l.mt.color.set(on ? 0xff6a30 : 0x3a1a10); l.sp.visible = on; if (on) { lit++; lx += l.pos.x; lz += l.pos.z; } });
    const sp = s.spot; glow.position.set(sp[0], 260, sp[1] + 120); glow.intensity = dk * 2200;
    built.knobs.forEach(k => { k.g.rotation.y = -(-135 + k.ent.v * 270) * Math.PI / 180; });
    built.toggles.forEach(t => { const a = t.d.classList.contains('up') ? .45 : -.45; t.a += (a - t.a) * .35; t.lever.rotation.x = t.a; });
    built.pads.forEach(p => { const on = p.d.classList.contains('lit'); p.mt.color.set(on ? 0xe0480f : 0xd9d7d1); p.mt.emissive.set(on ? 0xff3c00 : 0x000000); p.mt.emissiveIntensity = on ? .4 : 0; p.p.position.y = Y.panel - (p.pressed ? 3 : 0); p.label.position.y = Y.panel + 6.9 - (p.pressed ? 3 : 0);
      if (p.lit !== on) { p.lit = on; p.lx.clearRect(0, 0, p.w, p.h); p.lx.fillStyle = on ? '#5a1a05' : '#5c5a54'; p.lx.fillText(p.text, p.w / 2, p.h / 2 + .5); p.lt.needsUpdate = true; } });
    built.screens.forEach(sc => {
      if (sc.kind === 'scope') { if (sc.src.dataset.ver !== sc.key && sc.src.width > 0) { sc.key = sc.src.dataset.ver; const c = sc.cv.getContext('2d'); c.fillStyle = '#0e1011'; c.fillRect(0, 0, sc.cv.width, sc.cv.height); c.drawImage(sc.src, 0, 0, sc.cv.width, sc.cv.height); sc.tex.needsUpdate = true; } return; }
      const prev = sc.key; sc.kind === 'vu' ? drawVU(sc) : drawGenres(sc); if (sc.key !== prev) sc.tex.needsUpdate = true;
    });
    built.patches.forEach((c, i) => { setRange(c.sig, s.patch[i] || 0, c); c.sig.visible = (s.patch[i] || 0) > 0; });
    setRange(built.desk.base, s.deskDraw, built.desk); setRange(built.desk.sig, s.deskSig, built.desk); built.desk.sig.visible = s.deskSig > 0;
    const keyNow = W + 'x' + H; if (keyNow !== lastKey) { renderer.setSize(W, H, false); lastKey = keyNow; }
    renderer.render(scene, camera);
  }
  // OUT 잭 구멍이 지금 화면에 보이는 자리와 반지름
  function jackScreen() {
    if (!built || !built.outJack) return null;
    const p = built.outJack.pos.clone().project(camera), q = built.outJack.pos.clone().add(new THREE.Vector3(built.outJack.r, 0, 0)).project(camera);
    const x = (p.x + 1) / 2 * innerWidth, y = (1 - p.y) / 2 * innerHeight, x2 = (q.x + 1) / 2 * innerWidth, y2 = (1 - q.y) / 2 * innerHeight;
    return { x, y, r: Math.hypot(x2 - x, y2 - y) };
  }

  // 첫 빌드가 끝난 뒤에야 CSS 랙을 감춘다
  window.rackGL = { layout: info => build(info).then(ok => { if (ok) { doc.classList.add('gl'); R.kick(); } }).catch(e => console.error('rack-gl', e)), frame, jackScreen };
  R.relayout();
}
