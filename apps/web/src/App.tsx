import { Route, Routes } from "react-router-dom";
import { AppNav, StatusPanel } from "./components";
import { OnboardingPage } from "./pages/onboarding";
import { PaymentPage } from "./pages/payment";
import { DiscoveryPage } from "./pages/discovery";
import { TrackingPage } from "./pages/tracking";
import { ReviewsPage } from "./pages/reviews";
import "./App.css";

/**
 * Route registry only. One line per page folder — see .cursorrules.
 * Put feature UI inside your own pages/ folder, not here.
 */
export default function App() {
  return (
    <main className="shell">
      <header className="brand">
        <p className="mark">Zeyla</p>
        <h1>Trusted local services</h1>
        <p className="lede">
          Hackathon starter — escrow + trust score first. Everything else can be
          simulated for the demo.
        </p>
      </header>

      <AppNav />

      <Routes>
        <Route path="/" element={<StatusPanel />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/payment" element={<PaymentPage />} />
        <Route path="/discovery" element={<DiscoveryPage />} />
        <Route path="/tracking" element={<TrackingPage />} />
        <Route path="/reviews" element={<ReviewsPage />} />
      </Routes>
    </main>
  );
}
