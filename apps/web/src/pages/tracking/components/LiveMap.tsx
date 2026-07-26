import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { REALTIME_EVENTS } from "@zeyla/shared";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getSocket, useSocketEvent } from "../../../realtime";

const userIcon = L.divIcon({
  className: "tr-leaflet-pin",
  html: `<div class="tr-map-marker tr-map-marker-you"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const providerIcon = L.divIcon({
  className: "tr-leaflet-pin",
  html: `<div class="tr-map-marker tr-map-marker-provider"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

interface LiveMapProps {
  userPos: [number, number];
  providerPos: [number, number];
}

function FitBounds({ userPos, providerPos }: LiveMapProps) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds([userPos, providerPos]);
    map.fitBounds(bounds.pad(0.35));
  }, [map, userPos, providerPos]);
  return null;
}

export function LiveMap({ userPos, providerPos }: LiveMapProps) {
  const center: [number, number] = [
    (userPos[0] + providerPos[0]) / 2,
    (userPos[1] + providerPos[1]) / 2,
  ];

  return (
    <MapContainer center={center} zoom={14} scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds userPos={userPos} providerPos={providerPos} />
      <Marker position={userPos} icon={userIcon}>
        <Popup>Your location</Popup>
      </Marker>
      <Marker position={providerPos} icon={providerIcon}>
        <Popup>Provider</Popup>
      </Marker>
    </MapContainer>
  );
}

export function useSimulatedProviderPath(
  start: [number, number],
  enabled: boolean,
) {
  const [pos, setPos] = useState<[number, number]>(start);
  const step = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const path: [number, number][] = [
      start,
      [start[0] + 0.002, start[1] + 0.001],
      [start[0] + 0.004, start[1] + 0.002],
      [start[0] + 0.006, start[1] + 0.001],
      [start[0] + 0.008, start[1] - 0.001],
    ];
    const interval = setInterval(() => {
      step.current = Math.min(step.current + 1, path.length - 1);
      setPos(path[step.current]!);
    }, 3000);
    return () => clearInterval(interval);
  }, [enabled, start]);

  return pos;
}

/**
 * The provider's real position, while there is a contract to track it under.
 *
 * The server files GPS against a contract and only lets its two parties into
 * that room, so there is nothing to join until the customer has started
 * checkout — before that, and whenever the socket is down, the map animates a
 * stand-in path and says so via `isLive`.
 */
export function useSocketLocation(
  contractId: string | null,
  fallbackStart: [number, number],
) {
  const [pos, setPos] = useState<[number, number]>(fallbackStart);
  const [joined, setJoined] = useState(false);

  useSocketEvent<{ lat: number; lng: number }>(
    REALTIME_EVENTS.CONTRACT_LOCATION,
    useCallback((payload) => setPos([payload.lat, payload.lng]), []),
  );

  useEffect(() => {
    setJoined(false);
    if (!contractId) return;

    let cancelled = false;
    let leave: (() => void) | null = null;

    void getSocket().then((socket) => {
      if (!socket || cancelled) return;

      const join = () => {
        socket.emit(REALTIME_EVENTS.JOIN_CONTRACT, { contractId });
        setJoined(true);
      };
      const drop = () => setJoined(false);

      // Re-join after a reconnect: rooms do not survive a dropped socket.
      if (socket.connected) join();
      socket.on("connect", join);
      socket.on("disconnect", drop);

      leave = () => {
        socket.off("connect", join);
        socket.off("disconnect", drop);
        socket.emit(REALTIME_EVENTS.LEAVE_CONTRACT, { contractId });
      };
    });

    return () => {
      cancelled = true;
      leave?.();
    };
  }, [contractId]);

  const simulated = useSimulatedProviderPath(fallbackStart, !joined);

  return {
    position: joined ? pos : simulated,
    isLive: joined,
  };
}
