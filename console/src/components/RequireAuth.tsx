import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import Login from "../pages/Login";
import Shell from "./Shell";
import { ConnectionProvider } from "../hooks/useConnection";

interface RequireAuthProps {
  authed: boolean;
  onAuth: () => void;
  onLogout: () => void;
  theme: "dark" | "light";
  onThemeToggle: () => void;
}

function PageLoader() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        fontFamily: "var(--font-mono)",
        fontSize: "0.7rem",
        color: "var(--text-muted)",
        opacity: 0.5,
      }}
    >
      loading...
    </div>
  );
}

export default function RequireAuth({
  authed,
  onAuth,
  onLogout,
  theme,
  onThemeToggle,
}: RequireAuthProps) {
  if (!authed) {
    return <Login onAuth={onAuth} />;
  }

  return (
    <ConnectionProvider>
      <Shell onLogout={onLogout} theme={theme} onThemeToggle={onThemeToggle}>
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </Shell>
    </ConnectionProvider>
  );
}
