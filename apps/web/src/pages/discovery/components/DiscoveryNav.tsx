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

const SPONSORS: { src: string; alt: string; invert?: boolean }[] = [
  { src: "/sponsers/addis_full.png", alt: "Addis AI", invert: true },
  { src: "/sponsers/ethiotel.png", alt: "Ethio Telecom" },
  // { src: "/sponsers/eleven-labs.png", alt: "ElevenLabs" },
  // { src: "/sponsers/render.png", alt: "Render" },
  { src: "/sponsers/exa.png", alt: "Exa" },
  // { src: "/sponsers/fal.png", alt: "Fal" },
  // { src: "/sponsers/flow.png", alt: "Flow" },
];

export function TrustStrip() {
  return (
    <section className="z-trust-band">
      <p>Trusted by 12,000+ creators</p>
      <div className="z-trust-logos">
        {SPONSORS.map(({ src, alt, invert }) => (
          <span key={src} className="z-trust-logo">
            <img
              src={src}
              alt={alt}
              className={`z-trust-logo-img${invert ? " z-trust-logo-img--invert" : ""}`}
              loading="lazy"
            />
          </span>
        ))}
      </div>
    </section>
  );
}
