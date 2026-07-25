import type { ReactNode } from "react";

/**
 * Frosted glass nav shell — backdrop-filter blur + inset rim + specular sweep.
 * See hackathon glass plan (links.module.css technique, neutral tint).
 */
export function GlassNavShell({ children }: { children: ReactNode }) {
  return (
    <header className="z-glass-nav">
      <div className="z-glass-nav-bar">{children}</div>
    </header>
  );
}
