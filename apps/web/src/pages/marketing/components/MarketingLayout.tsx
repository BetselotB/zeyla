import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ArrowIcon } from "./icons.js";
import "../marketing.css";

export const NAV_ITEMS = [
  { to: "/product", label: "Product" },
  { to: "/providers", label: "Providers" },
  { to: "/use-cases", label: "Use Cases" },
  { to: "/pricing", label: "Pricing" },
];

/**
 * Chrome shared by the four public pages.
 *
 * These are the only routes an anonymous visitor can reach — everything under
 * RequireOnboarding bounces to /onboarding — so every call to action here
 * points at signup rather than deeper into the app.
 */
export function MarketingLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="zm-root">
      <div className="zm-page">
        <header className="zm-nav">
          <div className="zm-nav-bar">
            <Link to="/product" className="zm-logo">
              <img src="/zeyla-logo.png" alt="" className="zm-logo-img" width={30} height={30} />
              <span>ZEYLA</span>
            </Link>

            <ul className="zm-nav-links">
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to}>{item.label}</NavLink>
                </li>
              ))}
            </ul>

            <div className="zm-nav-cta">
              <Link to="/onboarding" className="zm-btn zm-btn-primary">
                Get Started
              </Link>
              <button
                type="button"
                className="zm-nav-toggle"
                aria-expanded={menuOpen}
                aria-label="Toggle navigation"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
            </div>
          </div>

          <ul className={`zm-nav-drawer${menuOpen ? " open" : ""}`}>
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to}>{item.label}</NavLink>
              </li>
            ))}
          </ul>
        </header>

        <main className="zm-main">{children}</main>

        <footer className="zm-footer">
          <div className="zm-footer-inner">
            <p className="zm-footer-note">
              Zeyla — the trust and settlement layer for local services in Ethiopia.
            </p>
            <ul className="zm-footer-links">
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <Link to={item.to}>{item.label}</Link>
                </li>
              ))}
              <li>
                <Link to="/onboarding">Sign in</Link>
              </li>
            </ul>
          </div>
        </footer>
      </div>
    </div>
  );
}

interface HeroProps {
  badge: string;
  note?: string;
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}

export function Hero({ badge, note, title, children, actions }: HeroProps) {
  return (
    <section className="zm-hero zm-reveal">
      <div className="zm-badges">
        <span className="zm-badge zm-badge-dark">{badge}</span>
        {note && <span className="zm-badge zm-badge-light">{note}</span>}
      </div>
      <h1>{title}</h1>
      <p>{children}</p>
      {actions && <div className="zm-hero-actions">{actions}</div>}
    </section>
  );
}

interface SectionProps {
  id?: string;
  eyebrow?: string;
  title?: string;
  intro?: string;
  center?: boolean;
  tight?: boolean;
  children: ReactNode;
}

export function Section({ id, eyebrow, title, intro, center, tight, children }: SectionProps) {
  return (
    <section id={id} className={`zm-section${tight ? " zm-section-tight" : ""}`}>
      {(eyebrow || title || intro) && (
        <div className={`zm-section-head${center ? " center" : ""}`}>
          {eyebrow && <span className="zm-eyebrow">{eyebrow}</span>}
          {title && <h2>{title}</h2>}
          {intro && <p>{intro}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PrimaryLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="zm-btn zm-btn-primary zm-btn-lg">
      {children}
      <span className="zm-btn-arrow">
        <ArrowIcon />
      </span>
    </Link>
  );
}

export function GhostLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="zm-btn zm-btn-ghost zm-btn-lg">
      {children}
    </Link>
  );
}

interface CtaBandProps {
  title: string;
  body: string;
  primary: { to: string; label: string };
  secondary?: { to: string; label: string };
}

export function CtaBand({ title, body, primary, secondary }: CtaBandProps) {
  return (
    <section className="zm-cta">
      <div className="zm-cta-inner">
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="zm-hero-actions">
          <PrimaryLink to={primary.to}>{primary.label}</PrimaryLink>
          {secondary && <GhostLink to={secondary.to}>{secondary.label}</GhostLink>}
        </div>
      </div>
    </section>
  );
}
