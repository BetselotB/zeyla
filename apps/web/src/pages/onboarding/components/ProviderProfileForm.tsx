import { ChangeEvent, FormEvent, useState } from "react";
import type { ProviderProfilePayload } from "../types";

const CATEGORIES = ["Home repairs", "Cleaning", "Beauty and wellness", "Lessons and tutoring", "Other"];
const SUB_CITIES = [
  "Addis Ketema",
  "Akaky Kaliti",
  "Arada",
  "Bole",
  "Gullele",
  "Kirkos",
  "Kolfe Keranio",
  "Lideta",
  "Nifas Silk-Lafto",
  "Yeka",
];

type ProviderProfileFormProps = {
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (payload: ProviderProfilePayload, photo: File | null) => void;
  onSkip: () => void;
};

/** Gated behind KYC verified status — only rendered once identity is verified. */
export function ProviderProfileForm({ isSubmitting, error, onSubmit, onSkip }: ProviderProfileFormProps) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handlePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const errors: Record<string, string> = {};

    const fullName = String(formData.get("fullName") ?? "").trim();
    const businessName = String(formData.get("businessName") ?? "").trim();
    const category = String(formData.get("category") ?? "");
    const subCity = String(formData.get("subCity") ?? "");
    const phone = String(formData.get("phone") ?? "").trim();
    const bio = String(formData.get("bio") ?? "").trim();
    const experienceYears = Number(formData.get("experienceYears"));
    const min = Number(priceMin);
    const max = Number(priceMax);

    if (!fullName) errors.fullName = "Full name is required.";
    if (!businessName) errors.businessName = "Business name is required.";
    if (!category) errors.category = "Choose a service category.";
    if (!subCity) errors.subCity = "Choose a sub-city.";
    if (!phone) errors.phone = "Phone number is required.";
    if (!bio) errors.bio = "Tell customers about your service.";
    if (!Number.isFinite(experienceYears) || experienceYears < 0) errors.experienceYears = "Enter a valid number of years.";
    if (!priceMin || !priceMax || min < 0 || max < min) errors.priceRange = "Enter a valid price range.";

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    onSubmit(
      { fullName, businessName, category, subCity, phone, bio, experienceYears, priceRangeMin: min, priceRangeMax: max },
      photo,
    );
  };

  return (
    <form className="onboarding__form" onSubmit={handleSubmit}>
      <p className="onboarding__hint">Set up your provider profile so customers can find and book you.</p>

      <div className="onboarding__field">
        <span>Profile photo</span>
        <div className="onboarding__photo-picker">
          {photoPreview && <img src={photoPreview} alt="Profile preview" />}
          <label className="onboarding__button onboarding__button--secondary">
            {photoPreview ? "Change photo" : "Add photo"}
            <input type="file" accept="image/*" onChange={handlePhoto} hidden />
          </label>
        </div>
      </div>

      <label className="onboarding__field">
        Full name
        <input required name="fullName" autoComplete="name" />
        {fieldErrors.fullName && <span className="onboarding__field-error">{fieldErrors.fullName}</span>}
      </label>

      <label className="onboarding__field">
        Business name
        <input required name="businessName" />
        {fieldErrors.businessName && <span className="onboarding__field-error">{fieldErrors.businessName}</span>}
      </label>

      <label className="onboarding__field">
        Service category
        <select required name="category" defaultValue="">
          <option value="" disabled>Select a category</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
        {fieldErrors.category && <span className="onboarding__field-error">{fieldErrors.category}</span>}
      </label>

      <label className="onboarding__field">
        Sub-city
        <select required name="subCity" defaultValue="">
          <option value="" disabled>Select a sub-city</option>
          {SUB_CITIES.map((subCity) => (
            <option key={subCity} value={subCity}>{subCity}</option>
          ))}
        </select>
        {fieldErrors.subCity && <span className="onboarding__field-error">{fieldErrors.subCity}</span>}
      </label>

      <label className="onboarding__field">
        Phone number
        <input required name="phone" type="tel" placeholder="+251 9 12 345 678" />
        {fieldErrors.phone && <span className="onboarding__field-error">{fieldErrors.phone}</span>}
      </label>

      <label className="onboarding__field">
        Years of experience
        <input required name="experienceYears" type="number" min="0" max="60" />
        {fieldErrors.experienceYears && <span className="onboarding__field-error">{fieldErrors.experienceYears}</span>}
      </label>

      <div className="onboarding__field">
        <span>Price range (ETB)</span>
        <div className="onboarding__price-range">
          <input required type="number" min="0" placeholder="Min" value={priceMin} onChange={(event) => setPriceMin(event.target.value)} />
          <input required type="number" min="0" placeholder="Max" value={priceMax} onChange={(event) => setPriceMax(event.target.value)} />
        </div>
        {fieldErrors.priceRange && <span className="onboarding__field-error">{fieldErrors.priceRange}</span>}
      </div>

      <label className="onboarding__field">
        About your service
        <textarea required name="bio" maxLength={500} placeholder="Describe your experience and what customers can expect." />
        {fieldErrors.bio && <span className="onboarding__field-error">{fieldErrors.bio}</span>}
      </label>

      {error && (
        <p className="onboarding__notice onboarding__notice--error" role="alert">
          {error}
        </p>
      )}

      <div className="onboarding__actions">
        <button className="onboarding__button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Creating profile…" : "Create provider profile"}
        </button>
        <button className="onboarding__button onboarding__button--secondary" type="button" onClick={onSkip}>
          Not now
        </button>
      </div>
    </form>
  );
}
