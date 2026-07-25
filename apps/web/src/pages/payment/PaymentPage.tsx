import { FormEvent, useEffect, useState } from "react";
import "./PaymentPage.css";

type ContractStatus = "awaiting_escrow" | "escrowed" | "active" | "completed" | "disputed";

type ApiResponse<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

type CheckoutData = {
  contractId: string;
  checkoutUrl: string;
  status: ContractStatus;
};

type ContractData = {
  id: string;
  status: ContractStatus;
};

const statusLabels: Record<ContractStatus, string> = {
  awaiting_escrow: "Waiting for escrow funding",
  escrowed: "Funds held in escrow",
  active: "Work in progress",
  completed: "Work completed",
  disputed: "Payment disputed",
};

const apiUrl = (path: string) => `${import.meta.env.VITE_API_URL ?? ""}${path}`;

async function api<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(apiUrl(path), options);
  return response.json() as Promise<ApiResponse<T>>;
}

export function PaymentPage() {
  const [contractId, setContractId] = useState<string | null>(null);
  const [status, setStatus] = useState<ContractStatus>("awaiting_escrow");
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ demoMode: boolean }>("/api/escrow/state-machine")
      .then((response) => setIsDemoMode(response.data?.demoMode ?? false))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedContractId = params.get("contract");
    if (params.get("payment") !== "return" || !returnedContractId) return;

    setContractId(returnedContractId);
    setMessage("We received your return from checkout. Confirming the escrow status…");
    api<ContractData>(`/api/escrow/contracts/${returnedContractId}`)
      .then((response) => {
        if (response.success && response.data) {
          setStatus(response.data.status);
          setMessage("Your escrow status is up to date.");
        } else {
          setMessage("Payment submitted. Escrow confirmation may take a moment.");
        }
      })
      .catch(() => setMessage("Payment submitted. Escrow confirmation may take a moment."));
  }, []);

  const fundEscrow = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const amount = Number(formData.get("amount"));
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    const returnUrl = `${window.location.origin}${window.location.pathname}?payment=return`;
    try {
      const response = await api<CheckoutData>("/api/escrow/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: formData.get("providerId"),
          description: formData.get("description"),
          amount,
          currency: "ETB",
          returnUrl,
        }),
      });

      if (response.success && response.data?.checkoutUrl) {
        window.location.assign(response.data.checkoutUrl);
        return;
      }

      if (!isDemoMode) {
        throw new Error(response.error ?? "Checkout is not available yet.");
      }

      const demoContractId = `demo-${Date.now()}`;
      setContractId(demoContractId);
      setStatus("awaiting_escrow");
      setMessage("Demo checkout prepared. Use the simulation below to return from hosted checkout.");
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to create checkout.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const simulateCheckoutReturn = async () => {
    if (!contractId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await api("/api/escrow/webhooks/chapa", { method: "POST" });
      window.history.replaceState({}, "", `${window.location.pathname}?payment=return&contract=${contractId}`);
      setStatus("escrowed");
      setMessage("Demo payment confirmed. Funds are now held in escrow.");
    } catch {
      setError("The demo payment could not be confirmed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const releaseEscrow = async () => {
    if (!contractId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await api(`/api/escrow/contracts/${contractId}/release`, { method: "POST" });
      if (!response.success) throw new Error(response.error ?? "Payout is not available yet.");
      setStatus("completed");
      setMessage("Funds have been released to the provider.");
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : "Unable to release funds.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="payment">
      <header className="payment__intro">
        <p className="payment__eyebrow">Secure escrow</p>
        <h1 className="payment__title">Pay when the work is agreed</h1>
        <p className="lede">Your payment is held in escrow until the service is complete.</p>
      </header>

      <div className="payment__grid">
        <section className="payment__card">
          <h2>Fund a service</h2>
          {error && <p className="payment__notice payment__notice--error" role="alert">{error}</p>}
          {message && <p className="payment__notice" role="status">{message}</p>}
          <form className="payment__form" onSubmit={fundEscrow}>
            <label className="payment__field">Provider ID
              <input required name="providerId" placeholder="Provider ID from your booking" />
            </label>
            <label className="payment__field">What are you paying for?
              <textarea required name="description" maxLength={300} placeholder="For example: kitchen sink repair" />
            </label>
            <label className="payment__field">Agreed amount (ETB)
              <input required name="amount" type="number" min="1" step="0.01" inputMode="decimal" />
            </label>
            <button className="payment__button" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Preparing checkout…" : "Continue to Chapa checkout"}
            </button>
          </form>
          <p className="payment__hint">You will be redirected to Chapa’s hosted checkout. Zeyla does not collect card or wallet credentials.</p>
        </section>

        <section className="payment__card">
          <h2>Escrow status</h2>
          <div className="payment__status">
            <span className="payment__status-icon">{status === "escrowed" || status === "completed" ? "✓" : "i"}</span>
            <div><strong>{statusLabels[status]}</strong><p>{contractId ? `Contract: ${contractId}` : "Create a checkout to begin funding."}</p></div>
          </div>
          <ol className="payment__timeline">
            {(["awaiting_escrow", "escrowed", "active", "completed"] as ContractStatus[]).map((item) => (
              <li className={status === item ? "is-current" : ""} key={item}>{statusLabels[item]}</li>
            ))}
          </ol>
          {isDemoMode && contractId && status === "awaiting_escrow" && (
            <button className="payment__button payment__button--secondary" disabled={isSubmitting} type="button" onClick={simulateCheckoutReturn}>
              Simulate hosted checkout return
            </button>
          )}
          {contractId && status === "completed" && <p className="payment__notice">The provider has been paid.</p>}
          {contractId && status === "active" && (
            <button className="payment__button" disabled={isSubmitting} type="button" onClick={releaseEscrow}>Release funds</button>
          )}
        </section>
      </div>
    </main>
  );
}
