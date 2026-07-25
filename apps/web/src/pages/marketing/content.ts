import { SERVICE_CATEGORIES, type ServiceCategory } from "@zeyla/shared";

/**
 * Copy shared by more than one marketing page. Anything that describes how the
 * product actually behaves — the contract states, the trust formula, the fee —
 * is kept here so a change to the product is a change in one file.
 */

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  plumber: "Plumbing",
  electrician: "Electrical",
  carpenter: "Carpentry",
  cleaner: "Cleaning",
  painter: "Painting",
  mechanic: "Mechanic",
  mover: "Moving",
  gardener: "Gardening",
  appliance_repair: "Appliance repair",
  tutor: "Tutoring",
  other: "Something else",
};

export const CATEGORIES = SERVICE_CATEGORIES.map((slug) => ({
  slug,
  label: CATEGORY_LABELS[slug],
}));

/** Mirrors the contract state machine in the escrow module. */
export const CONTRACT_STATES = [
  { name: "awaiting_escrow", caption: "Booked, unpaid", tone: "" },
  { name: "escrowed", caption: "Money held", tone: "zm-state-funded" },
  { name: "active", caption: "Work in progress", tone: "zm-state-active" },
  { name: "completed", caption: "Released to provider", tone: "zm-state-done" },
];

/** Mirrors the trust score formula in the trust module. */
export const TRUST_ROWS = [
  { label: "Everyone starts here", value: "50", tone: "" },
  { label: "Completed contracts (2 each)", value: "+20 max", tone: "plus" },
  { label: "Average review rating", value: "+20 max", tone: "plus" },
  { label: "ID and selfie submitted", value: "+10", tone: "plus" },
  { label: "Matching public work profile", value: "+5", tone: "plus" },
  { label: "Each upheld flag", value: "−5", tone: "minus" },
];

/** Pilot pricing. One place to change it when the take rate is finalised. */
export const ESCROW_FEE_RATE = 0.08;
export const FEE_RANGE_LABEL = "5–12% depending on category";

export function birr(amount: number): string {
  return `${Math.round(amount).toLocaleString("en-US")} Br`;
}
