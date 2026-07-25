import {
  CtaBand,
  GhostLink,
  Hero,
  MarketingLayout,
  PrimaryLink,
  Section,
} from "./components/MarketingLayout.js";
import {
  BadgeIcon,
  CheckIcon,
  CrossIcon,
  LockIcon,
  MicIcon,
  PinIcon,
  RouteIcon,
  ShieldIcon,
  StarIcon,
  WalletIcon,
} from "./components/icons.js";
import { CONTRACT_STATES } from "./content.js";

const PILLARS = [
  {
    icon: <PinIcon />,
    title: "Discover with confidence",
    body: "Providers near you, ranked by a trust score you can open and read line by line — not by who paid for the top slot.",
  },
  {
    icon: <LockIcon />,
    title: "Pay with protection",
    body: "Your money leaves your account but not to the provider. It sits in escrow until the job is finished and you say so.",
  },
  {
    icon: <StarIcon />,
    title: "Reputation that compounds",
    body: "Every completed job, review, and flag moves a score that follows the provider across the whole marketplace.",
  },
];

const LOOP = [
  { title: "Describe the problem", body: "Type it, or say it in Amharic or Afaan Oromo. Zeyla turns it into a category, an urgency, and a location." },
  { title: "See who is nearby", body: "A radius search over verified providers, sorted by trust, with distance and price range on every card." },
  { title: "Ping and get accepted", body: "The request goes straight to the provider's phone. Acceptance is realtime — no waiting on a callback." },
  { title: "Fund escrow", body: "Pay through Chapa's hosted checkout. The contract moves to escrowed and the provider knows the money is real." },
  { title: "Track the arrival", body: "The provider's location streams to your map while the job is active, so you know whether to keep waiting." },
  { title: "Complete and release", body: "You confirm the work is done, the payout goes out, and the contract closes." },
  { title: "Review honestly", body: "Rate the job by text or voice. A flag is available when something genuinely went wrong." },
  { title: "The score updates", body: "The provider's trust score recomputes with a logged reason, so the next customer sees what you saw." },
];

const LAYERS = [
  {
    icon: <ShieldIcon />,
    eyebrow: "Trust layer",
    title: "Know who is coming to your door",
    points: [
      "Phone OTP, email, or Google sign-in",
      "ID document and selfie on file before a provider can be matched",
      "Trust score explained in plain language, not a mystery number",
      "Reviews and flags that both move the score",
    ],
  },
  {
    icon: <WalletIcon />,
    eyebrow: "Money layer",
    title: "Neither side has to go first",
    points: [
      "Chapa hosted checkout — no card details touch Zeyla",
      "Funds held against the contract, not the provider's balance",
      "Payout fires on completion, not on a promise",
      "Disputes freeze the money and go to a human before anything moves",
    ],
  },
  {
    icon: <RouteIcon />,
    eyebrow: "Experience layer",
    title: "Built for how the job actually goes",
    points: [
      "Voice input for people who would rather talk than type",
      "Live location while the contract is active",
      "Realtime ping and accept over sockets",
      "Works as a phone-first PWA — nothing to install",
    ],
  },
];

const COMPARISON = [
  { feature: "Verified identity", zeyla: true, telegram: false, social: false, referral: false },
  { feature: "Payment held until done", zeyla: true, telegram: false, social: false, referral: false },
  { feature: "Portable trust score", zeyla: true, telegram: false, social: false, referral: false },
  { feature: "Live arrival tracking", zeyla: true, telegram: false, social: false, referral: false },
  { feature: "Reviews tied to real jobs", zeyla: true, telegram: false, social: true, referral: false },
  { feature: "Someone to appeal to", zeyla: true, telegram: false, social: false, referral: true },
];

function Mark({ on }: { on: boolean }) {
  return on ? (
    <span className="zm-yes">
      <CheckIcon /> Yes
    </span>
  ) : (
    <span className="zm-no">
      <CrossIcon /> No
    </span>
  );
}

export function ProductPage() {
  return (
    <MarketingLayout>
      <Hero
        badge="Product"
        note="Trust · Escrow · Reputation"
        title={
          <>
            Hiring someone nearby
            <br />
            should not be a gamble.
          </>
        }
        actions={
          <>
            <PrimaryLink to="/onboarding">Try Zeyla</PrimaryLink>
            <GhostLink to="/use-cases">See it on a real job</GhostLink>
          </>
        }
      >
        Zeyla finds a verified provider near you, holds your payment in escrow until
        the work is finished, and turns every completed job into reputation that the
        next customer can actually read.
      </Hero>

      <Section eyebrow="Pillars" title="Three things the product has to get right" center>
        <div className="zm-grid zm-grid-3">
          {PILLARS.map((pillar) => (
            <article key={pillar.title} className="zm-card zm-card-hover zm-reveal">
              <span className="zm-icon zm-icon-green">{pillar.icon}</span>
              <h3>{pillar.title}</h3>
              <p>{pillar.body}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="The loop"
        title="From “my pipe burst” to a paid, reviewed job"
        intro="Eight steps. The customer never pays a stranger up front and the provider never works on a promise."
      >
        <div className="zm-steps">
          {LOOP.map((step, index) => (
            <article key={step.title} className="zm-step">
              <span className="zm-step-num">{index + 1}</span>
              <h4>{step.title}</h4>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Escrow"
        title="Where your money actually is"
        intro="Every booking is a contract with a state you can see. Money only moves on the last transition."
      >
        <div className="zm-states">
          {CONTRACT_STATES.map((state, index) => (
            <span key={state.name} style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
              <span className={`zm-state ${state.tone}`} title={state.caption}>
                <span className="zm-state-dot" />
                {state.name}
              </span>
              {index < CONTRACT_STATES.length - 1 && <span className="zm-state-arrow">→</span>}
            </span>
          ))}
          <span className="zm-state zm-state-disputed">
            <span className="zm-state-dot" />
            disputed
          </span>
          <p className="zm-states-note">
            A dispute can be raised at any point after funding. It parks the money and
            hands the decision to a person — nothing is auto-released to either side.
          </p>
        </div>
      </Section>

      <Section eyebrow="Under the hood" title="What we built">
        <div className="zm-grid zm-grid-3">
          {LAYERS.map((layer) => (
            <article key={layer.title} className="zm-card zm-reveal">
              <span className="zm-icon">{layer.icon}</span>
              <span className="zm-eyebrow" style={{ margin: 0 }}>
                {layer.eyebrow}
              </span>
              <h3>{layer.title}</h3>
              <ul className="zm-list">
                {layer.points.map((point) => (
                  <li key={point}>
                    <CheckIcon />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Alternatives"
        title="Against how people hire today"
        intro="The competition is not another app. It is a group chat and a stack of cash."
      >
        <div className="zm-table-wrap">
          <table className="zm-table">
            <thead>
              <tr>
                <th>What you get</th>
                <th className="zm-col-us">Zeyla</th>
                <th>Telegram group</th>
                <th>Social listings</th>
                <th>Word of mouth</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.feature}>
                  <td>{row.feature}</td>
                  <td className="zm-col-us">
                    <Mark on={row.zeyla} />
                  </td>
                  <td>
                    <Mark on={row.telegram} />
                  </td>
                  <td>
                    <Mark on={row.social} />
                  </td>
                  <td>
                    <Mark on={row.referral} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section eyebrow="Also in the box" title="Small things that matter on the day" tight>
        <div className="zm-grid zm-grid-4">
          <article className="zm-card">
            <span className="zm-icon">
              <MicIcon />
            </span>
            <h3>Speak, don't type</h3>
            <p>Amharic and Afaan Oromo speech becomes a structured request.</p>
          </article>
          <article className="zm-card">
            <span className="zm-icon">
              <BadgeIcon />
            </span>
            <h3>Verified badges</h3>
            <p>KYC state is shown honestly — submitted is not the same as verified.</p>
          </article>
          <article className="zm-card">
            <span className="zm-icon">
              <RouteIcon />
            </span>
            <h3>Live arrival</h3>
            <p>A moving pin instead of five “where are you?” phone calls.</p>
          </article>
          <article className="zm-card">
            <span className="zm-icon">
              <StarIcon />
            </span>
            <h3>Reviews that count</h3>
            <p>Only a completed contract can leave one, so ratings can't be farmed.</p>
          </article>
        </div>
      </Section>

      <CtaBand
        title="Hire someone you can actually check"
        body="Create an account, describe the problem, and see who is available near you in the next few minutes."
        primary={{ to: "/onboarding", label: "Get started" }}
        secondary={{ to: "/pricing", label: "See pricing" }}
      />
    </MarketingLayout>
  );
}
