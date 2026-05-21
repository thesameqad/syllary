import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { dark } from "@clerk/themes";
import { App } from "./App";
import { setTokenGetter } from "@/lib/api";
import { clerkPublishableKey } from "@/lib/auth";

function TokenBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setTokenGetter(() => getToken());
    return () => setTokenGetter(null);
  }, [getToken]);
  return null;
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

const tree = (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

const appearance = {
  baseTheme: dark,
  variables: {
    colorPrimary: "#FF2D2D",
    colorBackground: "#0f0f0f",
    colorInputBackground: "#161616",
    borderRadius: "0.75rem",
  },
};

createRoot(rootElement).render(
  <StrictMode>
    {clerkPublishableKey ? (
      <ClerkProvider
        publishableKey={clerkPublishableKey}
        appearance={appearance}
        afterSignOutUrl="/"
      >
        <TokenBridge />
        {tree}
      </ClerkProvider>
    ) : (
      tree
    )}
  </StrictMode>,
);
