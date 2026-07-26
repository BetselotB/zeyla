import { useCallback, useEffect, useState } from "react";
import type {
  ActiveJobSummary,
  ApiResponse,
  ContractEventMessage,
  PingAnsweredEvent,
  ServiceRequestDto,
} from "@zeyla/shared";
import { REALTIME_EVENTS } from "@zeyla/shared";
import { API_BASE, authHeaders } from "../auth/session";
import { useSocketEvent } from "../realtime";

/**
 * The customer's one job in flight.
 *
 * Zeyla deliberately allows a customer only one open request at a time: a
 * second one would ping the same providers again and split a single person's
 * attention across two escrows. Every screen that could start a new job reads
 * this first, so the rule is enforced in one place rather than re-derived from
 * request lists page by page.
 */

async function call<T>(path: string, method: "GET" | "POST" = "GET"): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: await authHeaders(),
  });
  const envelope = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (!envelope?.success || envelope.data == null) {
    throw new Error(envelope?.error ?? `request_failed_${res.status}`);
  }
  return envelope.data;
}

export async function fetchActiveJob(): Promise<ActiveJobSummary | null> {
  const { active } = await call<{ active: ActiveJobSummary | null }>(
    "/marketplace/requests/active",
  );
  return active;
}

export async function cancelRequest(
  requestId: string,
): Promise<ServiceRequestDto> {
  const { request } = await call<{ request: ServiceRequestDto }>(
    `/marketplace/requests/${encodeURIComponent(requestId)}/cancel`,
    "POST",
  );
  return request;
}

export interface ActiveJobState {
  activeJob: ActiveJobSummary | null;
  isLoading: boolean;
  error: string | null;
  isCancelling: boolean;
  refresh: () => void;
  /** Closes the job so a new one can be started. Rejects a completed job. */
  cancel: () => Promise<void>;
  /** Where to send the customer to deal with it. */
  href: string | null;
}

export function useActiveJob(options: { enabled?: boolean } = {}): ActiveJobState {
  const { enabled = true } = options;

  const [activeJob, setActiveJob] = useState<ActiveJobSummary | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setActiveJob(await fetchActiveJob());
      setError(null);
    } catch (err) {
      // A signed-out or provider-only account has no active job rather than a
      // broken one, so this stays quiet and simply blocks nothing.
      setActiveJob(null);
      setError(err instanceof Error ? err.message : "active_job_lookup_failed");
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  // Both events change the answer: a provider accepting turns a pending
  // request into a committed one, and a contract completing releases the lock.
  useSocketEvent<PingAnsweredEvent>(
    REALTIME_EVENTS.PING_ANSWERED,
    useCallback(() => void load(), [load]),
  );
  useSocketEvent<ContractEventMessage>(
    REALTIME_EVENTS.CONTRACT_STATUS,
    useCallback(() => void load(), [load]),
  );

  const cancel = useCallback(async () => {
    if (!activeJob || isCancelling) return;
    setIsCancelling(true);
    setError(null);
    try {
      await cancelRequest(activeJob.request.id);
      setActiveJob(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "cancel_failed");
      // The server may have closed it anyway; re-read rather than guess.
      await load();
    } finally {
      setIsCancelling(false);
    }
  }, [activeJob, isCancelling, load]);

  return {
    activeJob,
    isLoading,
    error,
    isCancelling,
    refresh: useCallback(() => void load(), [load]),
    cancel,
    href: activeJob
      ? `/tracking?requestId=${activeJob.request.id}` +
        (activeJob.providerId ? `&providerId=${activeJob.providerId}` : "")
      : null,
  };
}
