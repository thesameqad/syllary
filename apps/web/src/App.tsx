import { Route, Routes } from "react-router-dom";
import { LandingPage } from "@/components/landing/landing-page";
import { ResultPage } from "@/pages/result-page";
import { SignInPage, SignUpPage } from "@/pages/auth-pages";
import { AccountPage } from "@/pages/account-page";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/s/:songId" element={<ResultPage />} />
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />
      <Route path="/account" element={<AccountPage />} />
    </Routes>
  );
}
