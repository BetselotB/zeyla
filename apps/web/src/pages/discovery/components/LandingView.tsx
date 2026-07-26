import { useState } from "react";
import type { ServiceRequestDto } from "../lib/types.js";
import { DiscoveryNav, TrustStrip } from "./DiscoveryNav.js";
import { LanguageSelect } from "./LanguageSelect.js";
import { LiveAvailability } from "./LiveAvailability.js";
import { ProblemIntake } from "./ProblemIntake.js";
import { ProviderResults } from "./ProviderResults.js";

function hasStoredLanguage() {
  const stored = localStorage.getItem("zeyla_lang");
  return stored === "en" || stored === "am" || stored === "om";
}

export function LandingView() {
  const [showLang, setShowLang] = useState(!hasStoredLanguage());
  const [request, setRequest] = useState<ServiceRequestDto | null>(null);

  return (
    <div className="z-page z-page-enter-stagger">
      {showLang && <LanguageSelect onComplete={() => setShowLang(false)} />}
      <DiscoveryNav />

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
          nearby providers by trust score, and connects you in real time. Fast,
          transparent, and built for Addis Ababa.
        </p>
        {!request && <LiveAvailability />}
      </section>

      {!request ? (
        <ProblemIntake onResults={(created) => setRequest(created)} />
      ) : (
        <ProviderResults request={request} />
      )}

      {!request && <TrustStrip />}
    </div>
  );
}
