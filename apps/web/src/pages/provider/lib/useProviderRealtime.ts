import type {
  ContractEventMessage,
  PresenceChangedEvent,
  ProviderPingDto,
} from "@zeyla/shared";
import { REALTIME_EVENTS } from "@zeyla/shared";
import { useSocketConnected, useSocketEvent } from "../../../realtime";

interface ProviderRealtimeHandlers {
  /** A customer just pinged this provider. */
  onPing: (ping: ProviderPingDto) => void;
  /** Status changed elsewhere — another tab, or the server on job accept. */
  onPresence: (event: PresenceChangedEvent) => void;
  /**
   * A contract this provider is party to moved — most importantly to
   * `escrowed`, which is Chapa's webhook telling us the customer has paid.
   */
  onContractStatus: (event: ContractEventMessage) => void;
}

/**
 * The provider's live wire.
 *
 * The server puts an authenticated socket into its own provider and user
 * rooms, so there is nothing to subscribe to: connecting is enough to start
 * receiving both pings and the contract transitions for this provider's jobs.
 */
export function useProviderRealtime(handlers: ProviderRealtimeHandlers) {
  const isConnected = useSocketConnected();

  useSocketEvent<ProviderPingDto>(REALTIME_EVENTS.PING_INCOMING, handlers.onPing);
  useSocketEvent<PresenceChangedEvent>(
    REALTIME_EVENTS.PRESENCE_CHANGED,
    handlers.onPresence,
  );
  useSocketEvent<ContractEventMessage>(
    REALTIME_EVENTS.CONTRACT_STATUS,
    handlers.onContractStatus,
  );

  return { isConnected };
}
