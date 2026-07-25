import { useEffect, useRef } from "react";
import { MicLevels } from "../lib/micLevels.js";

/**
 * Audio-reactive blob: a subdivided icosphere pushed around by 3D simplex
 * noise, drawn through a hand-rolled WebGL2 pipeline.
 *
 * This used to run on three.js. The overlay only ever draws one mesh with one
 * material, so the engine was ~150 kB gzipped of scene graph we never touched;
 * doing it directly also lets the geometry stay indexed, which cuts the number
 * of noise evaluations per frame by roughly an order of magnitude.
 *
 * Pass the live MediaStream while recording. With no stream the blob falls
 * back to a slow idle breathe.
 */

const vertexShader = /* glsl */ `#version 300 es
precision highp float;

in vec3 aPos;

uniform mat4 uProjection;
uniform mat3 uRotation;
uniform vec3 uOffset;
uniform float uRadius;
uniform float uAmp;
uniform float uDetailAmp;
uniform float uFreq;
uniform float uFlow;

out vec3 vViewPos;
out vec3 vNormal;
out float vDisp;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float displace(vec3 p) {
  vec3 q = p * uFreq;
  float base = snoise(q + vec3(0.0, 0.0, uFlow));
  float detail = snoise(q * 2.6 + vec3(-uFlow * 1.4, uFlow * 0.9, 0.0));
  return base * uAmp + detail * uDetailAmp;
}

void main() {
  vec3 p = aPos;
  float d = displace(p);
  vec3 center = p * (uRadius + d);

  // Finite differences along two tangents give smooth normals without having
  // to re-upload a normal buffer every frame.
  vec3 up = abs(p.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 t1 = normalize(cross(up, p));
  vec3 t2 = cross(p, t1);
  const float eps = 0.04;
  vec3 pa = normalize(p + t1 * eps);
  vec3 pb = normalize(p + t2 * eps);
  vec3 a = pa * (uRadius + displace(pa)) - center;
  vec3 b = pb * (uRadius + displace(pb)) - center;
  vec3 n = normalize(cross(a, b));
  if (dot(n, p) < 0.0) n = -n;

  vViewPos = uRotation * center + uOffset;
  vNormal = uRotation * n;
  vDisp = d;

  gl_Position = uProjection * vec4(vViewPos, 1.0);
}
`;

const fragmentShader = /* glsl */ `#version 300 es
precision highp float;

in vec3 vViewPos;
in vec3 vNormal;
in float vDisp;

uniform vec3 uColor;
uniform vec3 uHighlight;
uniform vec3 uRim;
uniform float uEnergy;

out vec4 fragColor;

void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(-vViewPos);
  vec3 keyDir = normalize(vec3(0.35, 0.65, 0.75));

  float key = max(dot(n, keyDir), 0.0);
  float fill = max(dot(n, vec3(-0.55, -0.25, 0.4)), 0.0) * 0.22;
  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.6);

  // Peaks catch the highlight, and louder speech pushes more of it through.
  float crest = smoothstep(0.0, 0.3, vDisp) * (0.3 + 0.7 * uEnergy);
  vec3 body = mix(uColor, uHighlight, crest);

  vec3 color = body * (0.42 + 0.7 * key + fill);
  color += uRim * fresnel * (0.25 + 0.75 * uEnergy);

  fragColor = vec4(color, 1.0);
}
`;

interface VoiceBlobProps {
  /** Live mic stream — drives displacement from real amplitude. */
  stream?: MediaStream | null;
  /** Listening state: raises the floor amplitude even during silence. */
  listening?: boolean;
  color?: string;
  highlight?: string;
  rim?: string;
  className?: string;
}

/** Amplitude floors, as a fraction of the unit radius. */
const IDLE_AMP = 0.06;
const LISTEN_AMP = 0.12;
const PEAK_AMP = 0.44;

/**
 * Camera framing. FIT is the half-extent of the view at the blob's centre
 * plane, in blob radii — it is what decides how much of the container the
 * blob fills, with just enough headroom that a shout does not clip the
 * silhouette against the canvas edge.
 */
const FOV = (46 * Math.PI) / 180;
const FIT = 1.3;

/**
 * Ceiling on drawing-buffer pixels. The blob is now most of the viewport, so
 * a naive devicePixelRatio of 3 on a phone would quadruple fill cost for no
 * visible gain on an already soft, gradient-shaded shape.
 */
const MAX_DEVICE_PIXELS = 1_300_000;

/** Icosphere subdivision: vertices = 10 * 4^n + 2. */
function buildIcosphere(subdivisions: number) {
  const t = (1 + Math.sqrt(5)) / 2;
  const positions = [
    -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0,
    0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t,
    t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1,
  ];
  for (let i = 0; i < positions.length; i += 3) {
    const length = Math.hypot(positions[i], positions[i + 1], positions[i + 2]);
    positions[i] /= length;
    positions[i + 1] /= length;
    positions[i + 2] /= length;
  }

  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  const cache = new Map<number, number>();
  const midpoint = (a: number, b: number) => {
    const key = a < b ? a * 1_000_000 + b : b * 1_000_000 + a;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    let x = (positions[a * 3] + positions[b * 3]) / 2;
    let y = (positions[a * 3 + 1] + positions[b * 3 + 1]) / 2;
    let z = (positions[a * 3 + 2] + positions[b * 3 + 2]) / 2;
    const length = Math.hypot(x, y, z);
    x /= length;
    y /= length;
    z /= length;

    const index = positions.length / 3;
    positions.push(x, y, z);
    cache.set(key, index);
    return index;
  };

  for (let step = 0; step < subdivisions; step += 1) {
    const next: number[][] = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }

  const indices = new Uint16Array(faces.length * 3);
  for (let i = 0; i < faces.length; i += 1) {
    indices[i * 3] = faces[i][0];
    indices[i * 3 + 1] = faces[i][1];
    indices[i * 3 + 2] = faces[i][2];
  }

  return { positions: new Float32Array(positions), indices };
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    if (import.meta.env.DEV) console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function link(gl: WebGL2RenderingContext) {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexShader);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentShader);
  if (!vertex || !fragment) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    if (import.meta.env.DEV) console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

/** Column-major perspective matrix, camera at the origin looking down -Z. */
function perspective(out: Float32Array, aspect: number) {
  const f = 1 / Math.tan(FOV / 2);
  const near = 0.1;
  const far = 100;
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
}

export function VoiceBlob({
  stream,
  listening = false,
  color = "#101215",
  highlight = "#5eead4",
  rim = "#ffb98a",
  className,
}: VoiceBlobProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const listeningRef = useRef(listening);
  const micRef = useRef<MicLevels | null>(null);
  if (!micRef.current) micRef.current = new MicLevels();

  listeningRef.current = listening;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const mic = micRef.current;
    if (!mic) return;

    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      depth: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) return; // No WebGL2 — the CSS fallback ring stays visible.

    const program = link(gl);
    if (!program) return;

    // A low-core or small-screen device gets one subdivision less: 2.5k
    // vertices instead of 10k, which is still smooth at this size.
    const lowPower =
      window.innerWidth < 640 || (navigator.hardwareConcurrency ?? 4) <= 4;
    const { positions, indices } = buildIcosphere(lowPower ? 4 : 5);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const attribute = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 0, 0);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    gl.useProgram(program);
    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const uProjection = uniform("uProjection");
    const uRotation = uniform("uRotation");
    const uOffset = uniform("uOffset");
    const uRadius = uniform("uRadius");
    const uAmp = uniform("uAmp");
    const uDetailAmp = uniform("uDetailAmp");
    const uFreq = uniform("uFreq");
    const uFlow = uniform("uFlow");
    const uEnergy = uniform("uEnergy");

    gl.uniform3fv(uniform("uColor"), hexToRgb(color));
    gl.uniform3fv(uniform("uHighlight"), hexToRgb(highlight));
    gl.uniform3fv(uniform("uRim"), hexToRgb(rim));

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 0);

    canvas.className = "z-voice-blob-canvas";
    container.appendChild(canvas);
    container.classList.add("is-live");

    const projection = new Float32Array(16);
    const rotation = new Float32Array(9);
    let distance = 6;
    let dprCap = 2;
    let resizePending = true;

    const resize = () => {
      resizePending = false;
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      const aspect = width / height;

      const budget = Math.sqrt(MAX_DEVICE_PIXELS / (width * height));
      const scale = Math.max(
        1,
        Math.min(window.devicePixelRatio || 1, dprCap, budget),
      );

      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);

      perspective(projection, aspect);
      // Pull the camera back far enough that the blob fits the narrow axis.
      distance = FIT / Math.tan(FOV / 2) / Math.min(1, aspect);
      gl.uniformMatrix4fv(uProjection, false, projection);
    };

    const observer = new ResizeObserver(() => {
      resizePending = true;
    });
    observer.observe(container);

    let pointerX = 0;
    let pointerY = 0;
    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      pointerX = Math.max(-1, Math.min(1, x));
      pointerY = Math.max(-1, Math.min(1, y));
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    let frame = 0;
    let lost = false;
    let last = performance.now();
    let elapsed = 0;
    let flow = 0;
    let rotX = 0;
    let rotY = 0;
    let level = 0;
    let beat = 0;
    let offsetX = 0;
    let offsetY = 0;

    // Frame-time probe: if the first couple of seconds cannot hold 45 fps the
    // device is not going to cope with a full-resolution buffer.
    let probed = 0;
    let probeTime = 0;
    let probeFrames = 0;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      cancelAnimationFrame(frame);
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);

    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      if (lost) return;

      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      elapsed += dt;

      if (probed < 160) {
        probed += 1;
        // Skip the first frames: they include shader compile and layout.
        if (probed > 40) {
          probeTime += dt;
          probeFrames += 1;
        }
        if (probed === 160 && probeTime / probeFrames > 0.022 && dprCap > 1.25) {
          dprCap = 1.25;
          resizePending = true;
        }
      }

      if (resizePending) resize();

      const audio = mic.read(dt);
      const isListening = listeningRef.current;

      // With no mic attached the blob breathes rather than freezing, so the
      // transcribing and understanding phases still feel alive.
      const idle = (Math.sin(elapsed * 1.15) * 0.5 + 0.5) * (isListening ? 0.18 : 0.1);
      const target = audio ? audio.level : idle;

      // Fast attack, slow release: the blob snaps to a syllable then settles.
      const previous = level;
      const rate = target > level ? 26 : 5;
      level += (target - level) * (1 - Math.exp(-rate * dt));

      // Onsets add a short-lived kick on top, which is what reads as "punchy".
      const onset = Math.min(1, Math.max(0, level - previous) * 14);
      beat = Math.max(beat * Math.exp(-7 * dt), onset);

      const floorAmp = isListening ? LISTEN_AMP : IDLE_AMP;
      flow += dt * (0.3 + level * 1.7);
      rotY += dt * (0.13 + level * 0.85);
      rotX += dt * (0.05 + level * 0.3);

      gl.uniform1f(uRadius, 1 + level * 0.12 + beat * 0.05);
      gl.uniform1f(uAmp, floorAmp + (PEAK_AMP - floorAmp) * level);
      gl.uniform1f(uDetailAmp, 0.03 + (audio?.high ?? 0) * 0.14 + beat * 0.05);
      gl.uniform1f(uFreq, 1.05 + (audio?.mid ?? 0) * 0.55);
      gl.uniform1f(uFlow, flow);
      gl.uniform1f(uEnergy, level);

      // Two out-of-phase sines per axis so the drift never visibly repeats.
      const wanderX =
        Math.sin(elapsed * 0.53) * 0.6 + Math.sin(elapsed * 0.21 + 1.7) * 0.4;
      const wanderY =
        Math.cos(elapsed * 0.41) * 0.5 + Math.cos(elapsed * 0.17 + 0.6) * 0.3;
      const reach = 0.12 * (1 + level * 1.5);
      const follow = 1 - Math.exp(-(2.5 + level * 4) * dt);
      offsetX += ((wanderX + pointerX * 0.5) * reach - offsetX) * follow;
      offsetY += ((wanderY + pointerY * 0.45) * reach - offsetY) * follow;
      gl.uniform3f(uOffset, offsetX, offsetY, -distance);

      const cx = Math.cos(rotX);
      const sx = Math.sin(rotX);
      const cy = Math.cos(rotY);
      const sy = Math.sin(rotY);
      rotation[0] = cy;
      rotation[1] = 0;
      rotation[2] = -sy;
      rotation[3] = sy * sx;
      rotation[4] = cx;
      rotation[5] = cy * sx;
      rotation[6] = sy * cx;
      rotation[7] = -sx;
      rotation[8] = cy * cx;
      gl.uniformMatrix3fv(uRotation, false, rotation);

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    };

    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(indexBuffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
      container.classList.remove("is-live");
    };
  }, [color, highlight, rim]);

  useEffect(() => {
    const mic = micRef.current;
    if (!mic || !stream) return;
    mic.attach(stream);
    return () => mic.detach();
  }, [stream]);

  return (
    <div
      ref={containerRef}
      className={`z-voice-blob${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      <span className="z-voice-blob-fallback" />
    </div>
  );
}
