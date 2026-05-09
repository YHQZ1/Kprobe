import { useState, useEffect, useRef } from "react";
import {
  Search,
  X,
  FileText,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
} from "lucide-react";

const pages = [
  {
    title: "Getting Started",
    href: "/docs",
    section: "Docs",
    description: "Install and run kprobe in under 5 minutes",
  },
  {
    title: "Installation",
    href: "/docs/installation",
    section: "Docs",
    description: "Prerequisites, Helm install, Docker Compose",
  },
  {
    title: "Quickstart",
    href: "/docs/quickstart",
    section: "Docs",
    description: "Run your first causal trace",
  },
  {
    title: "How It Works",
    href: "/docs/how-it-works",
    section: "Docs",
    description: "The Recorder, Causal Engine, and Replay Engine",
  },
  {
    title: "Architecture",
    href: "/docs/architecture",
    section: "Docs",
    description: "Full system design and data pipeline",
  },
  {
    title: "Configuration",
    href: "/docs/configuration",
    section: "Docs",
    description: "Kafka topics, ClickHouse schema, probe tuning",
  },
  {
    title: "Causal Graph View",
    href: "/docs/dashboard/causal-graph",
    section: "Dashboard",
    description: "Reading and navigating the causal graph",
  },
  {
    title: "Timeline View",
    href: "/docs/dashboard/timeline",
    section: "Dashboard",
    description: "Nanosecond precision event timeline",
  },
  {
    title: "Replay Panel",
    href: "/docs/dashboard/replay",
    section: "Dashboard",
    description: "Replaying incidents deterministically",
  },
  {
    title: "API Overview",
    href: "/docs/api/overview",
    section: "API",
    description: "gRPC endpoints and WebSocket streaming",
  },
  {
    title: "API Reference",
    href: "/docs/api/reference",
    section: "API",
    description: "Full protobuf definitions and examples",
  },
  {
    title: "Security",
    href: "/docs/security",
    section: "Docs",
    description: "Privilege model, data storage, network exposure",
  },
  {
    title: "FAQ",
    href: "/docs/faq",
    section: "Docs",
    description: "Common questions and kernel requirements",
  },
  {
    title: "Compare",
    href: "/compare",
    section: "Pages",
    description: "kprobe vs Datadog, Jaeger, OpenTelemetry",
  },
  {
    title: "About",
    href: "/about",
    section: "Pages",
    description: "Design philosophy and what kprobe is built on",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SearchModal({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered =
    query.trim() === ""
      ? pages
      : pages.filter(
          (p) =>
            p.title.toLowerCase().includes(query.toLowerCase()) ||
            p.description.toLowerCase().includes(query.toLowerCase()) ||
            p.section.toLowerCase().includes(query.toLowerCase()),
        );

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setSelected(0);
    }
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selected]) {
          window.location.href = filtered[selected].href;
        }
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, selected, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-input-row">
          <Search size={16} className="search-icon" />
          <input
            ref={inputRef}
            className="modal-input"
            placeholder="Search docs, guides, API..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <div className="modal-results" ref={listRef}>
          {filtered.length === 0 && (
            <div className="no-results">No results for "{query}"</div>
          )}
          {filtered.map((item, i) => (
            <a
              key={item.href}
              href={item.href}
              className={`result-item ${i === selected ? "result-selected" : ""}`}
              onMouseEnter={() => setSelected(i)}
              onClick={onClose}
            >
              <FileText size={14} className="result-icon" />
              <div className="result-text">
                <div className="result-title">{item.title}</div>
                <div className="result-desc">{item.description}</div>
              </div>
              <span className="result-section">{item.section}</span>
              {i === selected && (
                <ChevronRight size={14} className="result-arrow" />
              )}
            </a>
          ))}
        </div>

        <div className="modal-footer">
          <span className="hint">
            <ArrowUp size={11} />
            <ArrowDown size={11} /> navigate
          </span>
          <span className="hint">
            <CornerDownLeft size={11} /> open
          </span>
          <span className="hint">esc close</span>
        </div>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 200;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 120px;
        }

        .modal {
          width: 100%;
          max-width: 560px;
          background: var(--bg-subtle);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
        }

        .modal-input-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.875rem 1rem;
          border-bottom: 1px solid var(--border-subtle);
        }

        .search-icon {
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .modal-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          font-family: var(--font);
          font-size: 0.9rem;
          font-weight: 400;
          color: var(--text-primary);
          caret-color: var(--accent);
        }

        .modal-input::placeholder {
          color: var(--text-muted);
        }

        .close-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: var(--bg-elevated);
          color: var(--text-muted);
          cursor: pointer;
          flex-shrink: 0;
        }

        .close-btn:hover {
          color: var(--text-primary);
        }

        .modal-results {
          max-height: 360px;
          overflow-y: auto;
          padding: 0.375rem;
        }

        .no-results {
          padding: 2rem;
          text-align: center;
          color: var(--text-muted);
          font-size: 0.875rem;
        }

        .result-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.625rem 0.75rem;
          border-radius: var(--radius-sm);
          text-decoration: none;
          cursor: pointer;
        }

        .result-selected {
          background: var(--bg-elevated);
        }

        .result-icon {
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .result-selected .result-icon {
          color: var(--accent);
        }

        .result-text {
          flex: 1;
          min-width: 0;
        }

        .result-title {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .result-selected .result-title {
          color: var(--accent);
        }

        .result-desc {
          font-size: 0.775rem;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 0.1rem;
        }

        .result-section {
          font-size: 0.7rem;
          font-weight: 500;
          color: var(--text-muted);
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 0.15em 0.5em;
          flex-shrink: 0;
          letter-spacing: 0.03em;
        }

        .result-arrow {
          color: var(--accent);
          flex-shrink: 0;
        }

        .modal-footer {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          padding: 0.625rem 1rem;
          border-top: 1px solid var(--border-subtle);
        }

        .hint {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.72rem;
          color: var(--text-muted);
          letter-spacing: 0.02em;
        }
      `}</style>
    </div>
  );
}
