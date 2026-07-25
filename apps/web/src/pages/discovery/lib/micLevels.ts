/**
 * Turns a live microphone stream into normalised drive values for the voice
 * blob: an overall level plus low / mid / high band energy.
 *
 * Raw RMS is close to useless as a visual driver — a built-in laptop mic in a
 * quiet room peaks around 0.05 while a headset clips at 1.0, so a fixed gain
 * either leaves the blob dead or pinned. Every value here is normalised
 * against a rolling noise floor and a rolling peak instead, which means the
 * blob always uses its full range whatever the hardware is doing.
 */

export interface MicFrame {
  /** Overall loudness, 0–1 after adaptive normalisation. */
  level: number;
  /** Band energies, 0–1, for shaping rather than scale. */
  low: number;
  mid: number;
  high: number;
}

/** Approximate speech bands, in Hz. */
const BANDS: ReadonlyArray<readonly [number, number]> = [
  [60, 320],
  [320, 2000],
  [2000, 6000],
];

/** Below this the floor and peak are treated as touching, i.e. silence. */
const MIN_RANGE = 0.045;

/** Exponential follower that is fast one way and slow the other. */
function follow(current: number, target: number, rate: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

class Normalizer {
  private floor: number;
  private peak: number;

  constructor(floor: number, peak: number) {
    this.floor = floor;
    this.peak = peak;
  }

  push(value: number, dt: number) {
    // Floor drops quickly to track a room going quiet, and creeps back up so a
    // long pause does not permanently raise the bar.
    this.floor = follow(this.floor, value, value < this.floor ? 4 : 0.1, dt);
    // Peak snaps to a shout, then decays over a few seconds.
    this.peak = follow(this.peak, value, value > this.peak ? 16 : 0.28, dt);

    const range = Math.max(this.peak - this.floor, MIN_RANGE);
    const normalized = (value - this.floor) / range;
    return normalized < 0 ? 0 : normalized > 1 ? 1 : normalized;
  }
}

export class MicLevels {
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timeData = new Uint8Array(0);
  private freqData = new Uint8Array(0);
  private bandBins: Array<[number, number]> = [];
  private levelNorm = new Normalizer(0.02, 0.1);
  private bandNorms = [
    new Normalizer(0.02, 0.1),
    new Normalizer(0.02, 0.1),
    new Normalizer(0.02, 0.1),
  ];
  /** Mutated in place — read() runs every frame and must not allocate. */
  private readonly frame: MicFrame = { level: 0, low: 0, mid: 0, high: 0 };

  get active() {
    return this.analyser !== null;
  }

  attach(stream: MediaStream) {
    this.detach();

    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const context = new AudioCtx();
    // Safari hands back a suspended context when there was no direct gesture.
    if (context.state === "suspended") void context.resume();

    const analyser = context.createAnalyser();
    // 1024 keeps per-frame work small while still giving ~47 Hz bin width,
    // which is enough to separate a voice fundamental from sibilance.
    analyser.fftSize = 1024;
    // Low smoothing: the visual smoothing happens in the render loop, and
    // doing it twice makes the blob feel laggy.
    analyser.smoothingTimeConstant = 0.45;

    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);

    const binHz = context.sampleRate / analyser.fftSize;
    const bins = analyser.frequencyBinCount;

    this.context = context;
    this.source = source;
    this.analyser = analyser;
    this.timeData = new Uint8Array(analyser.fftSize);
    this.freqData = new Uint8Array(bins);
    this.bandBins = BANDS.map(([from, to]) => [
      Math.max(1, Math.round(from / binHz)),
      Math.min(bins, Math.max(2, Math.round(to / binHz))),
    ]);
    this.levelNorm = new Normalizer(0.02, 0.1);
    this.bandNorms = [
      new Normalizer(0.02, 0.1),
      new Normalizer(0.02, 0.1),
      new Normalizer(0.02, 0.1),
    ];
  }

  detach() {
    this.source?.disconnect();
    this.analyser?.disconnect();
    if (this.context) void this.context.close();
    this.context = null;
    this.source = null;
    this.analyser = null;
  }

  /** Returns null when no stream is attached, so callers can idle instead. */
  read(dt: number): MicFrame | null {
    const analyser = this.analyser;
    if (!analyser) return null;

    analyser.getByteTimeDomainData(this.timeData);
    // Every other sample is plenty for an amplitude envelope and halves the
    // per-frame loop cost.
    let sum = 0;
    let count = 0;
    for (let i = 0; i < this.timeData.length; i += 2) {
      const centered = (this.timeData[i] - 128) / 128;
      sum += centered * centered;
      count += 1;
    }
    const rms = Math.sqrt(sum / count);

    analyser.getByteFrequencyData(this.freqData);
    const bands = this.frame;
    const keys = ["low", "mid", "high"] as const;
    for (let b = 0; b < this.bandBins.length; b += 1) {
      const [from, to] = this.bandBins[b];
      let total = 0;
      for (let i = from; i < to; i += 1) total += this.freqData[i];
      const average = total / ((to - from) * 255);
      bands[keys[b]] = this.bandNorms[b].push(average, dt);
    }

    // A gentle curve below 1 lifts conversational speech off the floor without
    // making the top of the range feel compressed.
    bands.level = Math.pow(this.levelNorm.push(rms, dt), 0.8);
    return bands;
  }
}
