/**
 * Shown when the page is opened without a booking reference (providerId +
 * amount). Heading and supporting copy live in the page hero.
 */
export function EmptyBookingState() {
  return (
    <div className="payment__form">
      <a className="payment__button" href="/discovery">
        Find a provider
      </a>
    </div>
  );
}
