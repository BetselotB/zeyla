import { LanguageProvider } from "./lib/language.js";
import { AnimatedMeshBg } from "./components/AnimatedMeshBg.js";
import { LandingView } from "./components/LandingView.js";
import "./discovery.css";

export function DiscoveryPage() {
  return (
    <div className="discovery-root">
      <AnimatedMeshBg />
      <LanguageProvider>
        <LandingView />
      </LanguageProvider>
    </div>
  );
}
