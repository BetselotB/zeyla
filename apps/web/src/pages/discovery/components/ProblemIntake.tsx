import { useState } from "react";
import { useLanguage, languageLabels } from "../lib/language.js";
import type { LanguageCode } from "../lib/types.js";
import { classify, createRequest, transcribe } from "../lib/api.js";
import type { Classification } from "../lib/types.js";
import { ClassificationCard } from "./ClassificationCard.js";
import { GlassSelect } from "./GlassSelect.js";

const PLACEHOLDER =
  "Welcome to Zeyla. Turn your problem into a matched provider in seconds…";

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
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classification, setClassification] = useState<Classification | null>(null);

  const languageOptions = (Object.keys(languageLabels) as LanguageCode[]).map(
    (code) => ({ value: code, label: languageLabels[code] }),
  );

  async function handleRecord() {
    setError(null);
    setRecording(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.start();
      await new Promise((r) => setTimeout(r, 6000));
      recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
      await new Promise((r) => {
        recorder.onstop = r;
      });
      const blob = new Blob(chunks, { type: "audio/webm" });
      const transcription = await transcribe(blob, lang);
      setText(transcription);
    } catch {
      setError("Microphone access failed. Type your problem instead.");
    } finally {
      setRecording(false);
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
                {recording ? "Recording…" : "Voice"}
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
    </>
  );
}
