import { useCallback, useEffect, useState } from "react";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useStableEvent } from "@/hooks/use-stable-event";

type AgentLookupState =
  | { tag: "idle" }
  | { tag: "loading" }
  | { tag: "not_found"; message: string }
  | { tag: "error"; message: string };

type FetchedAgent = NonNullable<Awaited<ReturnType<DaemonClient["fetchAgent"]>>>;

export function useAgentPanelLookup({
  serverId,
  agentId,
  client,
  enabled,
  hasAgent,
  onLoaded,
}: {
  serverId: string;
  agentId?: string;
  client: Pick<DaemonClient, "fetchAgent"> | null;
  enabled: boolean;
  hasAgent: boolean;
  onLoaded: (result: FetchedAgent) => void;
}) {
  const [state, setState] = useState<AgentLookupState>({ tag: "idle" });
  const [retryRevision, setRetryRevision] = useState(0);
  const accept = useStableEvent(onLoaded);
  const retry = useCallback(() => setRetryRevision((revision) => revision + 1), []);

  useEffect(() => {
    if (hasAgent) {
      setState({ tag: "idle" });
      return;
    }
    if (!enabled || !client || !agentId) return;

    let cancelled = false;
    setState({ tag: "loading" });
    void client
      .fetchAgent({ agentId })
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setState({ tag: "not_found", message: `Agent not found: ${agentId}` });
          return;
        }
        accept(result);
        setState({ tag: "idle" });
        return;
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setState({
          tag: /agent not found|not found/i.test(message) ? "not_found" : "error",
          message,
        });
      });

    // Retained tabs can become hidden without unmounting. Their old requests
    // must not publish results after a tab, host, or connection change.
    return () => {
      cancelled = true;
    };
  }, [accept, agentId, client, enabled, hasAgent, retryRevision, serverId]);

  // Updating the result is deliberately not an effect dependency: a failed
  // lookup stays actionable until a user retry or a new visibility/connection.
  return { state, retry };
}
