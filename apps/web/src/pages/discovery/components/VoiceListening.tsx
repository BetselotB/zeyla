import { Suspense, lazy, useEffect, useRef, useState } from "react";

const VoiceBlob = lazy(() =>
  import("./VoiceBlob.js").then((m) => ({ default: m.VoiceBlob })),
);

/**
 * Warms the blob chunk before the mic is tapped, so the overlay opens on the
 * blob rather than on the placeholder ring.
 */
export function prefetchVoiceBlob() {
  void import("./VoiceBlob.js");
}

function BlobPlaceholder() {
  return (
    <div className="z-voice-blob" aria-hidden="true">
      <span className="z-voice-blob-fallback" />
    </div>
  );
}

type VoicePhase = "listening" | "transcribing" | "understanding" | "ready";

interface VoiceListeningProps {
  phase: VoicePhase;
  stream: MediaStream | null;
  onStop: () => void;
}

const PHASE_COPY: Record<VoicePhase, { label: string; title: string }> = {
  listening: { label: "Listening to your problem", title: "Listening" },
  transcribing: { label: "Transcribing", title: "Transcribing…" },
  understanding: {
    label: "Understanding your problem",
    title: "Understanding…",
  },
  ready: { label: "Got it", title: "Got it" },
};

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Owns its own clock so the ticking second never re-renders the intake form
 * sitting behind the overlay.
 */
function RecordingTimer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    // Polled at half a second so the digit turns over on time; React bails out
    // of the render when the value has not changed.
    const tick = setInterval(
      () => setSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      500,
    );
    return () => clearInterval(tick);
  }, []);

  return (
    <p className="z-voice-timer">
      <span className="z-voice-rec-dot" aria-hidden="true" />
      {formatDuration(seconds)}
    </p>
  );
}

/**
 * Full-screen capture view: the page is blurred out behind a scrim and the
 * only things left on screen are the blob, the record dot and the elapsed
 * time. Anywhere on the scrim stops the recording, as does Escape.
 */
export function VoiceListening({ phase, stream, onStop }: VoiceListeningProps) {
  const listening = phase === "listening";
  const copy = PHASE_COPY[phase];
  const stopRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Pausing the page's own animations keeps the backdrop static, which lets
    // the compositor cache the blurred scrim instead of re-blurring the whole
    // viewport on every animation frame.
    document.body.classList.add("z-voice-open");
    return () => document.body.classList.remove("z-voice-open");
  }, []);

  useEffect(() => {
    if (!listening) return;
    stopRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onStop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listening, onStop]);

  return (
    <div
      className="z-voice-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={copy.label}
    >
      <div className="z-voice-scrim" aria-hidden="true" />

      {listening && (
        <button
          type="button"
          className="z-voice-stop-surface"
          onClick={onStop}
          aria-label="Stop recording and transcribe"
          tabIndex={-1}
        />
      )}

      <div className="z-voice-stage">
        <Suspense fallback={<BlobPlaceholder />}>
          <VoiceBlob stream={stream} listening={listening} />
        </Suspense>

        {listening ? (
          <>
            <RecordingTimer />
            <button
              ref={stopRef}
              type="button"
              className="z-voice-close"
              onClick={onStop}
              aria-label="Stop recording and transcribe"
            >
              <CloseIcon />
            </button>
          </>
        ) : (
          <div className="z-voice-phase-group">
            {phase === "ready" && (
              <span className="z-voice-done" aria-hidden="true">
                ✓
              </span>
            )}
            <p className="z-voice-phase">{copy.title}</p>
          </div>
        )}
      </div>
    </div>
  );
}
