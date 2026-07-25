import { Navigate, Route, Routes } from "react-router-dom";
import { OnboardingPage } from "./pages/onboarding";
import { PaymentPage } from "./pages/payment";
import { DiscoveryPage } from "./pages/discovery";
import { TrackingPage } from "./pages/tracking";
import { ReviewsPage } from "./pages/reviews";

/**
 * Route registry only. One line per page folder — see .cursorrules.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/discovery" replace />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/payment" element={<PaymentPage />} />
      <Route path="/discovery" element={<DiscoveryPage />} />
      <Route path="/tracking" element={<TrackingPage />} />
      <Route path="/reviews" element={<ReviewsPage />} />
    </Routes>
  );
}
