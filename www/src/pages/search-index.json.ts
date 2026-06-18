interface SearchEntry {
  title: string;
  description: string;
  href: string;
  section: string;
}

const pageSections: Record<string, string> = {
  api: "API Reference",
  concepts: "Core Concepts",
  configuration: "Configuration",
  dashboard: "Dashboard",
  "how-it-works": "How It Works",
  install: "Install",
  operations: "Operations",
  reference: "Reference",
  security: "Security",
  troubleshooting: "Troubleshooting",
  "use-cases": "Use Cases",
};

function titleFromSlug(slug: string) {
  return slug
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") ?? "Docs";
}

function sectionFromSlug(slug: string) {
  const part = slug.split("/").filter(Boolean)[0];
  return pageSections[part] ?? "Start Here";
}

const docs = import.meta.glob("./docs/**/*.mdx", { eager: true });

const entries: SearchEntry[] = Object.entries(docs).map(([path, module]) => {
  const frontmatter = (module as { frontmatter?: Record<string, string> })
    .frontmatter ?? {};
  const slug = path
    .replace("./docs/", "")
    .replace(/\/index\.mdx$/, "")
    .replace(/\.mdx$/, "");
  const href = slug === "index" ? "/docs" : `/docs/${slug}`;

  return {
    title: frontmatter.title || titleFromSlug(slug),
    description: frontmatter.description || "",
    href,
    section: sectionFromSlug(slug),
  };
});

entries.push(
  {
    title: "Home",
    description:
      "Kernel-level incident forensics, causal graphs, and replay for production systems.",
    href: "/",
    section: "Pages",
  },
  {
    title: "About",
    description:
      "Why kprobe exists and how kernel-level forensics fits into production debugging.",
    href: "/about",
    section: "Pages",
  },
  {
    title: "Compare",
    description:
      "Compare kprobe with Datadog, Jaeger, OpenTelemetry, and Prometheus.",
    href: "/compare",
    section: "Pages",
  },
);

entries.sort((left, right) => left.href.localeCompare(right.href));

export function GET() {
  return new Response(JSON.stringify(entries), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
