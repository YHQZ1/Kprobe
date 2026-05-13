import { useState, useEffect, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import RequireAuth from "./components/RequireAuth";
import { isAuthenticated, clearToken } from "./lib/auth"; // <-- Updated imports

const StreamPage = lazy(() => import("./pages/Stream"));
const GraphPage = lazy(() => import("./pages/Graph"));
const TimelinePage = lazy(() => import("./pages/Timeline"));
const ReplayPage = lazy(() => import("./pages/Replay"));
const SettingsPage = lazy(() => import("./pages/Settings"));

export default function App() {
  // Use the new isAuthenticated() function from auth.ts
  const [authed, setAuthed] = useState(() => isAuthenticated());
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function handleAuth() {
    setAuthed(true);
  }

  function handleLogout() {
    clearToken(); // <-- Clear the JWT from memory
    setAuthed(false);
  }

  function handleThemeToggle() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={
            <RequireAuth
              authed={authed}
              onAuth={handleAuth}
              onLogout={handleLogout}
              theme={theme}
              onThemeToggle={handleThemeToggle}
            />
          }
        >
          <Route path="/" element={<Navigate to="/stream" replace />} />
          <Route path="/stream" element={<StreamPage />} />
          <Route path="/graph" element={<GraphPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/replay" element={<ReplayPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/stream" replace />} />
      </Routes>
    </BrowserRouter>
  );
}