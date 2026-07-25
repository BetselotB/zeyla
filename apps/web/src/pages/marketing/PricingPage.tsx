import { useState } from "react";
import {
  CtaBand,
  GhostLink,
  Hero,
  MarketingLayout,
  PrimaryLink,
  Section,
} from "./components/MarketingLayout.js";
import { CheckIcon, CrossIcon } from "./components/icons.js";
import { ESCROW_FEE_RATE, FEE_RANGE_LABEL, birr } from "./content.js";

const PLANS = [
  {
    tag: "Customers",
    name: "Always free",
    price: "0 Br",
    sub: "to browse, ping, and book",
    featured: false,
    points: [
      "Unlimited requests and pings",
      "Voice input in Amharic and Afaan Oromo",
      "Full trust breakdown on every provider",
      "Escrow protection on every booking",
      "Live tracking while the job is active",
    ],
    cta: { to: "/onboarding", label: "Create an account" },
  },
  {
    tag: "Providers",
    name: "Pay on completion",
    price: "8%",
    sub: "of the job, taken when escrow releases",
    featured: true,
    points: [
      "No signup fee, no monthly minimum",
      "Nothing charged on a cancelled or disputed job",
      "Payout the same day the customer confirms",
      "Unlimited pings while you are online",
      "Trust score and profile included",
    ],
    cta: { to: "/onboarding", label: "Become a provider" },
  },
  {
    tag: "Providers",
    name: "Zeyla Pro",
    price: "Coming soon",
    sub: "monthly, for full-time trades",
    featured: false,
    points: [
      "Deeper verification and a Pro badge",
      "Priority payout instead of standard settlement",
      "Higher contract value limits",
      "Labelled discovery boosts in your category",
    ],
    cta: { to: "/providers", label: "See provider details" },
  },
];

const ADDONS = [
  {
    name: "Escrow fee",
    who: "Provider",
    when: "When the job completes",
    price: `${Math.round(ESCROW_FEE_RATE * 100)}%`,
    note: FEE_RANGE_LABEL,
  },
  {
    name: "Priority payout",
    who: "Provider",
    when: "On cash-out, optional",
    price: "Flat fee",
    note: "Settle in hours instead of the standard cycle",
  },
  {
    name: "Discovery boost",
    who: "Provider",
    when: "Per campaign",
    price: "From 250 Br",
    note: "Labelled placement — never above a safety warning",
  },
  {
    name: "Job guarantee",
    who: "Customer",
    when: "High-value jobs, later",
    price: "Planned",
    note: "Optional cover on top of escrow",
  },
];

const NEVER = [
  "Sell your personal data or your job history.",
  "Let a paid boost hide a provider with a low trust score.",
  "Charge a customer to see a provider's rating or breakdown.",
  "Take a fee on a job that was cancelled or never funded.",
];

const FAQS = [
  {
    q: "When exactly is the fee taken?",
    a: "At the moment escrow releases — that is, after the provider marks the job complete and the customer confirms it. If a contract never reaches completed, no fee is charged to anyone.",
  },
  {
    q: "Who pays it, the customer or the provider?",
    a: "It comes out of the released amount, so the provider carries it. The price a customer sees on the booking screen is the price they pay; there is no fee added on top at checkout.",
  },
  {
    q: "What happens to my money during a dispute?",
    a: "It stays in escrow. Nothing is released to the provider and nothing is refunded automatically — a person reviews the contract and releases it one way or the other.",
  },
  {
    q: "How do I actually pay?",
    a: "Through Chapa's hosted checkout, which supports the local cards and mobile money people already use. Card details never pass through Zeyla.",
  },
  {
    q: "Is this pricing final?",
    a: `Not yet. Eight percent is the pilot rate; the working range is ${FEE_RANGE_LABEL.toLowerCase()} as we learn what different trades can carry. Anyone onboarded during the pilot keeps the rate they joined on for their first three months.`,
  },
];

function FeeCalculator() {
  const [jobValue, setJobValue] = useState(2500);
  const fee = jobValue * ESCROW_FEE_RATE;

  return (
    <div className="zm-calc">
      <div>
        <label className="zm-calc-label" htmlFor="zm-job-value">
          <span>Job value</span>
          <output htmlFor="zm-job-value">{birr(jobValue)}</output>
        </label>
        <input
          id="zm-job-value"
          className="zm-range"
          type="range"
          min={200}
          max={20000}
          step={100}
          value={jobValue}
          onChange={(event) => setJobValue(Number(event.target.value))}
        />
        <div className="zm-range-ticks">
          <span>200 Br</span>
          <span>20,000 Br</span>
        </div>
        <p className="zm-note">
          Drag to a job you would actually book. A tap repair sits near the bottom of
          this range; a full move or a rewiring job sits near the top.
        </p>
      </div>

      <div className="zm-calc-out">
        <div className="zm-calc-line">
          <span>Customer pays</span>
          <strong>{birr(jobValue)}</strong>
        </div>
        <div className="zm-calc-line">
          <span>Held in escrow</span>
          <strong>{birr(jobValue)}</strong>
        </div>
        <div className="zm-calc-line">
          <span>Zeyla fee ({Math.round(ESCROW_FEE_RATE * 100)}%)</span>
          <strong>−{birr(fee)}</strong>
        </div>
        <div className="zm-calc-line total">
          <span>Provider receives</span>
          <strong>{birr(jobValue - fee)}</strong>
        </div>
      </div>
    </div>
  );
}

export function PricingPage() {
  return (
    <MarketingLayout>
      <Hero
        badge="Pricing"
        note="Pilot rates"
        title={
          <>
            Free to hire.
            <br />
            We earn when the job is done.
          </>
        }
        actions={
          <>
            <PrimaryLink to="/onboarding">Get started free</PrimaryLink>
            <GhostLink to="/providers">Provider details</GhostLink>
          </>
        }
      >
        Customers never pay Zeyla anything. Providers pay a single percentage the
        moment escrow releases — which means we only get paid when work is finished
        and everyone is satisfied.
      </Hero>

      <Section>
        <div className="zm-plans">
          {PLANS.map((plan) => (
            <article
              key={plan.name}
              className={`zm-plan zm-reveal${plan.featured ? " zm-plan-featured" : ""}`}
            >
              <span className="zm-plan-tag">{plan.tag}</span>
              <h3>{plan.name}</h3>
              <p className="zm-plan-price">
                <strong>{plan.price}</strong>
              </p>
              <span className="zm-plan-sub">{plan.sub}</span>
              <ul className="zm-list">
                {plan.points.map((point) => (
                  <li key={point}>
                    <CheckIcon />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <PrimaryLink to={plan.cta.to}>{plan.cta.label}</PrimaryLink>
            </article>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Calculator"
        title="What a job actually costs"
        intro="No hidden processing markup on the customer side. Move the slider to see how the release splits."
      >
        <FeeCalculator />
      </Section>

      <Section eyebrow="Add-ons" title="Everything else we charge for">
        <div className="zm-table-wrap">
          <table className="zm-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Who pays</th>
                <th>When</th>
                <th>Price</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {ADDONS.map((addon) => (
                <tr key={addon.name}>
                  <td>{addon.name}</td>
                  <td>{addon.who}</td>
                  <td>{addon.when}</td>
                  <td>{addon.price}</td>
                  <td style={{ color: "var(--zm-ink-50)" }}>{addon.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section eyebrow="Commitments" title="What we will never charge for" tight>
        <div className="zm-card">
          <ul className="zm-list">
            {NEVER.map((line) => (
              <li key={line}>
                <CrossIcon className="zm-never-mark" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section eyebrow="FAQ" title="The questions people actually ask">
        <div className="zm-faq">
          {FAQS.map((faq) => (
            <details key={faq.q}>
              <summary>{faq.q}</summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </Section>

      <CtaBand
        title="Nothing to pay until a job completes"
        body="Create an account, post your first request or set up your provider profile, and see how the escrow flow feels end to end."
        primary={{ to: "/onboarding", label: "Get started" }}
        secondary={{ to: "/use-cases", label: "See real jobs" }}
      />
    </MarketingLayout>
  );
}
