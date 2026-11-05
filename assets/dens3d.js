/* 3D electron-density view of the Ribavirin + B/Zn-doped gamma-graphyne nanotube.
   ES module, loaded on demand by viz.js. three.js r160 from jsDelivr.

   Atoms: the real QuantumATK input geometry (window.MOL_GYNT), ball-and-stick.
   Density: superposition of free-atom (promolecular) valence densities,
     rho(r) = sum_a w_a / ((2 pi)^(3/2) s_a^3) exp(-|r - r_a|^2 / 2 s_a^2),
   drawn as one translucent iso-surface (marching cubes). This is illustrative,
   NOT a self-consistent DFT density. The drug is moved as a rigid body around the
   tube axis and docked through its O atom at a typical distance. */

const V = '0.160.0', CDN = 'https://cdn.jsdelivr.net/npm/three@' + V;

export async function init(host, ui) {
  const THREE = await import(CDN + '/+esm');
  const { OrbitControls } = await import(CDN + '/examples/jsm/controls/OrbitControls.js/+esm');
  const { MarchingCubes } = await import(CDN + '/examples/jsm/objects/MarchingCubes.js/+esm');
  const M = window.MOL_GYNT; if (!M) throw new Error('no structure');
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const n = M.el.length;

  /* ---------------- structure: tube vs drug, sites ---------------- */
  const RC = { H: 0.31, B: 0.84, C: 0.76, N: 0.71, O: 0.66, Zn: 1.22 };
  const adj = Array.from({ length: n }, () => []), bonds = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = M.xyz[i], b = M.xyz[j], d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (d > 0.4 && d < 1.18 * (RC[M.el[i]] + RC[M.el[j]])) { adj[i].push(j); adj[j].push(i); bonds.push([i, j]); }
  }
  const comp = new Int32Array(n).fill(-1); let nc = 0;
  for (let i = 0; i < n; i++) if (comp[i] < 0) { const st = [i]; comp[i] = nc; while (st.length) { const k = st.pop(); for (const m of adj[k]) if (comp[m] < 0) { comp[m] = nc; st.push(m); } } nc++; }
  const dc = comp[M.el.indexOf('O')], drug = [], tube = [];
  for (let i = 0; i < n; i++) (comp[i] === dc ? drug : tube).push(i);
  let cx = 0, cy = 0, cn = 0; for (const k of tube) if (M.el[k] === 'C') { cx += M.xyz[k][0]; cy += M.xyz[k][1]; cn++; }
  cx /= cn; cy /= cn;
  const P0 = M.xyz.map(p => [p[0] - cx, p[1] - cy, p[2]]);
  const site = p => ({ pt: p, r: Math.hypot(p[0], p[1]), phi: Math.atan2(p[1], p[0]), z: p[2] });
  const zn = M.el.indexOf('Zn'), bo = M.el.indexOf('B');
  const sZn = site(P0[zn]), sB = site(P0[bo]);
  // bridging position: 2.0 A from Zn and 1.6 A from B, on the outer side of the tube
  const sZB = (() => {
    const A = P0[zn], Bv = P0[bo], u = [Bv[0] - A[0], Bv[1] - A[1], Bv[2] - A[2]], L = Math.hypot(...u); u.forEach((v, i) => (u[i] = v / L));
    const d1 = 2.0, d2 = 1.6, a = (d1 * d1 - d2 * d2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, d1 * d1 - a * a));
    const P = [A[0] + a * u[0], A[1] + a * u[1], A[2] + a * u[2]], rr = Math.hypot(P[0], P[1]);
    let nrm = [P[0] / rr, P[1] / rr, 0]; const dot = nrm[0] * u[0] + nrm[1] * u[1]; nrm = [nrm[0] - dot * u[0], nrm[1] - dot * u[1], -dot * u[2]];
    const nl = Math.hypot(...nrm); nrm = nrm.map(v => v / nl);
    const X = [P[0] + h * nrm[0], P[1] + h * nrm[1], P[2] + h * nrm[2]], mid = [(A[0] + Bv[0]) / 2, (A[1] + Bv[1]) / 2, (A[2] + Bv[2]) / 2];
    return { pt: mid, r: Math.hypot(X[0], X[1]), phi: Math.atan2(X[1], X[0]), z: X[2] };
  })();
  let best = -1, bs = 1e9;
  for (const k of tube) {
    if (M.el[k] !== 'C') continue;
    const s = site(P0[k]), dp = Math.abs(Math.atan2(Math.sin(s.phi - sZn.phi - Math.PI), Math.cos(s.phi - sZn.phi - Math.PI)));
    const sc = dp * 4 + Math.abs(s.z - sZn.z) * 0.3 - s.r * 0.2; if (sc < bs) { bs = sc; best = k; }
  }
  const sC = site(P0[best]);
  let anc = drug[0], ad = 1e9;
  for (const k of drug) { const p = P0[k], q = P0[zn], d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < ad) { ad = d; anc = k; } }
  const AEL = M.el[anc];
  const SITES = {
    zn: { s: sZn, d: 3.0, label: 'Zn dopant', partners: [[zn, 'Zn']], kind: 'no bond: van der Waals contact' },
    b: { s: sB, d: 3.0, label: 'B dopant', partners: [[bo, 'B']], kind: 'no bond: van der Waals contact' },
    zb: { s: sZB, d: 0, label: 'Zn–B pair', partners: [[zn, 'Zn'], [bo, 'B']], kind: 'bond: O bridging the Zn–B pair' },
    c: { s: sZn, d: 3.0, label: 'undoped C', partners: [[zn, 'C']], kind: 'no bond: van der Waals contact' }
  };
  // each site shows only its own dopant; removed dopants become carbon at the same position (geometry not re-relaxed)
  const SUB = { zb: {}, zn: { [bo]: 'C' }, b: { [zn]: 'C' }, c: { [zn]: 'C', [bo]: 'C' } };
  let variant = 'zb';
  const elOf = k => SUB[variant][k] || M.el[k];

  /* ---------------- docking state ---------------- */
  const cur = { phi: sZB.phi, z: sZB.z, r: sZB.r, d: 0, lift: 6 };
  let key = 'zb', tl = null;
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const ease = u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  function rigid() {   // rotation about the tube axis (dphi) and translation, in the P0 frame
    const dphi = cur.phi - sZn.phi, c = Math.cos(dphi), s = Math.sin(dphi), dz = cur.z - sZn.z;
    const ex = Math.cos(cur.phi), ey = Math.sin(cur.phi), R = cur.r + cur.d + cur.lift;
    const a = P0[anc], ar = [a[0] * c - a[1] * s, a[0] * s + a[1] * c, a[2] + dz];
    return { dphi, c, s, dz, T: [R * ex - ar[0], R * ey - ar[1], cur.z - ar[2]] };
  }
  const placed = (k, g) => { const p = P0[k]; return [p[0] * g.c - p[1] * g.s + g.T[0], p[0] * g.s + p[1] * g.c + g.T[1], p[2] + g.dz + g.T[2]]; };

  /* ---------------- three.js scene ---------------- */
  // model frame: X = tube axis (z), Y = x, Z = y
  const mp = p => new THREE.Vector3(p[2], p[0], p[1]);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  host.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block'; renderer.domElement.style.width = '100%'; renderer.domElement.style.touchAction = 'pan-y';
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 2, 1, 400);
  camera.position.set(4, 17, 46); camera.lookAt(0, 7, 0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 7, 0); controls.enableZoom = false; controls.enablePan = false; controls.rotateSpeed = 0.7;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(12, 30, 25); scene.add(sun);

  const root = new THREE.Group(); scene.add(root);          // rotated so the chosen site points up (+Y)
  const sph = new THREE.SphereGeometry(1, 22, 16), cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
  const RD = { H: 0.26, B: 0.44, C: 0.32, N: 0.36, O: 0.36, Zn: 0.58 };
  const colFor = e => {
    const d = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    return new THREE.Color({ C: d ? '#9aa3ae' : '#5d6571', H: '#e9ecef', N: d ? '#7eaaf0' : '#2f64b0', O: d ? '#ff5b4d' : '#d7301f', B: d ? '#3ee0a0' : '#13a86b', Zn: d ? '#b9c6dd' : '#6f7fa8' }[e]);
  };
  const atomMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.05 });
  const bondMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.5 });
  function ballStick(idx, group) {
    const A = new THREE.InstancedMesh(sph, atomMat, idx.length), m = new THREE.Matrix4(), set = new Set(idx);
    idx.forEach((k, i) => { const v = mp(P0[k]), r = RD[elOf(k)]; m.makeScale(r, r, r).setPosition(v); A.setMatrixAt(i, m); A.setColorAt(i, colFor(elOf(k))); });
    const bl = bonds.filter(b => set.has(b[0]) && set.has(b[1]));
    const Bm = new THREE.InstancedMesh(cyl, bondMat, bl.length), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
    bl.forEach((b, i) => {
      const p = mp(P0[b[0]]), r = mp(P0[b[1]]), dir = r.clone().sub(p), L = dir.length();
      q.setFromUnitVectors(up, dir.normalize());
      m.compose(p.clone().add(r).multiplyScalar(0.5), q, new THREE.Vector3(0.11, L, 0.11)); Bm.setMatrixAt(i, m);
    });
    group.add(A, Bm); return A;
  }
  function restyle(idx, A) {      // element (size + colour) of each atom for the current variant
    const m = new THREE.Matrix4();
    idx.forEach((k, i) => { const v = mp(P0[k]), r = RD[elOf(k)]; m.makeScale(r, r, r).setPosition(v); A.setMatrixAt(i, m); A.setColorAt(i, colFor(elOf(k))); });
    A.instanceMatrix.needsUpdate = true; A.instanceColor.needsUpdate = true;
  }
  const tubeG = new THREE.Group(), drugG = new THREE.Group(); root.add(tubeG, drugG);
  const tubeA = ballStick(tube, tubeG), drugA = ballStick(drug, drugG);
  // drug group holds P0 coordinates; its transform applies the rigid move (rotation about X, then translation)
  function poseDrug(g) { drugG.rotation.set(g.dphi, 0, 0); drugG.position.set(g.dz + g.T[2], g.T[0], g.T[1]); }

  /* ---------------- density field + iso-surface ---------------- */
  const N = 76, HALF = 16, vox = 2 * HALF / N, DW = { H: 1, B: 3, C: 4, N: 5, O: 6, Zn: 2 },   /* valence electrons (Zn: 4s only) */ DSg = { H: 0.36, B: 0.6, C: 0.55, N: 0.52, O: 0.5, Zn: 0.75 };
  // inferno colour map (same as the 2D map), log scale from RHO0 to RHO1; each surface takes the colour of its iso-value
  const INF = ['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4'];
  const RHO0 = 0.01, RHO1 = 2.5, tOf = r => (Math.log10(r) - Math.log10(RHO0)) / (Math.log10(RHO1) - Math.log10(RHO0));
  const inf = t => { t = Math.min(1, Math.max(0, t)) * (INF.length - 1); const i = Math.min(INF.length - 2, Math.floor(t)), f = t - i; return '#' + new THREE.Color(INF[i]).lerp(new THREE.Color(INF[i + 1]), f).getHexString(); };
  const LEVELS = [[0.1, 0.16], [0.4, 0.2], [1.4, 0.24]].map(([iso, op]) => [iso, inf(tOf(iso)), op]);
  const surfs = LEVELS.map(([iso, col, op]) => {
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, transparent: true, opacity: op, roughness: 0.3, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
    const m = new MarchingCubes(N, mat, false, false, 120000); m.scale.set(HALF, HALF, HALF); m.isolation = iso; m.renderOrder = 2; root.add(m); return m;
  });
  const mc = surfs[0];
  const tubeFs = {}; let tubeF = null;
  function splat(F, v, e) {        // v in model coords
    const s = DSg[e], A = DW[e] / (Math.pow(2 * Math.PI, 1.5) * s * s * s), inv = 1 / (2 * s * s), R = Math.ceil(3 * s / vox);
    const gx = Math.round(v.x / vox + N / 2), gy = Math.round(v.y / vox + N / 2), gz = Math.round(v.z / vox + N / 2);
    for (let z = Math.max(1, gz - R); z <= Math.min(N - 2, gz + R); z++) {
      const dz = (z - N / 2) * vox - v.z;
      for (let y = Math.max(1, gy - R); y <= Math.min(N - 2, gy + R); y++) {
        const dy = (y - N / 2) * vox - v.y, base = z * N * N + y * N, dzy = dz * dz + dy * dy;
        for (let x = Math.max(1, gx - R); x <= Math.min(N - 2, gx + R); x++) { const dx = (x - N / 2) * vox - v.x; F[base + x] += A * Math.exp(-(dx * dx + dzy) * inv); }
      }
    }
  }
  function tubeField() {
    if (!tubeFs[variant]) { const F = new Float32Array(N * N * N); for (const k of tube) splat(F, mp(P0[k]), elOf(k)); tubeFs[variant] = F; }
    tubeF = tubeFs[variant];
  }
  tubeField();
  function updateField(g) {
    mc.field.set(tubeF);
    for (const k of drug) splat(mc.field, mp(placed(k, g)), M.el[k]);
    surfs.forEach((m, i) => { if (i) m.field.set(mc.field); m.update(); });
  }

  /* ---------------- labels ---------------- */
  host.style.position = 'relative';
  const mk = cls => { const d = document.createElement('span'); d.className = 'd3lab ' + cls; host.appendChild(d); return d; };
  const labDrug = mk('drug'), labRead = mk('read');
  const leg = document.createElement('div'); leg.className = 'd3leg'; host.appendChild(leg);
  function buildLegend() {
    const atoms = ['C', 'H', 'N', 'O', 'B', 'Zn'].map(e => `<span><i style="background:#${colFor(e).getHexString()}"></i>${e}</span>`).join('');
    const grad = 'linear-gradient(90deg,' + INF.join(',') + ')';
    const ticks = LEVELS.map(([iso]) => `<em style="left:${(tOf(iso) * 100).toFixed(1)}%">${iso}</em>`).join('');
    leg.innerHTML = `<div>${atoms}</div><div class="cbar-t">electron density (e/Å³, log) · surfaces at</div><div class="cbar" style="background:${grad}">${ticks}</div>`;
  }
  labDrug.textContent = 'Ribavirin';
  const tmp = new THREE.Vector3();
  function place(el, v) {
    tmp.copy(v).applyMatrix4(root.matrixWorld).project(camera);
    const w = host.clientWidth, h = renderer.domElement.clientHeight;
    el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * w}px, ${(-tmp.y * 0.5 + 0.5) * h}px)`;
    el.style.opacity = tmp.z < 1 ? 1 : 0;
  }

  /* ---------------- theme ---------------- */
  function theme() {
    const dk = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    surfs.forEach((m, i) => { m.material.opacity = LEVELS[i][2] * (dk ? 1 : 1.15); });
    bondMat.color.set(document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches) ? 0x8a929c : 0x9aa0a8);
    restyle(tube, tubeA); restyle(drug, drugA);
    buildLegend();
    request();
  }
  document.addEventListener('themechange', theme);

  /* ---------------- render loop (on demand) ---------------- */
  let raf = 0, visible = false, lastField = '';
  function request() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(t) {
    raf = 0;
    if (tl) tl(t / 1000);
    root.rotation.x = -cur.phi;
    const g = rigid(); poseDrug(g);
    const sig = variant + [cur.phi, cur.z, cur.r, cur.d, cur.lift].map(v => v.toFixed(3)).join();
    if (sig !== lastField) { updateField(g); lastField = sig; }
    root.updateMatrixWorld(true);
    renderer.render(scene, camera);
    // labels + readout
    const S = SITES[key], ap = placed(anc, g);
    let top = null; for (const k of drug) { const v = mp(placed(k, g)); if (!top || v.y > top.y) top = v; }
    place(labDrug, top.clone().add(new THREE.Vector3(0, 1.2, 0)));
    const parts = S.partners.map(([k, nm]) => { const q = P0[k]; return nm + '···' + AEL + ' ' + Math.hypot(ap[0] - q[0], ap[1] - q[1], ap[2] - q[2]).toFixed(1) + ' Å'; });
    const docked = cur.lift < 0.05 && !tl;
    labRead.textContent = parts.join(' · ') + (docked ? '\n' + S.kind : '');
    if (ui.dist) ui.dist.textContent = parts.join(' · ');
    if (tl && visible) request();
  }
  controls.addEventListener('change', request);

  function go(k, first) {
    const to = SITES[k], from = { ...cur }, dphi = wrap(to.s.phi - from.phi);
    key = k; variant = k; tubeField(); restyle(tube, tubeA); lastField = '';
    ui.seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-s') === k)));
    const T1 = first ? 0 : 0.7, T2 = first ? 0 : 1.5, T3 = 1.4, L0 = first ? 6 : 5; let t0 = null;
    if (first) { cur.phi = to.s.phi; cur.z = to.s.z; cur.r = to.s.r; cur.d = to.d; }
    tl = t => {
      if (t0 === null) t0 = t; const u = t - t0;
      if (u < T1) cur.lift = from.lift + (L0 - from.lift) * ease(u / T1);
      else if (u < T1 + T2) { const v = ease((u - T1) / T2); cur.lift = L0; cur.phi = from.phi + dphi * v; cur.z = from.z + (to.s.z - from.z) * v; cur.r = from.r + (to.s.r - from.r) * v; cur.d = from.d + (to.d - from.d) * v; }
      else if (u < T1 + T2 + T3) { cur.phi = to.s.phi; cur.z = to.s.z; cur.r = to.s.r; cur.d = to.d; cur.lift = L0 * (1 - ease((u - T1 - T2) / T3)); }
      else { cur.lift = 0; tl = null; }
    };
    if (RM) { cur.phi = to.s.phi; cur.z = to.s.z; cur.r = to.s.r; cur.d = to.d; cur.lift = 0; tl = null; }
    request();
  }
  ui.seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => go(b.getAttribute('data-s'))));
  ui.rerun.addEventListener('click', () => { cur.lift = 6; go(key, true); });

  /* ---------------- sizing / visibility ---------------- */
  function resize() {
    const w = Math.max(240, host.clientWidth), h = Math.round(w < 560 ? 400 : Math.min(560, Math.max(400, w * 0.6)));
    renderer.setSize(w, h, true); camera.aspect = w / h;
    camera.position.copy(controls.target).add(new THREE.Vector3(4, 10, 46).setLength(w < 560 ? 66 : 54)); camera.lookAt(controls.target); camera.updateProjectionMatrix(); request();
  }
  new ResizeObserver(resize).observe(host); resize();
  let started = false;
  new IntersectionObserver(es => es.forEach(e => {
    visible = e.isIntersecting;
    if (visible && !started) { started = true; go('zb', true); }
    if (visible) request();
  })).observe(host);
  theme();
  return { go };
}
