import {
  CtaBand,
  GhostLink,
  Hero,
  MarketingLayout,
  PrimaryLink,
  Section,
} from "./components/MarketingLayout.js";
import { HandshakeIcon, UsersIcon, WalletIcon, ShieldIcon } from "./components/icons.js";

interface Scenario {
  title: string;
  urgency: "high" | "normal" | "low";
  urgencyLabel: string;
  quote: string;
  body: string;
  flow: string[];
}

const SCENARIOS: Scenario[] = [
  {
    title: "A pipe bursts at 9pm",
    urgency: "high",
    urgencyLabel: "Emergency",
    quote: "“ቧንቧዬ እየፈሰሰ ነው። ቦሌ አካባቢ ነኝ።”",
    body: "You say it into the phone in Amharic. Zeyla hears plumbing, emergency, Bole, and shows the plumbers still online within a few kilometres — sorted by trust, not by who shouts loudest in a group chat.",
    flow: ["Voice request", "3 plumbers nearby", "Ping accepted in 2 min", "Escrow funded", "Tracked to your gate"],
  },
  {
    title: "Moving out and the deposit is on the line",
    urgency: "normal",
    urgencyLabel: "Scheduled",
    quote: "“Deep clean, two bedrooms, before the landlord inspects on Saturday.”",
    body: "A big job with a real price attached is exactly where paying up front hurts. The money goes into escrow when you book and only reaches the cleaner once you have walked the apartment.",
    flow: ["Booked for Saturday", "Escrow funded", "Job marked complete", "You inspect", "Payment released"],
  },
  {
    title: "The electrician you have never met",
    urgency: "normal",
    urgencyLabel: "Verification matters",
    quote: "“Someone is coming into my house while my kids are home.”",
    body: "Open the trust breakdown before you accept: ID on file, how many contracts they have completed on Zeyla, their average rating, and whether anyone has flagged them. It is the same data we use to rank them.",
    flow: ["Trust score 88", "ID verified", "31 completed jobs", "No upheld flags"],
  },
  {
    title: "A landlord managing four properties",
    urgency: "low",
    urgencyLabel: "Repeat work",
    quote: "“I need the same reliable people every month, not a new gamble.”",
    body: "Every job you complete builds a history on both sides. Providers you rated well keep showing up first, and the ones who did not turn up carry that in their score for the next person too.",
    flow: ["Repeat bookings", "Ratings compound", "Preferred providers rank up"],
  },
  {
    title: "A shop that needs an appliance fixed today",
    urgency: "high",
    urgencyLabel: "Business hours",
    quote: "“The fridge is down and stock is spoiling.”",
    body: "Small businesses do not keep a vendor list for every trade. Filter by category and distance, see who is online right now, and get a technician on the way without calling six numbers.",
    flow: ["Filter: appliance repair", "Online only", "Nearest first", "On site same day"],
  },
  {
    title: "A provider tired of unpaid jobs",
    urgency: "normal",
    urgencyLabel: "Provider side",
    quote: "“I finished the work and then spent two weeks asking to be paid.”",
    body: "On Zeyla the customer funds the contract before you start. Your work turns into a payout and a higher score instead of a phone number that stops answering.",
    flow: ["Ping accepted", "Escrow already funded", "Work completed", "Payout released", "Score +2"],
  },
];

const SEGMENTS = [
  {
    icon: <UsersIcon />,
    title: "Urban households",
    body: "Plumbing, electrical, cleaning, and repairs on short notice — usually at the worst possible moment.",
  },
  {
    icon: <HandshakeIcon />,
    title: "Busy professionals and renters",
    body: "People who moved neighbourhood and never inherited the “guy for that” network everyone else relies on.",
  },
  {
    icon: <WalletIcon />,
    title: "Independent providers",
    body: "Skilled tradespeople who already get work by referral but lose real money to no-shows and late payment.",
  },
  {
    icon: <ShieldIcon />,
    title: "Small businesses",
    body: "Shops and offices that need a trade occasionally and have no procurement process for it.",
  },
];

const BEFORE = [
  "Ask three friends, wait for a name.",
  "Get a number from a Telegram group with no history behind it.",
  "Agree a price on the phone and hope it holds when they arrive.",
  "Pay cash up front, or argue about it after.",
  "No record afterwards — the next job starts from zero again.",
];

const AFTER = [
  "Describe the problem once, by voice or text.",
  "See verified providers nearby with an explainable trust score.",
  "Price range visible before you ping anyone.",
  "Money held in escrow until you confirm the work is done.",
  "Your review updates a score the whole marketplace can see.",
];

export function UseCasesPage() {
  return (
    <MarketingLayout>
      <Hero
        badge="Use cases"
        note="Addis Ababa pilot"
        title={
          <>
            The jobs people are
            <br />
            already risking money on.
          </>
        }
        actions={
          <>
            <PrimaryLink to="/onboarding">Try it on your job</PrimaryLink>
            <GhostLink to="/product">How the product works</GhostLink>
          </>
        }
      >
        Every one of these happens today over a group chat and a cash payment. Here is
        what the same job looks like when identity is verified and the money is held
        until the work is finished.
      </Hero>

      <Section eyebrow="Scenarios" title="Six jobs, start to finish">
        <div className="zm-grid zm-grid-3">
          {SCENARIOS.map((scenario) => (
            <article key={scenario.title} className="zm-scenario zm-reveal">
              <div className="zm-scenario-top">
                <h3>{scenario.title}</h3>
                <span className={`zm-tag zm-tag-${scenario.urgency}`}>
                  {scenario.urgencyLabel}
                </span>
              </div>
              <p className="zm-quote">{scenario.quote}</p>
              <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.6, color: "var(--zm-ink-50)" }}>
                {scenario.body}
              </p>
              <div className="zm-scenario-flow">
                {scenario.flow.map((step) => (
                  <span key={step} className="zm-chip">
                    {step}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Before and after"
        title="Same plumber, different outcome"
        intro="The provider is often the very same person. What changes is whether identity, price, and payment are settled before anyone starts working."
      >
        <div className="zm-versus">
          <div className="zm-versus-col">
            <h3>Group chat and cash</h3>
            <ul>
              {BEFORE.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="zm-versus-col good">
            <h3>On Zeyla</h3>
            <ul>
              {AFTER.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section eyebrow="Who it's for" title="Both sides of the same problem" center>
        <div className="zm-grid zm-grid-4">
          {SEGMENTS.map((segment) => (
            <article key={segment.title} className="zm-card zm-card-hover">
              <span className="zm-icon zm-icon-green">{segment.icon}</span>
              <h3>{segment.title}</h3>
              <p>{segment.body}</p>
            </article>
          ))}
        </div>
      </Section>

      <CtaBand
        title="Your job is probably on this page"
        body="Describe it in your own words and see who nearby can take it — with the payment held safely until it is done."
        primary={{ to: "/onboarding", label: "Get started" }}
        secondary={{ to: "/providers", label: "I'm a provider" }}
      />
    </MarketingLayout>
  );
}
