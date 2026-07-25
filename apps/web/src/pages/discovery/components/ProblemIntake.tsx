import { useCallback, useRef, useState } from "react";
import { SERVICE_CATEGORIES, URGENCY_LEVELS } from "@zeyla/shared";
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
import { VoiceListening, prefetchVoiceBlob } from "./VoiceListening.js";

const PLACEHOLDER =
  "Describe your problem — speak or type in Amharic, Afaan Oromo, or English…";

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

/**
 * Safety net only — the listening overlay tells people to take as long as they
 * need, and recording normally ends when they tap stop.
 */
const MAX_RECORDING_MS = 300_000;

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
  const [urgency, setUrgency] = useState("auto");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  /** Classifying straight off a recording, with the voice overlay still up. */
  const [understanding, setUnderstanding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parse, setParse] = useState<VoiceParseResult | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  /** Feeds the listening overlay: the blob reacts to this stream's amplitude. */
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  // Stable so the overlay's Escape listener is not torn down every render.
  const stopRecording = useCallback(() => stopRef.current?.(), []);

  const languageOptions = (Object.keys(languageLabels) as LanguageCode[]).map(
    (code) => ({ value: code, label: languageLabels[code] }),
  );

  /**
   * Runs the transcript past the classifier and moves to the summary. Any
   * category or urgency the customer picked by hand overrules the model.
   */
  async function classifyInto(transcript: string) {
    const result = await classify(transcript, lang);
    setParse({
      ...result,
      category: category === "any" ? result.category : (category as typeof result.category),
      urgency: urgency === "auto" ? result.urgency : (urgency as typeof result.urgency),
    });
  }

  /**
   * Records until the customer taps stop, or MAX_RECORDING_MS, then sends the
   * clip to Addis AI. A fixed-length recording cut people off mid-sentence.
   *
   * Speaking goes straight through to the summary rather than dropping the
   * transcript into the textarea: someone who just described a burst pipe out
   * loud does not want to be handed their own words back to proofread. The
   * summary shows what was heard and has an edit button for the cases where it
   * got it wrong.
   */
  async function handleRecord() {
    if (recording) {
      stopRef.current?.();
      return;
    }

    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access was refused. Type your problem instead.");
      return;
    }

    setRecording(true);
    setMicStream(stream);
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

      // Release the mic the moment the clip is captured. Leaving the browser's
      // recording indicator lit through transcription reads as still listening.
      stream.getTracks().forEach((t) => t.stop());
      setMicStream(null);

      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (blob.size === 0) {
        setError("The recording was empty. Try again.");
        return;
      }

      setTranscribing(true);
      const transcription = await transcribe(blob, lang);
      // Append rather than replace, so a second take adds to the first.
      const nextText = text.trim()
        ? `${text.trim()} ${transcription.transcript}`
        : transcription.transcript;
      setText(nextText);

      setTranscribing(false);
      setUnderstanding(true);
      await classifyInto(nextText);
    } catch (err) {
      // Falls back to the textarea holding the transcript, so a failed classify
      // costs the customer a tap rather than the whole recording.
      setError(readableError(err));
    } finally {
      stream.getTracks().forEach((t) => t.stop());
      stopRef.current = null;
      setMicStream(null);
      setRecording(false);
      setTranscribing(false);
      setUnderstanding(false);
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
      await classifyInto(text.trim());
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

  const busy = recording || transcribing || understanding;

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
            disabled={busy}
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
                onPointerEnter={prefetchVoiceBlob}
                onFocus={prefetchVoiceBlob}
                disabled={transcribing || understanding}
              >
                <MicIcon />
                {recording ? "Stop" : transcribing ? "Transcribing…" : "Voice"}
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
      {busy && (
        <VoiceListening
          phase={recording ? "listening" : transcribing ? "transcribing" : "understanding"}
          stream={micStream}
          onStop={stopRecording}
        />
      )}
    </>
  );
}
