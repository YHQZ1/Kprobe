import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { useConnection } from "../hooks/useConnection";

interface ShellProps {
  children: React.ReactNode;
  onLogout: () => void;
  theme: "dark" | "light";
  onThemeToggle: () => void;
}

const VIEW_META: Record<string, { title: string; description: string }> = {
  "/stream": {
    title: "Live Stream",
    description: "real-time kernel event feed",
  },
  "/graph": {
    title: "Causal Graph",
    description: "cause-effect chain explorer",
  },
  "/timeline": {
    title: "Timeline",
    description: "nanosecond-precision event timeline",
  },
  "/replay": { title: "Replay", description: "deterministic incident replay" },
  "/settings": { title: "Settings", description: "configuration" },
};

// Keys that should never trigger navigation shortcuts
function isTypingTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable
  );
}

export default function Shell({
  children,
  onLogout,
  theme,
  onThemeToggle,
}: ShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { status } = useConnection();

  const meta = VIEW_META[location.pathname] ?? {
    title: "kprobe",
    description: "",
  };

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Never fire when the user is typing in an input
      if (isTypingTarget(e.target)) return;

      const key = e.key.toUpperCase();
      const meta = e.metaKey || e.ctrlKey;

      // ⌘K — search (placeholder: focus a future search input)
      if (meta && key === "K") {
        e.preventDefault();
        // TODO: open search modal when built
        return;
      }

      // ⌘Shift C — clear current view
      if (meta && e.shiftKey && key === "C") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("kprobe:clear-view"));
        return;
      }

      // Single-key navigation — only fire when no modifier held
      if (meta || e.altKey || e.shiftKey) return;

      switch (key) {
        case "G":
          navigate("/graph");
          break;
        case "S":
          navigate("/stream");
          break;
        case "T":
          navigate("/timeline");
          break;
        case "R":
          navigate("/replay");
          break;
        case "ESCAPE":
          // Dispatch a custom event so individual pages can handle deselection
          window.dispatchEvent(new CustomEvent("kprobe:escape"));
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  return (
    <div style={s.root}>
      <Sidebar />
      <div style={s.main}>
        <Topbar
          title={meta.title}
          description={meta.description}
          status={status}
          onLogout={onLogout}
          theme={theme}
          onThemeToggle={onThemeToggle}
        />
        <main style={s.content} className="animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    height: "100vh",
    width: "100%",
    overflow: "hidden",
    backgroundColor: "var(--bg)",
  },
  main: {
    marginLeft: "var(--sidebar-width)",
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    height: "100vh",
    overflow: "hidden",
  },
  content: {
    flex: 1,
    overflowY: "auto" as const,
    overflowX: "hidden" as const,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
};
