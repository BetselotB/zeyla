import type { ReactNode } from "react";

type PagePlaceholderProps = {
  title: string;
  owner: string;
  folder: string;
  children?: ReactNode;
};

/** Delete this once the page has real content. */
export function PagePlaceholder({
  title,
  owner,
  folder,
  children,
}: PagePlaceholderProps) {
  return (
    <section>
      <h2>{title}</h2>
      <p className="muted">
        Owned by {owner} — build inside <code>{folder}</code>
      </p>
      {children}
    </section>
  );
}
