import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

export function useSocketLocation(
  contractId: string,
  fallbackStart: [number, number],
) {
  const [pos, setPos] = useState<[number, number]>(fallbackStart);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let socket: import("socket.io-client").Socket | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { io } = await import("socket.io-client");
        const base = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
        socket = io(base, { transports: ["websocket", "polling"] });
        socket.on("connect", () => {
          if (!cancelled) setConnected(true);
          socket?.emit("join:contract", contractId);
        });
        socket.on("disconnect", () => {
          if (!cancelled) setConnected(false);
        });
        socket.on(
          "contract:location",
          (payload: { lat: number; lng: number }) => {
            if (!cancelled) setPos([payload.lat, payload.lng]);
          },
        );
      } catch {
        /* fall back to simulation */
      }
    })();

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [contractId]);

  const simulated = useSimulatedProviderPath(fallbackStart, !connected);

  return {
    position: connected ? pos : simulated,
    isLive: connected,
  };
}
