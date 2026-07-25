import { Navigate, Route, Routes } from "react-router-dom";
import { AuthCallbackPage, RequireOnboarding } from "./auth";
import { PricingPage, ProductPage, ProvidersPage, UseCasesPage } from "./pages/marketing";
import { OnboardingPage } from "./pages/onboarding";
import { PaymentPage } from "./pages/payment";
import { DiscoveryPage } from "./pages/discovery";
import { TrackingPage } from "./pages/tracking";
import { ReviewsPage } from "./pages/reviews";

/**
 * Route registry only. One line per page folder — see .cursorrules.
 *
 * Onboarding, the OAuth return, and the marketing pages are the public routes;
 * everything else sits under RequireOnboarding, which sends anyone who has not
 * finished signing up back to /onboarding.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/product" element={<ProductPage />} />
      <Route path="/providers" element={<ProvidersPage />} />
      <Route path="/use-cases" element={<UseCasesPage />} />
      <Route path="/pricing" element={<PricingPage />} />

      <Route element={<RequireOnboarding />}>
        <Route path="/" element={<Navigate to="/discovery" replace />} />
        <Route path="/payment" element={<PaymentPage />} />
        <Route path="/discovery" element={<DiscoveryPage />} />
        <Route path="/tracking" element={<TrackingPage />} />
        <Route path="/reviews" element={<ReviewsPage />} />
      </Route>
    </Routes>
  );
}
