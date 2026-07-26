import { useEffect, useRef, useState } from "react";
import { getSocket } from "./socket";

/**
 * Subscribes to one event on the shared socket for the life of the component.
 *
 * The handler is held in a ref rather than listed as a dependency, because
 * callers close over state that changes on every event — putting it in the
 * dependency list would detach and reattach the listener exactly when events
 * are arriving.
 */
export function useSocketEvent<T>(
  event: string,
  handler: (payload: T) => void,
): void {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    let cancelled = false;
    let attached: { off: () => void } | null = null;

    void getSocket().then((socket) => {
      if (!socket || cancelled) return;
      const listener = (payload: T) => latest.current(payload);
      socket.on(event, listener);
      attached = { off: () => socket.off(event, listener) };
    });

    return () => {
      cancelled = true;
      attached?.off();
    };
  }, [event]);
}

/** Whether the shared socket is currently up, for "live" vs "simulated" badges. */
export function useSocketConnected(): boolean {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | null = null;

    void getSocket().then((socket) => {
      if (!socket || cancelled) return;

      const onConnect = () => setIsConnected(true);
      const onDown = () => setIsConnected(false);

      // The socket may already be up from another hook, in which case no
      // further "connect" is coming and the initial false would stick.
      setIsConnected(socket.connected);
      socket.on("connect", onConnect);
      socket.on("disconnect", onDown);
      socket.on("connect_error", onDown);

      detach = () => {
        socket.off("connect", onConnect);
        socket.off("disconnect", onDown);
        socket.off("connect_error", onDown);
      };
    });

    return () => {
      cancelled = true;
      detach?.();
    };
  }, []);

  return isConnected;
}
