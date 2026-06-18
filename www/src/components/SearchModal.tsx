import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  X,
  FileText,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
} from "lucide-react";

interface SearchEntry {
  title: string;
  href: string;
  section: string;
  description: string;
}

const fallbackPages: SearchEntry[] = [
  {
    title: "Overview",
    href: "/docs",
    section: "Start Here",
    description: "kprobe documentation overview",
  },
  {
    title: "Installation Overview",
    href: "/docs/installation",
    section: "Install",
    description: "Choose the right kprobe installation path",
  },
  {
    title: "Architecture at a Glance",
    href: "/docs/architecture",
    section: "Start Here",
    description: "The high-level architecture of kprobe",
  },
];

function score(entry: SearchEntry, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return 1;

  const title = entry.title.toLowerCase();
  const section = entry.section.toLowerCase();
  const description = entry.description.toLowerCase();
  const href = entry.href.toLowerCase();

  let value = 0;
  if (title === q) value += 100;
  if (title.startsWith(q)) value += 60;
  if (title.includes(q)) value += 40;
  if (section.includes(q)) value += 20;
  if (description.includes(q)) value += 12;
  if (href.includes(q)) value += 6;

  for (const part of q.split(/\s+/)) {
    if (part.length < 2) continue;
    if (title.includes(part)) value += 10;
    if (description.includes(part)) value += 4;
  }

  return value;
}

export default function SearchModal() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [pages, setPages] = useState<SearchEntry[]>(fallbackPages);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const onClose = () => setOpen(false);

  useEffect(() => {
    const trigger = document.getElementById("search-trigger");

    const openSearch = () => setOpen(true);
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };

    trigger?.addEventListener("click", openSearch);
    window.addEventListener("keydown", handleKeydown);

    return () => {
      trigger?.removeEventListener("click", openSearch);
      window.removeEventListener("keydown", handleKeydown);
    };
  }, []);

  useEffect(() => {
    if (!open || pages !== fallbackPages) return;

    let cancelled = false;
    setLoading(true);

    fetch("/search-index.json")
      .then((response) => (response.ok ? response.json() : fallbackPages))
      .then((entries: SearchEntry[]) => {
        if (!cancelled && Array.isArray(entries) && entries.length > 0) {
          setPages(entries);
        }
      })
      .catch(() => {
        if (!cancelled) setPages(fallbackPages);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, pages]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return pages.slice(0, 12);

    return pages
      .map((entry) => ({ entry, score: score(entry, q) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 12)
      .map((item) => item.entry);
  }, [pages, query]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    setQuery("");
    setSelected(0);
    document.body.style.overflow = "hidden";

    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, Math.max(filtered.length - 1, 0)));
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

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search kprobe docs"
      >
        <div className="modal-input-row">
          <Search size={16} className="search-icon" />
          <input
            ref={inputRef}
            className="modal-input"
            placeholder="Search docs, guides, APIs..."
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
          {loading && <div className="no-results">Loading search index...</div>}
          {!loading && filtered.length === 0 && (
            <div className="no-results">No results for "{query}"</div>
          )}
          {!loading &&
            filtered.map((item, i) => (
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
          z-index: 1000;
          background: var(--overlay);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 7.5rem 1rem 1rem;
        }

        .modal {
          width: min(100%, 620px);
          max-height: min(680px, calc(100dvh - 2rem));
          background: var(--bg-subtle);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          box-shadow: var(--shadow-lg);
          display: flex;
          flex-direction: column;
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
          min-width: 0;
          background: transparent;
          border: none;
          outline: none;
          font-family: var(--font);
          font-size: 0.95rem;
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
          width: 28px;
          height: 28px;
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
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto auto;
          align-items: center;
          gap: 0.75rem;
          padding: 0.7rem 0.75rem;
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
          min-width: 0;
        }

        .result-title {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .result-selected .result-title {
          color: var(--accent);
        }

        .result-desc {
          font-size: 0.78rem;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 0.1rem;
        }

        .result-section {
          font-size: 0.68rem;
          font-weight: 600;
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

        @media (max-width: 560px) {
          .modal-overlay {
            padding: 4.25rem 0.75rem 0.75rem;
          }

          .modal {
            max-height: calc(100dvh - 5rem);
          }

          .result-item {
            grid-template-columns: auto minmax(0, 1fr);
          }

          .result-section,
          .result-arrow {
            display: none;
          }

          .modal-footer {
            justify-content: space-between;
            gap: 0.5rem;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
