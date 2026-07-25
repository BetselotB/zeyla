/** Outline icon set for the marketing pages. Stroke and size come from CSS. */

type IconProps = { className?: string };

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

export function ShieldIcon() {
  return (
    <Svg>
      <path d="M12 3l7 3v5.5c0 4.2-2.9 7.9-7 9.5-4.1-1.6-7-5.3-7-9.5V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  );
}

export function WalletIcon() {
  return (
    <Svg>
      <path d="M3 8a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
      <path d="M3 8V7a2 2 0 012-2h11" />
      <circle cx="16.5" cy="12.5" r="1.2" />
    </Svg>
  );
}

export function PinIcon() {
  return (
    <Svg>
      <path d="M12 21s7-5.4 7-11a7 7 0 10-14 0c0 5.6 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </Svg>
  );
}

export function StarIcon() {
  return (
    <Svg>
      <path d="M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8L12 4z" />
    </Svg>
  );
}

export function UsersIcon() {
  return (
    <Svg>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0111 0" />
      <path d="M16 6.3a3.2 3.2 0 010 5.4M17.5 19a5.6 5.6 0 00-2-4.2" />
    </Svg>
  );
}

export function BoltIcon() {
  return (
    <Svg>
      <path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z" />
    </Svg>
  );
}

export function MicIcon() {
  return (
    <Svg>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3" />
    </Svg>
  );
}

export function RouteIcon() {
  return (
    <Svg>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="18" cy="18" r="2.4" />
      <path d="M8.4 6H14a3.5 3.5 0 010 7h-4a3.5 3.5 0 000 7h5.6" />
    </Svg>
  );
}

export function HandshakeIcon() {
  return (
    <Svg>
      <path d="M3 12l3.5-3.5a2 2 0 012.8 0L12 11l2.7-2.5a2 2 0 012.8 0L21 12" />
      <path d="M7 14l2.5 2.5a1.8 1.8 0 002.5 0L14 15" />
      <path d="M3 12v3.5M21 12v3.5" />
    </Svg>
  );
}

export function BadgeIcon() {
  return (
    <Svg>
      <circle cx="12" cy="10" r="6" />
      <path d="M9.5 15.2L8.5 21l3.5-1.8L15.5 21l-1-5.8" />
      <path d="M9.8 10l1.6 1.6L14.4 8.6" />
    </Svg>
  );
}

export function ClockIcon() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </Svg>
  );
}

export function LockIcon() {
  return (
    <Svg>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
      <path d="M8 10.5V7.8a4 4 0 018 0v2.7" />
    </Svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function CrossIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

export function ArrowIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 9V3M6 3L3 6M6 3L9 6" />
    </svg>
  );
}
