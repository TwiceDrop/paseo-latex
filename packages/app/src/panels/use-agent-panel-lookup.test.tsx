/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import type { FetchAgentOptions, FetchAgentResult } from "@getpaseo/client/internal/daemon-client";
import { afterEach, expect, it, vi } from "vitest";
import { useAgentPanelLookup } from "./use-agent-panel-lookup";

afterEach(cleanup);

function deferredLookup() {
  let resolve!: (value: null) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<null>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function setup() {
  const fetchAgent =
    vi.fn<(options: FetchAgentOptions | string) => Promise<FetchAgentResult | null>>();
  const onLoaded = vi.fn();
  const input = {
    serverId: "host-a",
    agentId: "agent-a",
    client: { fetchAgent },
    enabled: true,
    hasAgent: false,
    onLoaded,
  };
  return { input, fetchAgent, onLoaded };
}

it("keeps a lookup failure visible without flooding retries, and allows an explicit retry", async () => {
  const { input, fetchAgent } = setup();
  fetchAgent.mockRejectedValueOnce(new Error("Host is not connected")).mockResolvedValueOnce(null);
  const { result, rerender } = renderHook(useAgentPanelLookup, { initialProps: input });
  await act(async () => {});
  expect(result.current.state).toEqual({ tag: "error", message: "Host is not connected" });
  rerender({ ...input });
  await act(async () => {});
  expect(fetchAgent).toHaveBeenCalledTimes(1);
  expect(result.current.state).toEqual({ tag: "error", message: "Host is not connected" });

  await act(async () => result.current.retry());
  expect(fetchAgent).toHaveBeenCalledTimes(2);
  expect(result.current.state).toEqual({ tag: "not_found", message: "Agent not found: agent-a" });
});

it("switches to an available tab while the previous lookup is still pending", async () => {
  const { input, fetchAgent, onLoaded } = setup();
  const previous = deferredLookup();
  fetchAgent.mockReturnValueOnce(previous.promise);
  const { result, rerender } = renderHook(useAgentPanelLookup, { initialProps: input });
  expect(result.current.state).toEqual({ tag: "loading" });

  rerender({ ...input, agentId: "agent-b", hasAgent: true });
  expect(result.current.state).toEqual({ tag: "idle" });
  await act(async () => previous.resolve(null));
  expect(result.current.state).toEqual({ tag: "idle" });
  expect(fetchAgent).toHaveBeenCalledTimes(1);
  expect(onLoaded).not.toHaveBeenCalled();
});

it("loads another tab independently and ignores a late failure from the old host", async () => {
  const { input, fetchAgent } = setup();
  const previous = deferredLookup();
  const current = deferredLookup();
  fetchAgent.mockReturnValueOnce(previous.promise).mockReturnValueOnce(current.promise);
  const { result, rerender } = renderHook(useAgentPanelLookup, { initialProps: input });
  rerender({ ...input, serverId: "host-b", agentId: "agent-b" });
  expect(fetchAgent.mock.calls).toEqual([[{ agentId: "agent-a" }], [{ agentId: "agent-b" }]]);
  await act(async () => current.resolve(null));
  expect(result.current.state).toEqual({ tag: "not_found", message: "Agent not found: agent-b" });
  await act(async () => previous.reject(new Error("Old host timed out")));
  expect(result.current.state).toEqual({ tag: "not_found", message: "Agent not found: agent-b" });
});

it("does not start work in a hidden tab and invalidates its pending lookup when hidden again", async () => {
  const { input, fetchAgent } = setup();
  const pending = deferredLookup();
  fetchAgent.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(null);
  const { result, rerender } = renderHook(useAgentPanelLookup, {
    initialProps: { ...input, enabled: false },
  });
  expect(fetchAgent).not.toHaveBeenCalled();
  rerender(input);
  expect(result.current.state).toEqual({ tag: "loading" });
  rerender({ ...input, enabled: false });
  await act(async () => pending.reject(new Error("Hidden request failed")));
  expect(result.current.state).toEqual({ tag: "loading" });
  await act(async () => rerender(input));
  expect(fetchAgent).toHaveBeenCalledTimes(2);
  expect(result.current.state).toEqual({ tag: "not_found", message: "Agent not found: agent-a" });
});
