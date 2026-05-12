interface KVProps {
  k: string;
  v: string;
  accent?: boolean;
}

export function KV({ k, v, accent }: KVProps) {
  return (
    <>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.6rem",
          color: "var(--text-muted)",
          whiteSpace: "nowrap" as const,
        }}
      >
        {k}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.65rem",
          color: accent ? "var(--accent)" : "var(--text-secondary)",
          wordBreak: "break-all" as const,
          fontWeight: accent ? 700 : 400,
        }}
      >
        {v}
      </span>
    </>
  );
}
