import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnimatedMeshBg } from "./pages/discovery/components/AnimatedMeshBg";
import { VoiceListening } from "./pages/discovery/components/VoiceListening";
import "./index.css";
import "./pages/discovery/discovery.css";

/** Fake "speech": a voice-ish tone stack whose level swings like syllables. */
function useSyntheticStream(gainLevel: number) {
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const gain = ctx.createGain();
    gain.gain.value = gainLevel;
    gain.connect(dest);

    for (const [freq, amount] of [
      [140, 0.5],
      [420, 0.3],
      [1100, 0.15],
      [3200, 0.08],
    ]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      const partial = ctx.createGain();
      partial.gain.value = amount;
      osc.connect(partial).connect(gain);
      osc.start();
    }

    // Syllable-rate amplitude modulation.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 2.6;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = gainLevel * 0.9;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start();

    const unlock = () => void ctx.resume();
    document.addEventListener("pointerdown", unlock);
    void ctx.resume();

    setStream(dest.stream);
    (window as unknown as { __ctx: AudioContext }).__ctx = ctx;

    return () => {
      document.removeEventListener("pointerdown", unlock);
      void ctx.close();
    };
  }, [gainLevel]);

  return stream;
}

function Preview() {
  const params = new URLSearchParams(location.search);
  const loud = params.get("loud") === "1";
  const silent = params.get("silent") === "1";
  const stream = useSyntheticStream(loud ? 0.95 : 0.25);

  return (
    <div className="discovery-root">
      <AnimatedMeshBg />
      <div className="z-page">
        <section className="z-hero">
          <div className="z-badges">
            <span className="z-badge z-badge-dark">AI Service Matching</span>
            <span className="z-badge z-badge-light">Addis AI ›</span>
          </div>
          <h1>
            Find Trusted Local
            <br />
            Services in Seconds.
          </h1>
          <p>
            Describe your problem in text or voice — Zeyla classifies it, ranks
            nearby providers by trust score, and connects you in real time.
          </p>
        </section>
        <section className="z-glass-card">
          <div className="z-glass-inner">
            <textarea
              className="z-textarea"
              defaultValue="Kitchen sink is leaking badly"
              rows={5}
            />
          </div>
        </section>
      </div>
      <VoiceListening
        phase="listening"
        stream={silent ? null : stream}
        onStop={() => {}}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
