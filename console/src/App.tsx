import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Shell from "./components/Shell";

// Page imports — stub placeholders until each view is built
import StreamPage from "./pages/Stream";
import GraphPage from "./pages/Graph";
import TimelinePage from "./pages/Timeline";
import ReplayPage from "./pages/Replay";
import SettingsPage from "./pages/Settings";

// ─── Auth guard ───────────────────────────────────────────────────────────────

function isAuthed(): boolean {
  return sessionStorage.getItem("kprobe_authed") === "1";
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [authed, setAuthed] = useState<boolean>(isAuthed);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Apply theme to <html> so CSS variables take effect globally
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function handleAuth() {
    sessionStorage.setItem("kprobe_authed", "1");
    setAuthed(true);
  }

  function handleLogout() {
    sessionStorage.removeItem("kprobe_authed");
    setAuthed(false);
  }

  function handleThemeToggle() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  if (!authed) {
    return <Login onAuth={handleAuth} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/stream" replace />} />

        {/* Authenticated shell */}
        <Route
          element={
            <Shell
              onLogout={handleLogout}
              theme={theme}
              onThemeToggle={handleThemeToggle}
            />
          }
        >
          <Route path="/stream" element={<StreamPage />} />
          <Route path="/graph" element={<GraphPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/replay" element={<ReplayPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/stream" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
