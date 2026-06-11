import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { LandingPage } from "@/components/landing/landing-page";
import { ResultPage } from "@/pages/result-page";
import { PublicPage } from "@/pages/public-page";
import { EmbedPage } from "@/pages/embed-page";
import { SeoLandingPage } from "@/pages/seo-landing-page";
import { SignInPage, SignUpPage } from "@/pages/auth-pages";
import { AccountPage } from "@/pages/account-page";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { DashboardPage } from "@/pages/dashboard-page";
import { UploadPage } from "@/pages/upload-page";
import { RecentPage } from "@/pages/recent-page";
import { LibraryPage } from "@/pages/library-page";
import { UpgradePage } from "@/pages/upgrade-page";
import { LandingListPage } from "@/pages/admin/landing-list";
import { LandingEditPage } from "@/pages/admin/landing-edit";
import { TermsPage } from "@/pages/static/terms-page";
import { PrivacyPage } from "@/pages/static/privacy-page";
import { RefundPage } from "@/pages/static/refund-page";
import { FaqPage } from "@/pages/static/faq-page";
import { ContactPage } from "@/pages/static/contact-page";
import { UnsubscribePage } from "@/pages/static/unsubscribe-page";
import { authConfigured } from "@/lib/auth";
import { trackVisit } from "@/lib/api";
import { ToastProvider } from "@/components/ui/toast";

// Signed-in users get the dashboard at "/"; signed-out (or unconfigured) see the
// landing. Render the landing while Clerk loads so marketing visitors get no flash.
function HomeAuthed() {
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && isSignedIn) return <Navigate to="/dashboard" replace />;
  return <LandingPage />;
}

function Home() {
  return authConfigured ? <HomeAuthed /> : <LandingPage />;
}

export function App() {
  // Funnel "visited" ping, once per load (deduped per day server-side).
  useEffect(() => {
    void trackVisit();
  }, []);

  return (
    <ToastProvider>
      <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/s/:songId" element={<ResultPage />} />
      <Route path="/p/:songId" element={<PublicPage />} />
      <Route path="/embed/:songId" element={<EmbedPage />} />
      {/* Programmatic SEO landing pages — section-prefixed slugs (splat supports
          multi-segment slugs). Kept after the app routes so static paths win. */}
      <Route path="/convert/*" element={<SeoLandingPage />} />
      <Route path="/tools/*" element={<SeoLandingPage />} />
      <Route path="/compare/*" element={<SeoLandingPage />} />
      <Route path="/guides/*" element={<SeoLandingPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/refunds" element={<RefundPage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/unsubscribe" element={<UnsubscribePage />} />
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route element={<DashboardLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/recent" element={<RecentPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/upgrade" element={<UpgradePage />} />
        <Route path="/admin/landing" element={<LandingListPage />} />
        <Route path="/admin/landing/new" element={<LandingEditPage />} />
        <Route path="/admin/landing/:id" element={<LandingEditPage />} />
      </Route>
      </Routes>
    </ToastProvider>
  );
}
