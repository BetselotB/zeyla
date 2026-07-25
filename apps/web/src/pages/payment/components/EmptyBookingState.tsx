/** Shown when the page is opened without a booking reference (providerId + amount). */
export function EmptyBookingState() {
  return (
    <div className="payment__form">
      <p className="payment__hint">Select a service to book before funding escrow.</p>
    </div>
  );
}
