import {
  CtaBand,
  GhostLink,
  Hero,
  MarketingLayout,
  PrimaryLink,
  Section,
} from "./components/MarketingLayout.js";
import { LiveProviders } from "./components/LiveProviders.js";
import {
  BadgeIcon,
  BoltIcon,
  CheckIcon,
  ClockIcon,
  PinIcon,
  StarIcon,
  WalletIcon,
} from "./components/icons.js";
import { CATEGORIES, TRUST_ROWS } from "./content.js";

const VALUE = [
  {
    icon: <WalletIcon />,
    title: "The money is already there",
    body: "A job only reaches you once the customer has funded escrow. You are never deciding whether to start work on a promise.",
  },
  {
    icon: <BoltIcon />,
    title: "Work finds you",
    body: "Requests near you arrive in realtime with the category, the urgency, and the neighbourhood already sorted out.",
  },
  {
    icon: <BadgeIcon />,
    title: "Reputation you own",
    body: "Your score is built from completed contracts and real reviews. It stays with you when you change neighbourhood or trade.",
  },
  {
    icon: <ClockIcon />,
    title: "No chasing payment",
    body: "Mark the job complete, the customer confirms, and the payout goes out. No follow-up calls a week later.",
  },
];

const STEPS = [
  { title: "Create your account", body: "Phone number, email, or Google. Takes under a minute." },
  { title: "Verify who you are", body: "Upload an ID document and a selfie. This is what unlocks matching." },
  { title: "Build your profile", body: "Your trade, years of experience, price range, languages, and where you work." },
  { title: "Go online", body: "Turn availability on and start receiving pings from customers nearby." },
];

const RULES = [
  "Escrow means you can turn down “I'll pay you after” without losing the job.",
  "Flags are reviewed, not automatic — one angry customer cannot erase your score.",
  "Your phone number stays hidden until a customer's ping is accepted.",
  "Boosted placement is labelled as such, and never buries a higher-trust provider.",
];

export function ProvidersPage() {
  return (
    <MarketingLayout>
      <Hero
        badge="For providers"
        note="Free to join"
        title={
          <>
            Get paid for every job
            <br />
            you actually finish.
          </>
        }
        actions={
          <>
            <PrimaryLink to="/onboarding">Become a provider</PrimaryLink>
            <GhostLink to="/pricing">What it costs</GhostLink>
          </>
        }
      >
        Zeyla brings you customers nearby who have already put the money aside. You
        keep a trust score that grows with every completed contract — and it belongs
        to you, not to a group chat.
      </Hero>

      <Section eyebrow="Why join" title="What changes on your side of the job" center>
        <div className="zm-grid zm-grid-4">
          {VALUE.map((item) => (
            <article key={item.title} className="zm-card zm-card-hover zm-reveal">
              <span className="zm-icon zm-icon-green">{item.icon}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Getting started"
        title="Four steps to your first ping"
        intro="Everything happens in the browser on your phone. There is no app to download and nothing to pay up front."
      >
        <div className="zm-steps">
          {STEPS.map((step, index) => (
            <article key={step.title} className="zm-step">
              <span className="zm-step-num">{index + 1}</span>
              <h4>{step.title}</h4>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Trust score"
        title="Exactly how your number is calculated"
        intro="No secret ranking. This is the whole formula, and every change is logged with a reason you can read."
      >
        <div className="zm-score">
          <div className="zm-score-ring">
            <strong>85</strong>
            <span>Trust</span>
          </div>
          <dl className="zm-score-rows">
            {TRUST_ROWS.map((row) => (
              <div key={row.label} className="zm-score-row">
                <dt>{row.label}</dt>
                <dd className={row.tone}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="zm-note">
          85 is a provider with a verified ID, a dozen finished jobs, and a 4.5 average
          rating. Customers can open this same breakdown before they book you.
        </p>
      </Section>

      <Section eyebrow="Live" title="Providers on Zeyla today">
        <LiveProviders />
      </Section>

      <Section eyebrow="Trades" title="What people are hiring for">
        <div className="zm-pills">
          {CATEGORIES.map((category) => (
            <span key={category.slug} className="zm-pill">
              <PinIcon />
              {category.label}
            </span>
          ))}
        </div>
        <p className="zm-note">
          Plumbing, electrical, and cleaning are the densest categories in the pilot
          neighbourhoods. If your trade is not listed, join under “Something else” —
          categories follow demand.
        </p>
      </Section>

      <Section eyebrow="Fair play" title="The rules we hold ourselves to" tight>
        <div className="zm-card">
          <span className="zm-icon zm-icon-green">
            <StarIcon />
          </span>
          <ul className="zm-list">
            {RULES.map((rule) => (
              <li key={rule}>
                <CheckIcon />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <CtaBand
        title="Start taking funded jobs"
        body="Set up your profile, verify your ID, and go online. You only pay when a job completes and the money is already in your hand."
        primary={{ to: "/onboarding", label: "Become a provider" }}
        secondary={{ to: "/product", label: "How Zeyla works" }}
      />
    </MarketingLayout>
  );
}
