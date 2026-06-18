import { getToken } from "./auth";
import type { KernelEvent } from "../types/events";
import { mapWireEvent } from "./wireEvent";

export interface CausalEdge {
  id: string;
  fromEventId: string;
  toEventId: string;
  causeType: string;
  latencyNs: number;
  transactionId: string;
  serviceName: string;
}

interface CausalChainResponse {
  nodes?: unknown[];
  edges?: Array<{
    fromEventId?: string;
    toEventId?: string;
    causeType?: string;
    latencyNs?: number | string;
    transactionId?: string;
    serviceName?: string;
  }>;
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    headers: authHeaders(),
    signal,
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function fetchCausalChain(
  transactionId: string,
  signal?: AbortSignal,
): Promise<{ nodes: KernelEvent[]; edges: CausalEdge[] }> {
  const encoded = encodeURIComponent(transactionId);
  const data = await fetchJSON<CausalChainResponse>(
    `/api/transactions/${encoded}/causal-chain`,
    signal,
  );

  return {
    nodes: (data.nodes ?? []).map((node, index) => mapWireEvent(node, index)),
    edges: (data.edges ?? []).map((edge, index) => ({
      id: `${edge.fromEventId ?? "from"}->${edge.toEventId ?? "to"}:${edge.causeType ?? index}`,
      fromEventId: String(edge.fromEventId ?? ""),
      toEventId: String(edge.toEventId ?? ""),
      causeType: String(edge.causeType ?? "CAUSE"),
      latencyNs: Number(edge.latencyNs ?? 0),
      transactionId: String(edge.transactionId ?? ""),
      serviceName: String(edge.serviceName ?? ""),
    })),
  };
}
