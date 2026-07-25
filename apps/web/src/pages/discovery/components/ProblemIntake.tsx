import { useEffect, useRef, useState } from "react";
import { useLanguage, languageLabels } from "../lib/language.js";
import type { LanguageCode } from "../lib/types.js";
import { classify, createRequest, transcribe } from "../lib/api.js";
import type { Classification } from "../lib/types.js";
import { ClassificationCard } from "./ClassificationCard.js";
import { GlassSelect } from "./GlassSelect.js";
import { VoiceListening } from "./VoiceListening.js";

const PLACEHOLDER =
  "Welcome to Zeyla. Turn your problem into a matched provider in seconds…";

/** Safety net only — recording normally ends when the user taps stop. */
const MAX_RECORD_SECONDS = 300;

interface ProblemIntakeProps {
  onResults: (classification: Classification, requestId: number) => void;
}

function GlobeIcon() {
  return (
    <svg className="z-selector-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c2 2.5 2 9.5 0 12M8 2c-2 2.5-2 9.5 0 12" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg className="z-selector-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="2" y="5" width="12" height="8" rx="1.5" />
      <path d="M6 5V4a2 2 0 012-2h0a2 2 0 012 2v1" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="z-selector-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M13 8a5 5 0 01-8.5 3.5M3 8a5 5 0 018.5-3.5" />
      <path d="M3 4V8H7M13 12V8H9" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg className="z-selector-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="5.5" y="2" width="5" height="7" rx="2.5" />
      <path d="M3 8a5 5 0 0010 0M8 13v2" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg className="z-selector-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" />
    </svg>
  );
}

const CATEGORY_OPTIONS = [
  { value: "any", label: "Any service" },
  { value: "plumber", label: "Plumber" },
  { value: "electrician", label: "Electrician" },
];

const STYLE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "standard", label: "Standard" },
  { value: "express", label: "Express" },
];

const URGENCY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Normal" },
  { value: "high", label: "Urgent" },
];

export function ProblemIntake({ onResults }: ProblemIntakeProps) {
  const { lang, setLang, label } = useLanguage();
  const [text, setText] = useState("");
  const [category, setCategory] = useState("any");
  const [serviceStyle, setServiceStyle] = useState("professional");
  const [urgency, setUrgency] = useState("medium");
  const [voicePhase, setVoicePhase] = useState<
    "idle" | "listening" | "transcribing"
  >("idle");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classification, setClassification] = useState<Classification | null>(null);

  const stopRecordingRef = useRef<(() => void) | null>(null);
  const recording = voicePhase !== "idle";

  const languageOptions = (Object.keys(languageLabels) as LanguageCode[]).map(
    (code) => ({ value: code, label: languageLabels[code] }),
  );

  useEffect(() => {
    if (voicePhase !== "listening") return;
    const id = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [voicePhase]);

  useEffect(() => {
    if (!micStream) return;
    return () => micStream.getTracks().forEach((t) => t.stop());
  }, [micStream]);

  async function handleRecord() {
    setError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access failed. Type your problem instead.");
      return;
    }

    setMicStream(stream);
    setElapsedSeconds(0);
    setVoicePhase("listening");

    try {
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.start();

      // Waits for the stop button; the timeout is only a runaway guard.
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, MAX_RECORD_SECONDS * 1000);
        stopRecordingRef.current = () => {
          window.clearTimeout(timer);
          resolve();
        };
      });

      if (recorder.state !== "inactive") recorder.stop();
      await stopped;

      stream.getTracks().forEach((t) => t.stop());
      setMicStream(null);
      setVoicePhase("transcribing");

      const blob = new Blob(chunks, { type: "audio/webm" });
      setText(await transcribe(blob, lang));
    } catch {
      setError("Voice capture failed. Type your problem instead.");
    } finally {
      stopRecordingRef.current = null;
      stream.getTracks().forEach((t) => t.stop());
      setMicStream(null);
      setVoicePhase("idle");
    }
  }

  async function handleSubmit() {
    if (!text.trim()) {
      setError("Please describe your problem first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await classify(text.trim());
      setClassification({ ...result, urgency: urgency as Classification["urgency"] });
    } catch {
      setError("Classification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!classification) return;
    setConfirmLoading(true);
    setError(null);
    try {
      const request = await createRequest({
        ...classification,
        text: text.trim(),
        service_style: serviceStyle,
        category_hint: category,
      });
      onResults(classification, request.id);
    } catch {
      setError("Could not create request. Please try again.");
    } finally {
      setConfirmLoading(false);
    }
  }

  if (classification) {
    return (
      <>
        {error && <div className="z-error">{error}</div>}
        <ClassificationCard
          classification={classification}
          onEdit={() => setClassification(null)}
          onConfirm={handleConfirm}
          loading={confirmLoading}
        />
      </>
    );
  }

  return (
    <>
      <section className="z-glass-card">
        <div className="z-glass-inner">
          <textarea
            className="z-textarea"
            placeholder={PLACEHOLDER}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
          />
          <div className="z-card-controls">
            <div className="z-selectors">
              <GlassSelect
                icon={<PersonIcon />}
                value={category}
                options={CATEGORY_OPTIONS}
                onChange={setCategory}
                ariaLabel="Service category"
              />
              <GlassSelect
                icon={<GlobeIcon />}
                value={lang}
                options={languageOptions}
                onChange={(v) => setLang(v as LanguageCode)}
                ariaLabel="Language"
              />
              <GlassSelect
                icon={<BriefcaseIcon />}
                value={serviceStyle}
                options={STYLE_OPTIONS}
                onChange={setServiceStyle}
                ariaLabel="Service style"
              />
              <GlassSelect
                icon={<RefreshIcon />}
                value={urgency}
                options={URGENCY_OPTIONS}
                onChange={setUrgency}
                ariaLabel="Urgency"
              />
              <button
                type="button"
                className={`z-selector z-mic-btn${recording ? " recording" : ""}`}
                onClick={handleRecord}
                disabled={recording}
              >
                <MicIcon />
                {voicePhase === "listening"
                  ? "Listening…"
                  : voicePhase === "transcribing"
                    ? "Transcribing…"
                    : "Voice"}
              </button>
            </div>

            <button
              type="button"
              className="z-btn z-btn-primary"
              onClick={handleSubmit}
              disabled={loading || recording}
            >
              {loading ? "Analyzing…" : "Find providers"}
              {!loading && (
                <span className="z-btn-arrow" aria-hidden="true">
                  <svg viewBox="0 0 12 12" strokeWidth="2">
                    <path d="M6 9V3M6 3L3 6M6 3L9 6" />
                  </svg>
                </span>
              )}
            </button>
          </div>
        </div>
        <p className="z-microcopy">
          No payment required · 200+ providers · 40+ neighborhoods · {label}
        </p>
      </section>
      {error && <div className="z-error">{error}</div>}
      {recording && (
        <VoiceListening
          phase={voicePhase === "listening" ? "listening" : "transcribing"}
          stream={micStream}
          elapsedSeconds={elapsedSeconds}
          onStop={() => stopRecordingRef.current?.()}
        />
      )}
    </>
  );
}
