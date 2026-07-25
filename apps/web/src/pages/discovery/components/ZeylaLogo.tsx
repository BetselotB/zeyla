import { Link } from "react-router-dom";

interface ZeylaLogoProps {
  className?: string;
  showText?: boolean;
}

export function ZeylaLogo({ className = "", showText = true }: ZeylaLogoProps) {
  return (
    <Link to="/discovery" className={`z-logo${className ? ` ${className}` : ""}`}>
      <img
        src="/zeyla-logo.png"
        alt=""
        className="z-logo-img"
        width={32}
        height={32}
        aria-hidden={showText}
      />
      {showText ? <span className="z-logo-text">ZEYLA</span> : null}
    </Link>
  );
}
