<<<<<<< HEAD
import { useEffect, useRef, useState } from "react";
=======
import { useRef, useState } from "react";
import { SERVICE_CATEGORIES, URGENCY_LEVELS } from "@zeyla/shared";
>>>>>>> de7c95f4db5ce5cdc6f605b6193a72b07174a562
import { useLanguage, languageLabels } from "../lib/language.js";
import { classify, createRequest, transcribe } from "../lib/api.js";
import { getCoords } from "../lib/geo.js";
import type {
  LanguageCode,
  ServiceRequestDto,
  VoiceParseResult,
} from "../lib/types.js";
import { ClassificationCard } from "./ClassificationCard.js";
import { GlassSelect } from "./GlassSelect.js";
import { VoiceListening } from "./VoiceListening.js";

const PLACEHOLDER =
  "Describe your problem — speak or type in Amharic, Afaan Oromo, or English…";

/** Safety net only — recording normally ends when the user taps stop. */
const MAX_RECORD_SECONDS = 300;

interface ProblemIntakeProps {
  onResults: (request: ServiceRequestDto, parse: VoiceParseResult) => void;
}

function GlobeIcon() {
  return (
    <svg className="z-selector-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c2 2.5 2 9.5 0 12M8 2c-2 2.5-2 9.5 0 12" />
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

/** "any" lets the pipeline decide; anything else overrules it. */
const CATEGORY_OPTIONS = [
  { value: "any", label: "Detect service" },
  ...SERVICE_CATEGORIES.filter((c) => c !== "other").map((c) => ({
    value: c,
    label: c.replace(/_/g, " ").replace(/^./, (ch) => ch.toUpperCase()),
  })),
];

const URGENCY_OPTIONS = [
  { value: "auto", label: "Detect urgency" },
  ...URGENCY_LEVELS.map((u) => ({
    value: u,
    label: u.replace(/^./, (ch) => ch.toUpperCase()),
  })),
];

/** Long enough for a sentence, short enough that nobody wonders if it hung. */
const MAX_RECORDING_MS = 10_000;

function readableError(err: unknown): string {
  const code = err instanceof Error ? err.message : String(err);
  switch (code) {
    case "login_required":
      return "Please sign in before sending a request.";
    case "addis_ai_not_configured":
      return "Voice is not configured on the server. Type your problem instead.";
    case "addis_stt_timeout":
    case "addis_stt_unreachable":
      return "The transcription service did not answer. Type your problem instead.";
    case "addis_stt_empty_transcript":
      return "We could not hear anything. Try recording again, closer to the mic.";
    case "matching_provider_not_found":
      return "No providers are available near you right now.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export function ProblemIntake({ onResults }: ProblemIntakeProps) {
  const { lang, setLang, label } = useLanguage();
  const [text, setText] = useState("");
  const [category, setCategory] = useState("any");
<<<<<<< HEAD
  const [serviceStyle, setServiceStyle] = useState("professional");
  const [urgency, setUrgency] = useState("medium");
  const [voicePhase, setVoicePhase] = useState<
    "idle" | "listening" | "transcribing"
  >("idle");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
=======
  const [urgency, setUrgency] = useState("auto");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
>>>>>>> de7c95f4db5ce5cdc6f605b6193a72b07174a562
  const [loading, setLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parse, setParse] = useState<VoiceParseResult | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const stopRecordingRef = useRef<(() => void) | null>(null);
  const recording = voicePhase !== "idle";

  const languageOptions = (Object.keys(languageLabels) as LanguageCode[]).map(
    (code) => ({ value: code, label: languageLabels[code] }),
  );

<<<<<<< HEAD
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

=======
  /**
   * Records until the customer taps stop, or MAX_RECORDING_MS, then sends the
   * clip to Addis AI. A fixed-length recording cut people off mid-sentence.
   */
>>>>>>> de7c95f4db5ce5cdc6f605b6193a72b07174a562
  async function handleRecord() {
    if (recording) {
      stopRef.current?.();
      return;
    }

    setError(null);
<<<<<<< HEAD

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
=======
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access was refused. Type your problem instead.");
      return;
    }

    setRecording(true);
    try {
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const finished = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      recorder.start();
      const timeout = setTimeout(() => recorder.stop(), MAX_RECORDING_MS);
      stopRef.current = () => {
        clearTimeout(timeout);
        if (recorder.state === "recording") recorder.stop();
      };

      await finished;
      clearTimeout(timeout);
      setRecording(false);

      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (blob.size === 0) {
        setError("The recording was empty. Try again.");
        return;
      }

      setTranscribing(true);
      const transcription = await transcribe(blob, lang);
      // Append rather than replace, so a second take adds to the first.
      setText((prev) =>
        prev.trim() ? `${prev.trim()} ${transcription.transcript}` : transcription.transcript,
      );
    } catch (err) {
      setError(readableError(err));
    } finally {
      stream.getTracks().forEach((t) => t.stop());
      stopRef.current = null;
      setRecording(false);
      setTranscribing(false);
>>>>>>> de7c95f4db5ce5cdc6f605b6193a72b07174a562
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
      const result = await classify(text.trim(), lang);
      setParse({
        ...result,
        category: category === "any" ? result.category : (category as typeof result.category),
        urgency: urgency === "auto" ? result.urgency : (urgency as typeof result.urgency),
      });
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!parse) return;
    setConfirmLoading(true);
    setError(null);
    try {
      // Device GPS decides where providers are searched. The neighbourhood the
      // customer said is only ever a label on the request.
      const coords = await getCoords();
      const { request, parse: stored } = await createRequest({
        transcript: text.trim(),
        language: lang,
        lat: coords.lat,
        lng: coords.lng,
        // Only send an override the customer actually picked. Echoing the
        // model's own answer back would mark it human-confirmed and skip the
        // confirm step on the next weak parse.
        ...(category === "any" ? {} : { category: category as typeof parse.category }),
        ...(urgency === "auto" ? {} : { urgency: urgency as typeof parse.urgency }),
      });
      onResults(request, stored);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setConfirmLoading(false);
    }
  }

  if (parse) {
    return (
      <>
        {error && <div className="z-error">{error}</div>}
        <ClassificationCard
          parse={parse}
          transcript={text.trim()}
          onEdit={() => setParse(null)}
          onConfirm={handleConfirm}
          loading={confirmLoading}
        />
      </>
    );
  }

  const busy = recording || transcribing;

  return (
    <>
      <section className="z-glass-card">
        <div className="z-glass-inner">
          <textarea
            className="z-textarea"
            placeholder={transcribing ? "Transcribing your recording…" : PLACEHOLDER}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            disabled={transcribing}
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
                disabled={transcribing}
              >
                <MicIcon />
<<<<<<< HEAD
                {voicePhase === "listening"
                  ? "Listening…"
                  : voicePhase === "transcribing"
                    ? "Transcribing…"
                    : "Voice"}
=======
                {recording ? "Stop" : transcribing ? "Transcribing…" : "Voice"}
>>>>>>> de7c95f4db5ce5cdc6f605b6193a72b07174a562
              </button>
            </div>

            <button
              type="button"
              className="z-btn z-btn-primary"
              onClick={handleSubmit}
              disabled={loading || busy}
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
          {recording
            ? "Listening — tap stop when you are done"
            : `Speak Amharic or Afaan Oromo · No payment required · ${label}`}
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
