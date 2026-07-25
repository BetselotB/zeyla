import { Link } from "react-router-dom";
import { GlassNavShell } from "./GlassNavShell.js";
import { ZeylaLogo } from "./ZeylaLogo.js";

export function DiscoveryNav() {
  return (
    <GlassNavShell>
      <ZeylaLogo />
      <ul className="z-nav-links">
        <li><a href="#product">Product</a></li>
        <li><a href="#providers">Providers</a></li>
        <li><a href="#how">Use Cases</a></li>
        <li><a href="#pricing">Pricing</a></li>
      </ul>
      <div className="z-nav-cta">
        <Link to="/discovery" className="z-btn z-btn-primary">
          Get Started
        </Link>
      </div>
    </GlassNavShell>
  );
}

export function TrustStrip() {
  const logos = [
    "attentive",
    "coinbase",
    "Outreach",
    "upwork",
    "DocuSign",
    "NETFLIX",
    "zapier",
  ];

  return (
    <section className="z-trust-band">
      <p>Trusted by 12,000+ creators</p>
      <div className="z-trust-logos">
        {logos.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
    </section>
  );
}
