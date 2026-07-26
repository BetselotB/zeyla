import { useState } from "react";
import { AppNav } from "../../../components/AppNav.js";
import { ActiveJobBanner } from "../../../jobs/ActiveJobBanner.js";
import { useActiveJob } from "../../../jobs/useActiveJob.js";
import type { ServiceRequestDto } from "../lib/types.js";
import { TrustStrip } from "./DiscoveryNav.js";
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
  const { activeJob, isLoading, isCancelling, error, cancel, href, refresh } =
    useActiveJob();

  // A request created in this session takes precedence over the gate: the
  // customer is mid-flow, picking a provider for the very job the gate would
  // otherwise be telling them about.
  const isGated = !request && !isLoading && activeJob !== null && href !== null;
  const isIntakeOpen = !request && !isGated;

  return (
    <div className="z-page z-page-enter-stagger">
      {showLang && <LanguageSelect onComplete={() => setShowLang(false)} />}
      <AppNav />

      <section className="z-hero">
        <div className="z-badges">
          <span className="z-badge z-badge-dark">AI Service Matching</span>
          <span className="z-badge z-badge-light">Addis AI ›</span>
        </div>
        <h1>
          {isGated ? (
            <>
              You have a job
              <br />
              on the go.
            </>
          ) : (
            <>
              Find Trusted Local
              <br />
              Services in Seconds.
            </>
          )}
        </h1>
        <p>
          {isGated
            ? "Zeyla keeps you to one job at a time so your provider and your escrow never get crossed. Finish this one — or cancel it — and you can book again straight away."
            : "Describe your problem in text or voice — Zeyla classifies it, ranks nearby providers by trust score, and connects you in real time. Fast, transparent, and built for Addis Ababa."}
        </p>
        {isIntakeOpen && <LiveAvailability />}
      </section>

      {request ? (
        <ProviderResults request={request} />
      ) : isGated ? (
        <ActiveJobBanner
          job={activeJob!}
          href={href!}
          isCancelling={isCancelling}
          error={error}
          onCancel={() => void cancel()}
        />
      ) : (
        <ProblemIntake
          onResults={(created) => {
            setRequest(created);
            // The new request is now the active one; keep the nav pill honest.
            refresh();
          }}
        />
      )}

      {isIntakeOpen && <TrustStrip />}
    </div>
  );
}
