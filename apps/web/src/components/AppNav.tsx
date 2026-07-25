import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Status" },
  { to: "/onboarding", label: "Onboarding" },
  { to: "/discovery", label: "Discovery" },
  { to: "/payment", label: "Payment" },
  { to: "/tracking", label: "Tracking" },
  { to: "/reviews", label: "Reviews" },
];

export function AppNav() {
  return (
    <nav className="nav">
      {links.map((link) => (
        <NavLink key={link.to} to={link.to} end={link.to === "/"}>
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
