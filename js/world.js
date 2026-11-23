// AFK world: a night lap pool that runs to the sea horizon, one empty white floaty drifting.
// Real-time three.js: planar mirror reflections, animated caustics, ripple rings, a star sky,
// boats and a buoy on the horizon, a plane crossing, wind on the sea, a wake and splashes you make.
// Scroll picks the camera shot; the loop eases toward it.
import * as THREE from '/vendor/three.module.min.js';

const SKY = /* glsl */`
  uniform float uTime;
  float hash31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float h11(float n){ return fract(sin(n * 127.1) * 43758.5453); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y); }
  float fbm2(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
  float cloudAmt(vec3 d){
    if (d.y <= 0.0) return 0.0;
    vec2 uv = d.xz / (d.y + 0.12) * 0.55 + vec2(uTime * 0.016, uTime * 0.006);
    float n = fbm2(uv * 1.6);
    return smoothstep(0.54, 0.84, n) * smoothstep(0.0, 0.06, d.y) * (1.0 - smoothstep(0.30, 0.66, d.y));
  }
  float meteors(vec3 d, float t){
    float s = 0.0;
    for (int k = 0; k < 2; k++) {
      float P = k == 0 ? 7.0 : 11.5;
      float tt = t / P + float(k) * 0.37;
      float cyc = floor(tt), ph = fract(tt);
      if (ph > 0.09) continue;
      float p = ph / 0.09;
      float az = (h11(cyc + float(k) * 13.0) - 0.5) * 1.5;
      float el = 0.16 + h11(cyc * 1.7 + 3.0 + float(k)) * 0.30;
      vec3 a = normalize(vec3(sin(az), el, -cos(az)));
      float dir = h11(cyc * 2.3 + 7.0 + float(k)) > 0.5 ? 1.0 : -1.0;
      vec3 trav = vec3(cos(az) * dir, -0.42, sin(az) * dir) * 0.24;
      vec3 head = normalize(a + trav * p), tail = normalize(a + trav * max(p - 0.38, 0.0));
      vec3 ab = head - tail; float h = clamp(dot(d - tail, ab) / max(dot(ab, ab), 1e-7), 0.0, 1.0);
      float dist = length(d - (tail + ab * h));
      s += smoothstep(0.0024, 0.0, dist) * h * (1.0 - p * p);
    }
    return s;
  }
  vec3 aircraft(vec3 d, float t){
    float ph = fract(t / 84.0 + 0.58);
    if (ph > 0.62) return vec3(0.0);
    float p = ph / 0.62;
    float az = mix(-1.08, 0.98, p);
    vec3 a = normalize(vec3(sin(az), 0.16 + 0.06 * sin(p * 3.1416), -cos(az)));
    vec3 side = normalize(vec3(cos(az), 0.0, sin(az)));
    float w = smoothstep(0.0017, 0.0, length(d - a));
    float strobe = step(0.93, fract(t * 0.85));
    float red = smoothstep(0.0014, 0.0, length(d - normalize(a - side * 0.0045))) * (0.35 + 0.65 * step(0.5, fract(t * 0.55 + 0.2)));
    return vec3(0.95, 0.97, 1.0) * w * (0.3 + strobe * 2.4) + vec3(1.0, 0.16, 0.12) * red;
  }
  vec3 skyCol(vec3 d){
    float el = d.y;
    vec3 zen = vec3(0.0030, 0.0060, 0.0170);
    vec3 hor = vec3(0.016, 0.046, 0.130);
    vec3 c = mix(hor, zen, smoothstep(0.0, 0.42, el));
    float line = exp(-pow((el - 0.0035) / 0.0042, 2.0));
    float haze = exp(-pow((el - 0.004) / 0.035, 2.0));
    float az = atan(d.x, -d.z);
    float lat = 0.72 + 0.28 * cos(az * 1.6);
    float br = 0.92 + 0.08 * sin(uTime * 0.35);
    c += vec3(0.10, 0.30, 1.00) * line * 0.95 * lat * br + vec3(0.020, 0.065, 0.24) * haze * 0.8 * br;
    float cl = cloudAmt(d);
    c = mix(c, c * 0.5 + vec3(0.026, 0.05, 0.12) * (0.6 + 0.4 * smoothstep(0.3, 0.0, d.y)), cl * 0.72);
    return c;
  }
  float starField(vec3 d, float t){
    float s = 0.0;
    float a = t * 0.004;
    mat2 r = mat2(cos(a), -sin(a), sin(a), cos(a));
    vec3 q = d; q.xz = r * q.xz;
    for (int k = 0; k < 2; k++) {
      float sc = k == 0 ? 170.0 : 330.0;
      vec3 p = q * sc; vec3 i = floor(p); vec3 f = fract(p) - 0.5;
      float h = hash31(i + float(k) * 17.0);
      float on = step(k == 0 ? 0.972 : 0.988, h);
      vec3 o = vec3(hash31(i + 1.3), hash31(i + 2.7), hash31(i + 4.1)) - 0.5;
      float r2 = length(f - o * 0.55);
      float tw = 0.65 + 0.35 * sin(t * (0.7 + h * 2.3) + h * 50.0);
      s += on * smoothstep(k == 0 ? 0.11 : 0.07, 0.0, r2) * tw * (k == 0 ? 1.0 : 0.55);
    }
    return s * smoothstep(0.015, 0.16, d.y);
  }
`;

export function createWorld(canvas, opt = {}) {
  const mobile = !!opt.mobile;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  } catch (e) { return null; }
  const DPR = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5);
  renderer.setPixelRatio(DPR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 6000);
  const clock = new THREE.Clock();
  const HALF = 2.9, LEN = 38;
  const FLOATY = new THREE.Vector3(0.22, 0.1, -7.2);
  const U = { uTime: { value: 0 } };

  // ---------------- sky dome (follows the camera)
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: U,
    vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: SKY + `varying vec3 vD; void main(){ vec3 d = normalize(vD); float cl = cloudAmt(d); vec3 c = skyCol(d) + vec3(0.80, 0.88, 1.0) * starField(d, uTime) * 0.9 * (1.0 - cl) + vec3(0.86, 0.92, 1.0) * meteors(d, uTime) * 1.9 + aircraft(d, uTime) * (1.0 - cl * 0.8);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  // ---------------- sea beyond the infinity edge: analytic sky reflection
  const seaU = { uTime: U.uTime, uBoats: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) } };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(8000, 4000), new THREE.ShaderMaterial({
    uniforms: seaU,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: SKY + `uniform vec4 uBoats[4]; varying vec3 vW; void main(){
      vec3 V = normalize(cameraPosition - vW);
      vec2 p = vW.xz * 0.045;
      float fade = exp(-length(vW - cameraPosition) / 260.0);
      vec2 g = vec2(0.0);
      g += vec2(0.30, 1.0) * cos(dot(p, vec2(0.30, 1.0)) * 6.0 + uTime * 0.6) * 0.020;
      g += vec2(-0.8, 0.6) * cos(dot(p, vec2(-0.8, 0.6)) * 9.0 + uTime * 0.8) * 0.012;
      g += vec2(0.9, 0.42) * cos(dot(p, vec2(0.9, 0.42)) * 17.0 + uTime * 1.3) * 0.008;
      g += vec2(-0.3, 0.95) * cos(dot(p, vec2(-0.3, 0.95)) * 29.0 + uTime * 1.9) * 0.005;
      // wind: gusts roughen patches of the sea and drift across it
      float gust = smoothstep(0.45, 0.85, vnoise(vW.xz * 0.011 + vec2(uTime * 0.03, uTime * 0.011)));
      g += vec2(0.7, 0.7) * cos(dot(p, vec2(0.7, 0.7)) * 41.0 + uTime * 2.4) * 0.010 * gust;
      g += vec2(-0.6, 0.8) * cos(dot(p, vec2(-0.6, 0.8)) * 57.0 + uTime * 3.0) * 0.008 * gust;
      vec3 N = normalize(vec3(g.x * fade, 1.0, g.y * fade));
      vec3 R = reflect(-V, N); R.y = abs(R.y);
      float F = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
      vec3 c = skyCol(R) * F + vec3(0.0015, 0.003, 0.008);
      float sg = max(dot(R, normalize(vec3(0.0, 0.03, -1.0))), 0.0);
      c += vec3(0.5, 0.72, 1.0) * (pow(sg, 600.0) * 1.3 + pow(sg, 60.0) * 0.025) * (0.4 + F);
      for (int i = 0; i < 4; i++) {
        vec4 b = uBoats[i];
        if (b.w <= 0.0) continue;
        float s = max(dot(R, normalize(b.xyz - vW)), 0.0);
        vec3 lc = i == 3 ? vec3(0.30, 1.0, 0.62) : vec3(1.0, 0.80, 0.56);
        c += lc * (pow(s, 20000.0) * 2.6 + pow(s, 2500.0) * 0.08) * b.w * (0.3 + F);
      }
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -6, -LEN - 2000); scene.add(sea);

  // ---------------- deck, coping, the infinity lip
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x040507, roughness: 0.95 });
  const copeMat = new THREE.MeshStandardMaterial({ color: 0x2b2f37, roughness: 0.55, emissive: 0x06122e, emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) {
    const cope = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, LEN + 6), copeMat);
    cope.position.set(s * (HALF + 0.275), 0.025, -LEN / 2 + 3); scene.add(cope);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(60, 0.2, LEN + 6.4), deckMat);
    deck.position.set(s * (HALF + 0.55 + 30), -0.03, -LEN / 2 + 3.2); scene.add(deck);
  }
  const lip = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.018, 0.05), new THREE.MeshBasicMaterial({ color: 0x78a8ff }));
  lip.position.set(0, -0.004, -LEN); scene.add(lip);
  const drop = new THREE.Mesh(new THREE.BoxGeometry(124, 6, 0.4), deckMat);
  drop.position.set(0, -3.02, -LEN - 0.25); scene.add(drop);

  // ---------------- the floaty
  const floatyMat = new THREE.MeshPhysicalMaterial({ color: 0xf4f6fa, roughness: 0.34, clearcoat: 0.4, clearcoatRoughness: 0.3, emissive: 0x3a4660, emissiveIntensity: 0.55 });
  const floaty = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.17, 40, 128), floatyMat);
  floaty.rotation.x = -Math.PI / 2; floaty.position.copy(FLOATY); scene.add(floaty);

  // ---------------- light: cool night key, sky fill, blue pool light under the floaty
  scene.add(new THREE.HemisphereLight(0x5c7fc4, 0x020308, 0.55));
  const key = new THREE.DirectionalLight(0xe6edff, 3.4); key.position.set(-3, 8, 10); scene.add(key);
  const top = new THREE.DirectionalLight(0xbcd0ff, 1.4); top.position.set(2, 10, -6); scene.add(top);
  const under = new THREE.PointLight(0x3b7bff, 5.5, 4.2, 1.6); under.position.set(FLOATY.x, -0.35, FLOATY.z); scene.add(under);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fl = { ox: 0, oz: 0, vx: 0, vz: 0, spin: 0, ang: 0 };
  function nudge(x, z, amp) {
    const dx = floaty.position.x - x, dz = floaty.position.z - z, d = Math.hypot(dx, dz);
    if (d > 2.6) return;
    const f = amp * 0.26 / (0.35 + d * d);
    fl.vx += dx / (d + 1e-3) * f; fl.vz += dz / (d + 1e-3) * f; fl.spin += (Math.random() - 0.5) * f * 1.6;
  }
  const rim = new THREE.PointLight(0x7aa6ff, 3.0, 9, 1.8); rim.position.set(0.5, 1.2, -11); scene.add(rim);

  // ---------------- pool water: mirror + glow + caustics + ripples
  const RT_SCALE = mobile ? 0.35 : 0.5;
  const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType });
  const texMat = new THREE.Matrix4();
  const waterU = {
    uTime: U.uTime, uRefl: { value: rt.texture }, uTexMat: { value: texMat },
    uFloaty: { value: FLOATY.clone() }, uPulse: { value: 0 },
    uDrops: { value: Array.from({ length: 24 }, () => new THREE.Vector4(0, 0, -99, 0)) },
  };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, LEN, 1, 1), new THREE.ShaderMaterial({
    uniforms: waterU,
    vertexShader: `uniform mat4 uTexMat; varying vec3 vW; varying vec4 vRP;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vRP = uTexMat * w; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform sampler2D uRefl; uniform vec3 uFloaty; uniform float uPulse; uniform vec4 uDrops[24];
      varying vec3 vW; varying vec4 vRP;
      vec2 h22(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
      float cell(vec2 p, float t){
        vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(float(x), float(y)); vec2 o = h22(i + g); o = 0.5 + 0.45 * sin(t + 6.2831 * o);
          float d = length(g + o - f);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
        }
        return d2 - d1;
      }
      vec2 waves(vec2 p, float t){
        vec2 g = vec2(0.0);
        g += vec2(0.6, 0.8)    * cos(dot(p, vec2(0.6, 0.8)) * 3.1 + t * 1.3) * 0.011;
        g += vec2(-0.7, 0.5)   * cos(dot(p, vec2(-0.7, 0.5)) * 4.9 + t * 1.7) * 0.008;
        g += vec2(0.2, -1.0)   * cos(dot(p, vec2(0.2, -1.0)) * 7.7 + t * 2.3) * 0.0055;
        g += vec2(0.95, 0.31)  * cos(dot(p, vec2(0.95, 0.31)) * 11.3 + t * 2.9) * 0.0036;
        g += vec2(-0.42, -0.9) * cos(dot(p, vec2(-0.42, -0.9)) * 15.7 + t * 3.5) * 0.0026;
        g += vec2(0.8, -0.6)   * cos(dot(p, vec2(0.8, -0.6)) * 21.1 + t * 4.2) * 0.0018;
        g += vec2(-0.97, 0.24) * cos(dot(p, vec2(-0.97, 0.24)) * 29.3 + t * 5.1) * 0.0011;
        return g;
      }
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        vec2 q = vW.xz - uFloaty.xz; float r = length(q) + 1e-4;
        float k = 6.2831 / 0.46, ph = k * r - uTime * 2.1;
        float env = exp(-r / 2.8) * smoothstep(0.62, 0.95, r) * (1.0 + uPulse * 2.5);
        vec2 g = q / r * cos(ph) * k * env * 0.0055;
        // every trade lands as a drop: a ring that runs out and fades (and catches a little light)
        float rings = 0.0;
        for (int i = 0; i < 24; i++) {
          vec4 d = uDrops[i];
          float age = uTime - d.z;
          if (age < 0.0 || age > 4.5 || d.w <= 0.0) continue;
          vec2 dq = vW.xz - d.xy; float dr = length(dq) + 1e-4;
          float x = dr - (0.62 * age + 0.04);
          float w = 0.085 + 0.055 * age;
          float a = d.w * exp(-age * 0.95) * exp(-x * x / (2.0 * w * w));
          float kk = 6.2831 / 0.2;
          g += dq / dr * cos(kk * x) * kk * a * 0.0040;
          rings += a * max(cos(kk * x), 0.0);
        }
        float dist = length(vW - cameraPosition);
        g += waves(vW.xz, uTime) * (0.55 + 0.45 * smoothstep(30.0, 4.0, dist));
        // a long, slow swell sliding toward the infinity edge
        float swl = sin(vW.z * 0.85 + uTime * 1.15 + sin(vW.x * 0.7 + uTime * 0.3) * 0.5);
        g += vec2(0.06, 1.0) * swl * 0.006 * (0.65 + 0.35 * sin(uTime * 0.23));
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        float z = -vW.z;
        float glow = exp(-pow((z - 7.6) / 7.5, 2.0)) * 1.0 + 0.08;
        vec2 cp = vW.xz * vec2(2.5, 2.2) + N.xz * 1.9;
        float c1 = cell(cp, uTime * 0.85), c2 = cell(cp * 1.73 + 4.7, uTime * 1.12);
        float caus = pow(1.0 - smoothstep(0.0, 0.075, c1), 2.4) * 0.66 + pow(1.0 - smoothstep(0.0, 0.06, c2), 2.4) * 0.32;
        caus *= smoothstep(26.0, 6.0, z) * 0.85 + 0.15;
        float lane = mix(0.72, 1.0, smoothstep(0.09, 0.15, abs(vW.x)));
        float edge = smoothstep(${(HALF - 0.05).toFixed(2)}, ${(HALF - 0.9).toFixed(2)}, abs(vW.x));
        vec3 deep = vec3(0.006, 0.075, 0.34);
        vec3 under = (deep + vec3(0.15, 0.40, 0.95) * caus * 0.55) * glow * lane * (0.72 + 0.28 * edge);
        vec4 rp = vRP; rp.xy += N.xz * 0.08 * rp.w;
        vec3 refl = texture2DProj(uRefl, rp).rgb;
        float F = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 col = mix(under, refl, clamp(F * 1.05, 0.0, 1.0));
        // glitter: the horizon light caught by every little wave
        vec3 Rr = reflect(-V, N);
        float sg = max(dot(Rr, normalize(vec3(0.0, 0.03, -1.0))), 0.0);
        col += vec3(0.55, 0.75, 1.0) * (pow(sg, 900.0) * 2.4 + pow(sg, 110.0) * 0.045) * (0.35 + F);
        col += vec3(0.55, 0.74, 1.0) * rings * 0.30;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0, -LEN / 2); scene.add(water);

  // ---------------- planar reflection (after three.js Reflector)
  const vCam = new THREE.PerspectiveCamera();
  const plane = new THREE.Plane(), nrm = new THREE.Vector3(0, 1, 0), camPos = new THREE.Vector3(), rot = new THREE.Matrix4();
  const look = new THREE.Vector3(), view = new THREE.Vector3(), tgt = new THREE.Vector3(), clip = new THREE.Vector4(), qv = new THREE.Vector4();
  function reflect() {
    camPos.setFromMatrixPosition(camera.matrixWorld);
    if (camPos.y <= 0.001) return;
    view.set(camPos.x, -camPos.y, camPos.z);
    rot.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    tgt.set(look.x, -look.y, look.z);
    vCam.position.copy(view);
    vCam.up.set(0, 1, 0).applyMatrix4(rot).reflect(nrm);
    vCam.lookAt(tgt);
    vCam.far = camera.far; vCam.updateMatrixWorld();
    vCam.projectionMatrix.copy(camera.projectionMatrix);
    texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    texMat.multiply(vCam.projectionMatrix); texMat.multiply(vCam.matrixWorldInverse);
    plane.setFromNormalAndCoplanarPoint(nrm, new THREE.Vector3(0, 0, 0)); plane.applyMatrix4(vCam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = vCam.projectionMatrix.elements;
    qv.x = (Math.sign(clip.x) + pm[8]) / pm[0]; qv.y = (Math.sign(clip.y) + pm[9]) / pm[5]; qv.z = -1.0; qv.w = (1.0 + pm[10]) / pm[14];
    clip.multiplyScalar(2.0 / clip.dot(qv));
    pm[2] = clip.x; pm[6] = clip.y; pm[10] = clip.z + 1.0 - 0.003; pm[14] = clip.w;
    water.visible = false; sea.visible = false;
    const tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, vCam); renderer.setRenderTarget(null);
    renderer.toneMapping = tm;
    water.visible = true; sea.visible = true;
  }

  // ---------------- lights on the horizon: three boats drifting, one green buoy blinking
  const LIGHTS = [
    { x: -120, z: -300, y: -4.7, v: 3.0, c: [1.0, 0.82, 0.58], s: 2.6 },
    { x: 170, z: -520, y: -4.6, v: -2.2, c: [1.0, 0.86, 0.66], s: 2.2 },
    { x: -60, z: -900, y: -4.5, v: 1.5, c: [1.0, 0.9, 0.76], s: 1.8 },
    { x: -34, z: -240, y: -5.2, v: 0, c: [0.34, 1.0, 0.64], s: 3.0, flash: 4.2 },
  ];
  const lPos = new Float32Array(12), lCol = new Float32Array(12), lInt = new Float32Array(4), lSize = new Float32Array(4);
  LIGHTS.forEach((L, i) => { lCol.set(L.c, i * 3); lSize[i] = L.s; });
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3));
  lGeo.setAttribute('lcol', new THREE.BufferAttribute(lCol, 3));
  lGeo.setAttribute('inten', new THREE.BufferAttribute(lInt, 1));
  lGeo.setAttribute('psize', new THREE.BufferAttribute(lSize, 1));
  const lamps = new THREE.Points(lGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uDpr: { value: DPR } },
    vertexShader: `attribute vec3 lcol; attribute float inten; attribute float psize; uniform float uDpr; varying vec3 vC; varying float vI;
      void main(){ vC = lcol; vI = inten; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = psize * uDpr * (0.8 + 0.45 * inten); }`,
    fragmentShader: `varying vec3 vC; varying float vI; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5 || vI <= 0.001) discard;
      gl_FragColor = vec4(vC, smoothstep(0.5, 0.12, d) * vI); }`,
  }));
  lamps.frustumCulled = false; scene.add(lamps);
  function stepLamps(t) {
    LIGHTS.forEach((L, i) => {
      let x = L.x;
      if (L.v) { const span = 2.6 * Math.abs(L.z); x = ((L.x + L.v * t + span / 2) % span + span) % span - span / 2; }
      let I = 0.82 + 0.18 * Math.sin(t * (1.1 + i * 0.7) + i * 2.1);
      if (L.flash) { const ph = (t % L.flash) / L.flash; I = ph < 0.07 ? 1 : ph < 0.12 ? (0.12 - ph) / 0.05 : 0; }
      lPos[i * 3] = x; lPos[i * 3 + 1] = L.y; lPos[i * 3 + 2] = L.z; lInt[i] = I;
      seaU.uBoats.value[i].set(x, L.y, L.z, I);
    });
    lGeo.attributes.position.needsUpdate = true; lGeo.attributes.inten.needsUpdate = true;
  }

  // ---------------- splash droplets: clicks throw water up, it falls back in rings
  const NP = mobile ? 80 : 160;
  const sp = { pos: new Float32Array(NP * 3), vel: new Float32Array(NP * 3), life: new Float32Array(NP), i: 0, live: 0 };
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute('position', new THREE.BufferAttribute(sp.pos, 3));
  spGeo.setAttribute('life', new THREE.BufferAttribute(sp.life, 1));
  const spMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uScale: { value: 600 } },
    vertexShader: `attribute float life; uniform float uScale; varying float vL;
      void main(){ vL = life; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = life > 0.0 ? clamp(0.03 * uScale / max(-mv.z, 0.1), 1.0, 7.0) : 0.0; }`,
    fragmentShader: `varying float vL; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5 || vL <= 0.0) discard;
      gl_FragColor = vec4(0.82, 0.91, 1.0, smoothstep(0.5, 0.18, d) * clamp(vL * 2.5, 0.0, 1.0) * 0.9); }`,
  });
  const spray = new THREE.Points(spGeo, spMat); spray.frustumCulled = false; scene.add(spray);
  function splash(x, z, n, pw) {
    for (let k = 0; k < n; k++) {
      const i = sp.i++ % NP, j = i * 3, a = Math.random() * 6.2832, r = (0.22 + Math.random() * 0.55) * pw;
      sp.pos[j] = x + Math.cos(a) * 0.04; sp.pos[j + 1] = 0.02; sp.pos[j + 2] = z + Math.sin(a) * 0.04;
      sp.vel[j] = Math.cos(a) * r; sp.vel[j + 1] = (1.3 + Math.random() * 1.7) * pw; sp.vel[j + 2] = Math.sin(a) * r;
      sp.life[i] = 1;
    }
    sp.live = 1;
  }
  function stepSpray(dt) {
    if (!sp.live) return;
    let any = 0;
    for (let i = 0; i < NP; i++) {
      if (sp.life[i] <= 0) continue;
      any = 1; const j = i * 3;
      sp.vel[j + 1] -= 9.8 * dt;
      sp.pos[j] += sp.vel[j] * dt; sp.pos[j + 1] += sp.vel[j + 1] * dt; sp.pos[j + 2] += sp.vel[j + 2] * dt;
      sp.life[i] -= dt * 0.9;
      if (sp.pos[j + 1] < 0 && sp.vel[j + 1] < 0) { if (Math.random() < 0.35) addDrop(sp.pos[j], sp.pos[j + 2], 0.22); sp.life[i] = 0; }
    }
    spGeo.attributes.position.needsUpdate = true; spGeo.attributes.life.needsUpdate = true;
    sp.live = any;
  }

  // ---------------- camera shots
  const CAMS = {
    hero:  { p: [0.0, 1.7, -0.8],   t: [0.0, 0.6, -60],   fov: 46 },
    away:  { p: [0.9, 2.6, -2.2],   t: [-1.2, 0.6, -9.5], fov: 44 },
    away2: { p: [2.6, 2.8, -3.2],   t: [-0.6, 0.3, -9.0], fov: 44 },
    how:   { p: [2.6, 3.4, -4.4],   t: [0.2, 0.0, -7.6],  fov: 44 },
    pools: { p: [0.0, 10.5, -6.2],  t: [0.0, 0.0, -12.5], fov: 50 },
    calc:  { p: [-2.0, 1.1, -4.6],  t: [0.25, 0.25, -7.3], fov: 44 },
    you:   { p: [0.6, 0.42, -2.6],  t: [0.2, 0.18, -7.2], fov: 40 },
    tech:  { p: [0.0, 6.8, 2.5],    t: [0.0, 0.0, -15.0], fov: 44 },
    risk:  { p: [-1.6, 1.9, -12.0], t: [0.2, 0.2, -7.0],  fov: 46 },
    faq:   { p: [0.0, 1.0, -20.0],  t: [0.0, 0.7, -80],   fov: 46 },
    end:   { p: [0.0, 0.95, -33.0], t: [0.0, 0.62, -400], fov: 48 },
  };
  const cur = { p: new THREE.Vector3(...CAMS.hero.p), t: new THREE.Vector3(...CAMS.hero.t), fov: CAMS.hero.fov };
  const goal = { p: cur.p.clone(), t: cur.t.clone(), fov: cur.fov };
  const A = new THREE.Vector3(), B = new THREE.Vector3();
  function go(a, b, f) {
    const ca = CAMS[a] || CAMS.hero, cb = CAMS[b] || ca;
    const e = f * f * (3 - 2 * f);
    goal.p.copy(A.fromArray(ca.p)).lerp(B.fromArray(cb.p), e);
    goal.t.copy(A.fromArray(ca.t)).lerp(B.fromArray(cb.t), e);
    goal.fov = ca.fov + (cb.fov - ca.fov) * e;
  }
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  addEventListener('pointermove', e => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; }, { passive: true });

  // ---------------- sizing + loop
  let W = 0, H = 0, portrait = false;
  function resize() {
    W = innerWidth; H = innerHeight; portrait = W / H < 0.9;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    rt.setSize(Math.max(64, Math.round(W * DPR * RT_SCALE)), Math.max(64, Math.round(H * DPR * RT_SCALE)));
  }
  resize(); addEventListener('resize', resize);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let running = true, pulse = 0, raf = 0, frames = 0;
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) loop(); });

  let nextDrop = 0, dropI = 0;
  function addDrop(x, z, amp) {
    const d = waterU.uDrops.value[dropI++ % 24];
    d.set(x, z, U.uTime.value, amp);
  }
  function randomDrop() {
    if (Math.random() < 0.5) {
      const x = floaty.position.x + (Math.random() * 2 - 1) * 1.9, z = floaty.position.z + (Math.random() * 2 - 1) * 1.9, a = 0.7 + Math.random() * 0.5;
      addDrop(x, z, a); if (a > 1.1) splash(x, z, 4, 0.55);
    } else addDrop((Math.random() * 2 - 1) * (HALF - 0.45), -(1.5 + Math.random() * 24), 0.45 + Math.random() * 0.6);
  }
  function step(dt) {
    const t = clock.elapsedTime;
    if (!reduce && t > nextDrop) { randomDrop(); nextDrop = t + 0.14 + Math.random() * 0.38; }
    U.uTime.value = t;
    const k = 1 - Math.pow(0.0016, dt);
    cur.p.lerp(goal.p, k); cur.t.lerp(goal.t, k); cur.fov += (goal.fov - cur.fov) * k;
    pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 3); pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 3);
    camera.position.copy(cur.p); camera.position.x += pointer.sx * 0.35 + (reduce ? 0 : Math.sin(t * 0.31) * 0.05); camera.position.y += -pointer.sy * 0.18 + (reduce ? 0 : Math.sin(t * 0.47) * 0.035);
    camera.fov = cur.fov + (portrait ? 18 : 0); camera.updateProjectionMatrix();
    camera.lookAt(cur.t);
    sky.position.copy(camera.position);
    const bob = reduce ? 0 : Math.sin(t * 1.15) * 0.022;
    fl.vx -= fl.ox * 0.9 * dt; fl.vz -= fl.oz * 0.9 * dt;
    const damp = Math.pow(0.45, dt); fl.vx *= damp; fl.vz *= damp; fl.spin *= Math.pow(0.5, dt);
    fl.ox = clamp(fl.ox + fl.vx * dt, -1.5, 1.5); fl.oz = clamp(fl.oz + fl.vz * dt, -2.5, 2.5); fl.ang += fl.spin * dt;
    const wx = reduce ? 0 : Math.sin(t * 0.071) * 0.42, wz = reduce ? 0 : Math.sin(t * 0.053 + 1.1) * 0.55;
    floaty.position.set(clamp(FLOATY.x + wx + Math.sin(t * 0.21) * 0.06 + fl.ox, -2.05, 2.05), FLOATY.y + bob, FLOATY.z + wz + Math.cos(t * 0.17) * 0.05 + fl.oz);
    floaty.rotation.z = t * 0.05 + fl.ang;
    under.position.set(floaty.position.x, -0.35, floaty.position.z);
    floaty.rotation.x = -Math.PI / 2 + Math.sin(t * 0.9) * 0.025; floaty.rotation.y = Math.cos(t * 0.7) * 0.02;
    waterU.uFloaty.value.copy(floaty.position);
    pulse *= Math.pow(0.25, dt); waterU.uPulse.value = pulse;
    stepLamps(reduce ? 0 : t);
    spMat.uniforms.uScale.value = H * DPR / (2 * Math.tan(camera.fov * Math.PI / 360));
    stepSpray(dt);
  }
  function render() { reflect(); renderer.render(scene, camera); frames++; }
  function loop() {
    cancelAnimationFrame(raf);
    const tick = () => {
      if (!running) return;
      const dt = Math.min(0.05, clock.getDelta());
      step(dt); render();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  loop();
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hitWater(cx, cy) {
    ndc.set(cx / W * 2 - 1, -(cy / H) * 2 + 1); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(water, false)[0];
    return hit ? hit.point : null;
  }
  function dropAt(cx, cy) {
    const p = hitWater(cx, cy); if (!p) return false;
    addDrop(p.x, p.z, 1.35); pulse = Math.min(1.5, pulse + 0.15);
    if (!reduce) splash(p.x, p.z, 12, 1); nudge(p.x, p.z, 1.4); return true;
  }
  let lastWake = null;
  function wakeAt(cx, cy) {
    const p = hitWater(cx, cy); if (!p) { lastWake = null; return false; }
    if (lastWake && Math.hypot(p.x - lastWake.x, p.z - lastWake.z) < 0.3) return false;
    lastWake = { x: p.x, z: p.z }; addDrop(p.x, p.z, 0.85); nudge(p.x, p.z, 0.5); return true;
  }
  return {
    go, camera, CAMS, dropAt, wakeAt,
    pulse(v = 1) { pulse = Math.min(1.5, pulse + v); const n = Math.max(1, Math.round(v * 3)); for (let i = 0; i < n; i++) addDrop(floaty.position.x + (Math.random() * 2 - 1) * 1.6, floaty.position.z + (Math.random() * 2 - 1) * 1.6, 0.8 + Math.random() * 0.4); },
    settle() { cur.p.copy(goal.p); cur.t.copy(goal.t); cur.fov = goal.fov; },
    advance(sec = 1, n = 30) { for (let i = 0; i < n; i++) { clock.elapsedTime += sec / n; step(sec / n); } render(); },
    get frames() { return frames; },
  };
}
