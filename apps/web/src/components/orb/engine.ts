// Score orb renderer (three.js). Framework-agnostic: the React wrapper in
// ScoreOrb.tsx owns the DOM and passes a canvas in. Client-only.
//
// Shape: each rubric axis owns a region of a sphere. Radius at a point p is
//   r(p) = 1 + liquid + lumps + shards + thorns - fault groove - unassessed dent
// where every term is gated by D(p), the softmax-blended deficit (1 - fraction)
// of nearby axes. High scores read as a smooth chrome orb; low scores grow
// lumps, creased ridges and thorns. Unassessed axes get a neutral scan lattice
// instead of a guessed shape (a gap is unknown, not zero). A verified
// deal-breaker failure draws glowing fault lines; it never changes the score.

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export interface OrbState {
  /** Per-axis 0..1 fraction of the axis max, or null when not assessed. */
  fractions: (number | null)[];
  /** A verified deal-breaker failed (warning only; score unchanged). */
  warning: boolean;
}

export interface OrbAnchor { x: number; y: number; visible: boolean }

export interface OrbEngineOptions {
  canvas: HTMLCanvasElement;
  axisCount: number;
  /** Seeds the thorn layout so each site keeps a recognizable silhouette. */
  seed: string;
  reducedMotion: boolean;
  background: string;
  /** Hovered axis region (or null) with client coordinates, for tooltips. */
  onHover?: (hit: { axis: number; orb: 0 | 1; x: number; y: number } | null) => void;
  /** Called every rendered frame with caption anchors under [after, before]. */
  onFrame?: (anchors: [OrbAnchor, OrbAnchor]) => void;
}

const N_SPIKES = 72;
const SOFT_K = 7;
const R_SINGLE = 1.35;
const R_COMPARE = 1.75;
const COMPARE_SCALE = 0.82;

// Palette follows the app tokens ("The Wall"): amber only for focus; danger for pain.
const FOCUS_RGB = 'vec3(1.0,0.78,0.34)';
const EMBER_RGB = 'vec3(0.97,0.30,0.22)';
const LATTICE_RGB = 'vec3(0.64,0.66,0.70)';

function hashSeed(str: string) {
  let h = 2166136261;
  for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 2147483646) + 1;
}

/** Axis regions: zig-zag ring around the equator so every axis passes the camera while spinning. */
function axisDirections(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const lat = (i % 2 ? -1 : 1) * 0.38;
    const lon = (i / n) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
  });
}

const NOISE_GLSL = /* glsl */ `
// 3D simplex noise, Ashima Arts / Stefan Gustavson (MIT).
vec3 soMod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 soMod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 soPermute(vec4 x){return soMod289(((x*34.0)+1.0)*x);}
vec4 soTaylor(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=soMod289(i);
  vec4 p=soPermute(soPermute(soPermute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 q0=vec3(a0.xy,h.x);
  vec3 q1=vec3(a0.zw,h.y);
  vec3 q2=vec3(a1.xy,h.z);
  vec3 q3=vec3(a1.zw,h.w);
  vec4 norm=soTaylor(vec4(dot(q0,q0),dot(q1,q1),dot(q2,q2),dot(q3,q3)));
  q0*=norm.x;q1*=norm.y;q2*=norm.z;q3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(q0,x0),dot(q1,x1),dot(q2,x2),dot(q3,x3)));
}
float crackField(vec3 p){ return abs(snoise(p*1.25+vec3(17.0))); }
`;

function vertexHead(nAx: number) {
  return /* glsl */ `
#define N_AX ${nAx}
#define N_SPIKES ${N_SPIKES}
uniform float uTime;
uniform float uCap;
uniform int uFocus;
uniform float uFocusAmt;
uniform vec3 uAxis[N_AX];
uniform float uDef[N_AX];
uniform float uKnown[N_AX];
uniform vec4 uSpike[N_SPIKES];
uniform vec3 uSpikeAmp[N_SPIKES];
varying float vDef;
varying float vTip;
varying float vUnk;
varying float vFocus;
varying vec3 vSph;
${NOISE_GLSL}
vec2 regionDU(vec3 p){
  float s=0.0, u=0.0, w=0.0;
  for(int i=0;i<N_AX;i++){ float k=exp(${SOFT_K}.0*(dot(p,uAxis[i])-1.0)); s+=k*uDef[i]; u+=k*(1.0-uKnown[i]); w+=k; }
  return vec2(s,u)/max(w,1e-5);
}
float focusShare(vec3 p){
  if(uFocus<0) return 0.0;
  float f=0.0, w=0.0;
  for(int i=0;i<N_AX;i++){ float k=exp(${SOFT_K}.0*(dot(p,uAxis[i])-1.0)); w+=k; if(i==uFocus) f=k; }
  return uFocusAmt*f/max(w,1e-5);
}
float spikeField(vec3 p, out float tip){
  float m=0.0; tip=0.0;
  for(int j=0;j<N_SPIKES;j++){
    vec3 sa=uSpikeAmp[j];
    if(sa.x<0.002) continue;
    float c=dot(p,uSpike[j].xyz);
    if(c<sa.z) continue;
    float t=1.0-acos(clamp(c,-1.0,1.0))/uSpike[j].w;
    float h=sa.x*pow(max(t,0.0),sa.y);
    if(h>m){ m=h; tip=t; }
  }
  return m;
}
float shapeR(vec3 p, out float tip, out float D, out float U){
  vec2 du=regionDU(p); D=du.x; U=du.y;
  float t=uTime;
  vec3 w=vec3(snoise(p*0.9+vec3(0.0,t*0.07,0.0)), snoise(p*0.9+vec3(5.2,-t*0.05,1.3)), 0.0);
  float liquid=snoise(p*1.3+w*0.6+vec3(0.0,t*0.12,t*0.08))*(0.018+0.07*D);
  float lumps=snoise(p*2.4+11.0+vec3(t*0.03))*0.17*smoothstep(0.12,0.6,D);
  float r=0.0, a=0.5, f=3.6;
  for(int o=0;o<4;o++){ float n=1.0-abs(snoise(p*f+3.1*float(o))); r+=a*n*n*n; f*=2.07; a*=0.5; }
  float shards=r*0.24*smoothstep(0.3,1.0,D);
  float sp=spikeField(p, tip);
  float groove=uCap*(1.0-smoothstep(0.0,0.07,crackField(p)))*0.06;
  return 1.0+liquid+lumps+shards+sp-groove-U*0.04;
}
`;
}

type Uniforms = {
  uTime: { value: number }; uCap: { value: number }; uFocus: { value: number }; uFocusAmt: { value: number };
  uAxis: { value: THREE.Vector3[] }; uDef: { value: number[] }; uKnown: { value: number[] };
  uSpike: { value: THREE.Vector4[] }; uSpikeAmp: { value: THREE.Vector3[] };
};

function patchShader(shader: THREE.WebGLProgramParametersWithUniforms, uniforms: Uniforms, nAx: number) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = vertexHead(nAx) + shader.vertexShader
    .replace('#include <beginnormal_vertex>', /* glsl */ `
      vec3 p0=normalize(position);
      float tip0, D0, U0;
      float r0=shapeR(p0, tip0, D0, U0);
      vec3 helper=abs(p0.y)<0.99?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0);
      vec3 tg=normalize(cross(helper,p0));
      vec3 bt=cross(p0,tg);
      const float EPS=0.003;
      vec3 p1=normalize(p0+tg*EPS), p2=normalize(p0+bt*EPS);
      float tT, tD, tU;
      vec3 P0=p0*r0;
      vec3 P1=p1*shapeR(p1,tT,tD,tU);
      vec3 P2=p2*shapeR(p2,tT,tD,tU);
      vec3 objectNormal=normalize(cross(P1-P0,P2-P0));
      if(dot(objectNormal,p0)<0.0) objectNormal=-objectNormal;
      vDef=D0; vTip=tip0; vUnk=U0; vFocus=focusShare(p0); vSph=p0;
      vec3 dispPos=P0;
    `)
    .replace('#include <begin_vertex>', 'vec3 transformed = dispPos;');

  shader.fragmentShader = /* glsl */ `
    uniform float uCap;
    varying float vDef; varying float vTip; varying float vUnk; varying float vFocus; varying vec3 vSph;
    ${NOISE_GLSL}
  ` + shader.fragmentShader
    .replace('#include <color_fragment>', /* glsl */ `
      #include <color_fragment>
      float unk = smoothstep(0.15, 0.85, vUnk);
      diffuseColor.rgb *= mix(vec3(0.98,0.99,1.0), vec3(0.34,0.31,0.33), smoothstep(0.15,0.95,vDef));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30,0.32,0.36), unk);
      diffuseColor.rgb *= 1.0 - 0.3*uCap;
    `)
    .replace('#include <roughnessmap_fragment>', /* glsl */ `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.38, smoothstep(0.35,1.0,vDef));
      roughnessFactor = mix(roughnessFactor, 0.55, unk);
    `)
    .replace('#include <emissivemap_fragment>', /* glsl */ `
      #include <emissivemap_fragment>
      float heat = smoothstep(0.8,1.0,vTip) * smoothstep(0.3,0.85,vDef);
      totalEmissiveRadiance += ${EMBER_RGB} * heat * 1.8;
      vec3 gq = vSph*9.0;
      vec3 gd = abs(fract(gq-0.5)-0.5)/max(fwidth(gq),vec3(1e-4));
      float gline = 1.0 - clamp(min(min(gd.x,gd.y),gd.z), 0.0, 1.0);
      totalEmissiveRadiance += ${LATTICE_RGB} * gline * unk * 0.7;
      float cn = crackField(vSph);
      float crack = 1.0 - smoothstep(0.0, 0.016 + fwidth(cn)*1.5, cn);
      totalEmissiveRadiance += ${EMBER_RGB} * crack * uCap * 2.6;
      float rim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);
      totalEmissiveRadiance += ${FOCUS_RGB} * vFocus * (0.08 + 0.8*rim);
    `);
}

interface Spike { dir: THREE.Vector3; width: number; length: number; phase: number; w: number[] }

class Orb {
  target: (number | null)[];
  current: number[];
  known: number[];
  def: number[];
  capTarget = 0;
  capCur = 0;
  spikes: Spike[] = [];
  uniforms: Uniforms;
  material: THREE.MeshPhysicalMaterial;
  mesh: THREE.Mesh;

  constructor(geo: THREE.BufferGeometry, private axes: THREE.Vector3[], seed: string, private reducedMotion: boolean) {
    const n = axes.length;
    this.target = new Array(n).fill(null);
    this.current = new Array(n).fill(1);
    this.known = new Array(n).fill(0);
    this.def = new Array(n).fill(0);
    this.uniforms = {
      uTime: { value: 0 }, uCap: { value: 0 }, uFocus: { value: -1 }, uFocusAmt: { value: 0 },
      uAxis: { value: axes }, uDef: { value: this.def }, uKnown: { value: this.known },
      uSpike: { value: Array.from({ length: N_SPIKES }, () => new THREE.Vector4()) },
      uSpikeAmp: { value: Array.from({ length: N_SPIKES }, () => new THREE.Vector3(0, 1, 1)) },
    };
    this.material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 1, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.05,
      iridescence: 0.8, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 620], envMapIntensity: 1.25,
    });
    const u = this.uniforms;
    this.material.onBeforeCompile = (shader) => patchShader(shader, u, n);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.setSeed(seed);
  }

  setSeed(str: string) {
    let s = hashSeed(str);
    const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    this.spikes = [];
    for (let j = 0; j < N_SPIKES; j++) {
      const u = rand() * 2 - 1, phi = rand() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const dir = new THREE.Vector3(r * Math.cos(phi), u, r * Math.sin(phi));
      const w = this.axes.map(a => Math.exp(SOFT_K * (dir.dot(a) - 1)));
      const ws = w.reduce((x, y) => x + y, 0);
      const spike = { dir, width: 0.13 + rand() * 0.2, length: 0.55 + rand() * 0.75, phase: rand() * Math.PI * 2, w: w.map(x => x / ws) };
      this.spikes.push(spike);
      this.uniforms.uSpike.value[j].set(dir.x, dir.y, dir.z, spike.width);
      this.uniforms.uSpikeAmp.value[j].z = Math.cos(spike.width);
    }
  }

  set(state: OrbState, instant: boolean) {
    this.target = this.axes.map((_, i) => state.fractions[i] ?? null);
    this.capTarget = state.warning ? 1 : 0;
    if (instant) {
      this.target.forEach((f, i) => { if (f !== null) this.current[i] = f; this.known[i] = f === null ? 0 : 1; });
      this.capCur = this.capTarget;
    }
  }

  update(dt: number, t: number, liquidTime: number, focus: number, focusAmt: number) {
    const ease = 1 - Math.exp(-dt * 2.6);
    for (let i = 0; i < this.target.length; i++) {
      const f = this.target[i];
      this.known[i] += ((f === null ? 0 : 1) - this.known[i]) * ease;
      if (f !== null) this.current[i] += (f - this.current[i]) * ease;
      this.def[i] = Math.pow(1 - this.current[i], 1.15) * this.known[i];
    }
    this.capCur += (this.capTarget - this.capCur) * ease;
    const u = this.uniforms;
    u.uCap.value = this.capCur;
    u.uTime.value = liquidTime;
    if (focus >= 0) u.uFocus.value = focus; else if (focusAmt < 0.01) u.uFocus.value = -1;
    u.uFocusAmt.value = focusAmt;
    let defSum = 0, knownSum = 0;
    this.spikes.forEach((s, j) => {
      const D = s.w.reduce((acc, w, i) => acc + w * this.def[i], 0);
      const twitch = this.reducedMotion ? 1 : 1 + 0.07 * D * Math.sin(t * (2.5 + D * 4) + s.phase);
      const a = u.uSpikeAmp.value[j];
      a.x = s.length * Math.pow(D, 1.6) * 1.1 * twitch;
      a.y = 1 + 4 * D;
    });
    for (let i = 0; i < this.def.length; i++) { defSum += this.def[i]; knownSum += this.known[i]; }
    const overallDef = knownSum > 0.01 ? defSum / knownSum : 0;
    this.material.iridescence = 0.05 + 0.85 * Math.max(0, 1 - overallDef * 2.2) * (1 - 0.8 * this.capCur);
  }

  dispose() { this.material.dispose(); }
}

function buildEnvironment(renderer: THREE.WebGLRenderer) {
  const env = new THREE.Scene();
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, toneMapped: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 vP; void main(){
      float y = vP.y;
      vec3 c = mix(vec3(0.01,0.012,0.02), vec3(0.06,0.07,0.12), smoothstep(-0.6, 0.05, y));
      c = mix(c, vec3(0.16,0.15,0.22), smoothstep(0.05, 0.9, y));
      c += vec3(0.25,0.22,0.35) * exp(-abs(y)*14.0) * 0.6;
      gl_FragColor = vec4(c, 1.0); }`,
  });
  env.add(new THREE.Mesh(new THREE.SphereGeometry(40, 64, 32), domeMat));
  const strip = (w: number, h: number, color: number, k: number, pos: THREE.Vector3) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide, toneMapped: false }));
    m.position.copy(pos); m.lookAt(0, 0, 0); env.add(m);
  };
  strip(14, 5, 0xffffff, 5.0, new THREE.Vector3(0, 14, 2));
  strip(1.2, 16, 0x7fe8ff, 3.5, new THREE.Vector3(-13, 2, 5));
  strip(1.2, 16, 0xff7ad9, 3.0, new THREE.Vector3(13, 1, -4));
  strip(10, 0.8, 0xffb37a, 2.5, new THREE.Vector3(2, -6, -12));
  strip(3, 3, 0xffffff, 8.0, new THREE.Vector3(6, 6, 12));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.015).texture;
  pmrem.dispose();
  env.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
  return tex;
}

export class OrbEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private composer: EffectComposer;
  private geo: THREE.BufferGeometry;
  private envTex: THREE.Texture;
  private axes: THREE.Vector3[];
  private orbs: [Orb, Orb];
  private compare = false;
  private hasBefore = false;
  private focus = -1;
  private focusAmt = 0;
  private spin = 0;
  private liquidTime = 0;
  private clock = new THREE.Clock();
  private raf = 0;
  private active = true;
  private w = 1;
  private h = 1;
  private target = { pos: [[0, 0], [0, 0]] as [number, number][], scale: [1, 0.001], d: 7 };
  private camD = 7;
  private ray = new THREE.Raycaster();
  private drag: { x: number; moved: boolean } | null = null;
  private listeners: [string, EventListener][] = [];

  constructor(private opts: OrbEngineOptions) {
    const { canvas } = opts;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color(opts.background);
    this.envTex = buildEnvironment(this.renderer);
    this.scene.environment = this.envTex;
    this.camera.position.set(0, 0.35, 7);

    const lowPower = window.innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4;
    let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, lowPower ? 72 : 110);
    geo.deleteAttribute('normal');
    geo.deleteAttribute('uv');
    geo = mergeVertices(geo);
    geo.computeVertexNormals();
    this.geo = geo;

    this.axes = axisDirections(opts.axisCount);
    this.orbs = [
      new Orb(geo, this.axes, opts.seed, opts.reducedMotion),
      new Orb(geo, this.axes, opts.seed, opts.reducedMotion),
    ];
    this.orbs.forEach(o => this.scene.add(o.mesh));
    this.orbs[1].mesh.visible = false;
    this.orbs[1].mesh.scale.setScalar(0.001);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.55, 0.82));
    this.composer.addPass(new OutputPass());

    this.listen('pointerdown', (e) => { const p = e as PointerEvent; this.drag = { x: p.clientX, moved: false }; });
    this.listen('pointermove', (e) => this.onMove(e as PointerEvent));
    this.listen('pointerup', () => { this.drag = null; });
    this.listen('pointerleave', () => { this.drag = null; this.focus = -1; opts.onHover?.(null); });
    this.tick = this.tick.bind(this);
    this.raf = requestAnimationFrame(this.tick);
  }

  private listen(type: string, fn: EventListener) {
    this.opts.canvas.addEventListener(type, fn);
    this.listeners.push([type, fn]);
  }

  /** Set the shown run (after) and optionally the run it is compared against (before). */
  setStates(after: OrbState, before: OrbState | null, instant = false) {
    this.orbs[0].set(after, instant);
    this.hasBefore = !!before;
    if (before) this.orbs[1].set(before, instant || !this.compare);
    if (!before && this.compare) this.setCompare(false);
  }

  setCompare(on: boolean) {
    on = on && this.hasBefore;
    if (on === this.compare) return;
    this.compare = on;
    const [a, b] = this.orbs;
    if (on) { b.mesh.position.copy(a.mesh.position); b.mesh.scale.copy(a.mesh.scale); b.mesh.visible = true; }
    this.relayout();
  }

  setFocus(axis: number) { this.focus = axis; }
  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    if (on) { this.clock.getDelta(); this.raf = requestAnimationFrame(this.tick); }
    else cancelAnimationFrame(this.raf);
  }

  resize(w: number, h: number) {
    this.w = Math.max(1, w); this.h = Math.max(1, h);
    this.renderer.setSize(this.w, this.h, false);
    this.composer.setSize(this.w, this.h);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    this.relayout();
  }

  /** Solve orb placement and camera distance so the orb(s) fill the canvas. */
  private relayout() {
    const tanV = Math.tan(THREE.MathUtils.degToRad(16)), fit = 0.9;
    let extW: number, extH: number;
    if (!this.compare) {
      this.target.pos = [[0, 0], [0, 0]];
      this.target.scale = [1, 0.001];
      extW = extH = 2 * R_SINGLE;
    } else {
      const s = COMPARE_SCALE, sep = 2 * R_COMPARE * s * 1.04;
      const side = this.w / this.h > 1.05;
      this.target.pos = side ? [[sep / 2, 0], [-sep / 2, 0]] : [[0, -sep / 2], [0, sep / 2]];
      this.target.scale = [s, s];
      extW = side ? sep + 2 * R_COMPARE * s : 2 * R_COMPARE * s;
      extH = side ? 2 * R_COMPARE * s + 0.7 : sep + 2 * R_COMPARE * s + 0.5;
    }
    this.target.d = Math.max(extW / (2 * tanV * this.camera.aspect * fit), extH / (2 * tanV * fit));
  }

  private onMove(e: PointerEvent) {
    if (this.drag && e.buttons) {
      const dx = e.clientX - this.drag.x;
      if (Math.abs(dx) > 2) this.drag.moved = true;
      this.spin += dx * 0.008;
      this.drag.x = e.clientX;
      this.opts.onHover?.(null);
      return;
    }
    const hit = this.pick(e);
    this.focus = hit ? hit.axis : -1;
    this.opts.onHover?.(hit ? { ...hit, x: e.clientX, y: e.clientY } : null);
    this.opts.canvas.style.cursor = hit ? 'pointer' : 'grab';
  }

  private pick(e: PointerEvent): { axis: number; orb: 0 | 1 } | null {
    const r = this.opts.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const sphere = new THREE.Sphere(), hit = new THREE.Vector3(), inv = new THREE.Quaternion();
    let best: { axis: number; orb: 0 | 1 } | null = null, bestDist = Infinity;
    const candidates: (0 | 1)[] = this.compare ? [0, 1] : [0];
    for (const idx of candidates) {
      const m = this.orbs[idx].mesh;
      sphere.center.copy(m.position); sphere.radius = 1.08 * m.scale.x;
      if (!this.ray.ray.intersectSphere(sphere, hit)) continue;
      const dist = hit.distanceTo(this.camera.position);
      if (dist > bestDist) continue;
      bestDist = dist;
      hit.sub(m.position).normalize().applyQuaternion(inv.copy(m.quaternion).invert());
      let ba = -1, bd = -2;
      this.axes.forEach((a, i) => { const d = a.dot(hit); if (d > bd) { bd = d; ba = i; } });
      best = { axis: ba, orb: idx };
    }
    return best;
  }

  private tick() {
    if (!this.active) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    const motion = this.opts.reducedMotion ? 0.25 : 1;
    this.liquidTime += dt * motion;
    if (!this.drag) this.spin += dt * 0.22 * motion;

    const k = 1 - Math.exp(-dt * 4);
    this.orbs.forEach((o, i) => {
      const [px, py] = this.target.pos[i];
      o.mesh.position.x += (px - o.mesh.position.x) * k;
      o.mesh.position.y += (py - o.mesh.position.y) * k;
      o.mesh.scale.setScalar(o.mesh.scale.x + (this.target.scale[i] - o.mesh.scale.x) * k);
      o.mesh.rotation.y = this.spin;
    });
    if (!this.compare && this.orbs[1].mesh.scale.x < 0.02) this.orbs[1].mesh.visible = false;
    this.camD += (this.target.d - this.camD) * k;
    this.camera.position.set(0, 0.35, 1).normalize().multiplyScalar(this.camD);
    this.camera.lookAt(0, 0, 0);

    this.focusAmt += ((this.focus >= 0 ? 1 : 0) - this.focusAmt) * (1 - Math.exp(-dt * 8));
    this.orbs[0].update(dt, t, this.liquidTime, this.focus, this.focusAmt);
    if (this.orbs[1].mesh.visible) this.orbs[1].update(dt, t, this.liquidTime, this.focus, this.focusAmt);

    if (this.opts.onFrame) {
      const v = new THREE.Vector3();
      const anchor = (o: Orb): OrbAnchor => {
        v.copy(o.mesh.position); v.y -= R_SINGLE * o.mesh.scale.x * 1.02;
        v.project(this.camera);
        return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h, visible: this.compare && o.mesh.scale.x > 0.5 };
      };
      this.opts.onFrame([anchor(this.orbs[0]), anchor(this.orbs[1])]);
    }

    this.composer.render();
    this.raf = requestAnimationFrame(this.tick);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.active = false;
    this.listeners.forEach(([type, fn]) => this.opts.canvas.removeEventListener(type, fn));
    this.orbs.forEach(o => o.dispose());
    this.geo.dispose();
    this.envTex.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
