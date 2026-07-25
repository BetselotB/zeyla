import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Perlin-displaced sphere that reacts to live microphone amplitude.
 * Pass the active MediaStream while recording; the blob falls back to a
 * slow idle breathe when no stream is attached.
 */

const vertexShader = /* glsl */ `
  uniform float u_intensity;
  uniform float u_time;

  varying vec2 vUv;
  varying float vDisplacement;

  vec4 permute(vec4 x) {
    return mod(((x * 34.0) + 1.0) * x, 289.0);
  }

  vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
  }

  vec3 fade(vec3 t) {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  }

  float cnoise(vec3 P) {
    vec3 Pi0 = floor(P);
    vec3 Pi1 = Pi0 + vec3(1.0);
    Pi0 = mod(Pi0, 289.0);
    Pi1 = mod(Pi1, 289.0);
    vec3 Pf0 = fract(P);
    vec3 Pf1 = Pf0 - vec3(1.0);
    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    vec4 iy = vec4(Pi0.yy, Pi1.yy);
    vec4 iz0 = Pi0.zzzz;
    vec4 iz1 = Pi1.zzzz;

    vec4 ixy = permute(permute(ix) + iy);
    vec4 ixy0 = permute(ixy + iz0);
    vec4 ixy1 = permute(ixy + iz1);

    vec4 gx0 = ixy0 / 7.0;
    vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
    gx0 = fract(gx0);
    vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
    vec4 sz0 = step(gz0, vec4(0.0));
    gx0 -= sz0 * (step(0.0, gx0) - 0.5);
    gy0 -= sz0 * (step(0.0, gy0) - 0.5);

    vec4 gx1 = ixy1 / 7.0;
    vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
    gx1 = fract(gx1);
    vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
    vec4 sz1 = step(gz1, vec4(0.0));
    gx1 -= sz1 * (step(0.0, gx1) - 0.5);
    gy1 -= sz1 * (step(0.0, gy1) - 0.5);

    vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
    vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
    vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
    vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
    vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
    vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
    vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
    vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);

    vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
    g000 *= norm0.x;
    g010 *= norm0.y;
    g100 *= norm0.z;
    g110 *= norm0.w;
    vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
    g001 *= norm1.x;
    g011 *= norm1.y;
    g101 *= norm1.z;
    g111 *= norm1.w;

    float n000 = dot(g000, Pf0);
    float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
    float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
    float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
    float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
    float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
    float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
    float n111 = dot(g111, Pf1);

    vec3 fade_xyz = fade(Pf0);
    vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
    vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
    float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
    return 2.2 * n_xyz;
  }

  void main() {
    vUv = uv;
    vDisplacement = cnoise(position + vec3(2.0 * u_time));
    vec3 newPosition = position + normal * (u_intensity * vDisplacement);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(newPosition, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float u_intensity;
  uniform float u_time;
  uniform vec3 u_color;
  uniform vec3 u_highlight;

  varying vec2 vUv;
  varying float vDisplacement;

  void main() {
    float distort = 2.0 * vDisplacement * u_intensity * sin(vUv.y * 10.0 + u_time);
    vec3 color = mix(u_color, u_highlight, clamp(distort, 0.0, 1.0));
    gl_FragColor = vec4(color, 1.0);
  }
`;

interface VoiceBlobProps {
  /** Live mic stream — drives displacement from real amplitude. */
  stream?: MediaStream | null;
  /** Listening state: raises the floor intensity even during silence. */
  listening?: boolean;
  color?: string;
  highlight?: string;
  className?: string;
}

const IDLE_INTENSITY = 0.16;
const LISTEN_INTENSITY = 0.3;
const PEAK_INTENSITY = 0.85;

export function VoiceBlob({
  stream,
  listening = false,
  color = "#111111",
  highlight = "#5eead4",
  className,
}: VoiceBlobProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef(0);
  const listeningRef = useRef(listening);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const samplesRef = useRef<Uint8Array | null>(null);

  listeningRef.current = listening;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // No WebGL — the CSS fallback ring stays visible.
    }

    const size = () => ({
      width: container.clientWidth || 1,
      height: container.clientHeight || 1,
    });

    const { width, height } = size();
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearAlpha(0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 100);
    camera.position.z = 8;

    const uniforms = {
      u_time: { value: 0 },
      u_intensity: { value: IDLE_INTENSITY },
      u_color: { value: new THREE.Color(color) },
      u_highlight: { value: new THREE.Color(highlight) },
    };

    const detail = window.innerWidth < 640 ? 12 : 20;
    const geometry = new THREE.IcosahedronGeometry(2, detail);
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
    });

    const mesh = new THREE.Mesh(geometry, material);
    const baseScale = 1.3;
    mesh.scale.setScalar(baseScale);
    scene.add(mesh);

    const clock = new THREE.Clock();
    const pointer = new THREE.Vector2(0, 0);
    const targetPos = new THREE.Vector3();
    const currentPos = new THREE.Vector3();
    let frame = 0;
    let shaderTime = 0;
    let elapsed = 0;

    const clamp = (n: number) => Math.max(-1, Math.min(1, n));

    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointer.x = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1);
      pointer.y = clamp(-((event.clientY - rect.top) / rect.height) * 2 + 1);
    };
    window.addEventListener("pointermove", handlePointerMove);

    function readMicLevel() {
      const analyser = analyserRef.current;
      const samples = samplesRef.current;
      if (!analyser || !samples) return 0;

      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const centered = (samples[i] - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / samples.length);
      return Math.min(1, rms * 4);
    }

    function animate() {
      frame = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      elapsed += delta;

      const target = readMicLevel();
      // Fast attack, slow release, so the blob snaps to speech then settles.
      const smoothing = target > levelRef.current ? 0.35 : 0.08;
      levelRef.current += (target - levelRef.current) * smoothing;
      const level = levelRef.current;

      const floor = listeningRef.current ? LISTEN_INTENSITY : IDLE_INTENSITY;
      uniforms.u_intensity.value = floor + (PEAK_INTENSITY - floor) * level;

      shaderTime += delta * (0.35 + level * 1.1);
      uniforms.u_time.value = shaderTime;

      // Wander on two out-of-phase sines so the path never visibly repeats;
      // speech widens the reach and the pointer nudges it around.
      const wanderX =
        Math.sin(elapsed * 0.62) * 0.55 + Math.sin(elapsed * 0.23 + 1.7) * 0.35;
      const wanderY =
        Math.cos(elapsed * 0.47) * 0.45 + Math.cos(elapsed * 0.19 + 0.6) * 0.3;
      const reach = 0.55 * (1 + level * 1.4);

      targetPos.set(
        (wanderX + pointer.x * 0.6) * reach,
        (wanderY + pointer.y * 0.5) * reach,
        0,
      );
      currentPos.lerp(targetPos, 0.06 + level * 0.12);
      mesh.position.copy(currentPos);

      mesh.scale.setScalar(baseScale * (1 + level * 0.14));
      mesh.rotation.y += delta * (0.15 + level * 0.5);
      mesh.rotation.x += delta * (0.05 + level * 0.2);

      renderer.render(scene, camera);
    }

    animate();

    const observer = new ResizeObserver(() => {
      const next = size();
      camera.aspect = next.width / next.height;
      camera.updateProjectionMatrix();
      renderer.setSize(next.width, next.height);
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", handlePointerMove);
      observer.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [color, highlight]);

  useEffect(() => {
    if (!stream) {
      analyserRef.current = null;
      samplesRef.current = null;
      return;
    }

    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const context = new AudioCtx();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);

    analyserRef.current = analyser;
    samplesRef.current = new Uint8Array(analyser.fftSize);

    return () => {
      analyserRef.current = null;
      samplesRef.current = null;
      source.disconnect();
      analyser.disconnect();
      void context.close();
    };
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
