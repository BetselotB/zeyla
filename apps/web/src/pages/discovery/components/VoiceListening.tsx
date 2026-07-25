import { Suspense, lazy } from "react";

// Three.js only loads once the user actually starts a voice capture.
const VoiceBlob = lazy(() =>
  import("./VoiceBlob.js").then((m) => ({ default: m.VoiceBlob })),
);

function BlobPlaceholder() {
  return (
    <div className="z-voice-blob" aria-hidden="true">
      <span className="z-voice-blob-fallback" />
    </div>
  );
}

interface VoiceListeningProps {
  phase: "listening" | "transcribing";
  stream: MediaStream | null;
  elapsedSeconds: number;
  onStop: () => void;
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function VoiceListening({
  phase,
  stream,
  elapsedSeconds,
  onStop,
}: VoiceListeningProps) {
  const listening = phase === "listening";

  return (
    <div
      className="z-voice-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={listening ? "Listening to your problem" : "Transcribing"}
    >
      <div className="z-voice-panel">
        <Suspense fallback={<BlobPlaceholder />}>
          <VoiceBlob stream={stream} listening={listening} />
        </Suspense>

        <p className="z-voice-title">
          {listening ? "Listening…" : "Transcribing…"}
        </p>
        <p className="z-voice-hint">
          {listening
            ? "Describe your problem out loud. Take as long as you need."
            : "Turning your voice into text."}
        </p>

        {listening ? (
          <>
            <p className="z-voice-timer">
              <span className="z-voice-rec-dot" aria-hidden="true" />
              {formatDuration(elapsedSeconds)}
            </p>
            <button
              type="button"
              className="z-btn z-btn-primary"
              onClick={onStop}
            >
              Stop &amp; transcribe
            </button>
          </>
        ) : (
          <span className="z-voice-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
      </div>
    </div>
  );
}
