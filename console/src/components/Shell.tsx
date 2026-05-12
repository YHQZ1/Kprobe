import { useLocation } from "react-router-dom";
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

export default function Shell({
  children,
  onLogout,
  theme,
  onThemeToggle,
}: ShellProps) {
  const location = useLocation();
  const { status } = useConnection();

  const meta = VIEW_META[location.pathname] ?? {
    title: "kprobe",
    description: "",
  };

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
