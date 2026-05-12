import { useState, useEffect, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import RequireAuth from "./components/RequireAuth";
import { getAuth, setAuth } from "./lib/auth";

const StreamPage = lazy(() => import("./pages/Stream"));
const GraphPage = lazy(() => import("./pages/Graph"));
const TimelinePage = lazy(() => import("./pages/Timeline"));
const ReplayPage = lazy(() => import("./pages/Replay"));
const SettingsPage = lazy(() => import("./pages/Settings"));

export default function App() {
  const [authed, setAuthed] = useState(() => getAuth());
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function handleAuth() {
    setAuth(true);
    setAuthed(true);
  }

  function handleLogout() {
    setAuth(false);
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
