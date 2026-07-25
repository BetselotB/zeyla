import { ChangeEvent, useState } from "react";

type IdCaptureFieldProps = {
  label: string;
  onCapture: (file: File | null) => void;
};

/** ID document: either pick from the gallery or open the device camera. */
export function IdCaptureField({ label, onCapture }: IdCaptureFieldProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
    onCapture(file);
  };

  const handleRemove = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    onCapture(null);
  };

  if (previewUrl) {
    return (
      <div className="onboarding__field">
        <span>{label}</span>
        <div className="onboarding__capture-preview">
          <img src={previewUrl} alt={`${label} preview`} />
        </div>
        <div className="onboarding__actions">
          <label className="onboarding__button onboarding__button--secondary">
            Retake
            <input required type="file" accept="image/*" capture="environment" onChange={handleFile} hidden />
          </label>
          <button className="onboarding__button onboarding__button--secondary" type="button" onClick={handleRemove}>
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding__field">
      <span>{label}</span>
      <div className="onboarding__actions">
        <label className="onboarding__button onboarding__button--secondary">
          Take photo
          <input required type="file" accept="image/*" capture="environment" onChange={handleFile} hidden />
        </label>
        <label className="onboarding__button onboarding__button--secondary">
          Choose file
          <input required type="file" accept="image/*,.pdf" onChange={handleFile} hidden />
        </label>
      </div>
    </div>
  );
}
