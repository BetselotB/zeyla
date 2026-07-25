import { ChangeEvent, useEffect, useRef, useState } from "react";

type SelfieCaptureFieldProps = {
  onCapture: (file: File | null) => void;
};

/**
 * Selfie: camera-only. Uses getUserMedia for a live front-camera preview and
 * captures a still frame — no gallery picker, so users can't substitute a
 * photo of a photo. Falls back to a camera-hinted file input if getUserMedia
 * is unavailable (e.g. desktop without permissions).
 */
export function SelfieCaptureField({ onCapture }: SelfieCaptureFieldProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraReady(true);
    } catch {
      setCameraError("Camera access isn't available. Use the fallback capture button below.");
      setIsCameraReady(false);
    }
  };

  useEffect(() => {
    if (!previewUrl) startCamera();
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl]);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
      setPreviewUrl(URL.createObjectURL(blob));
      stopStream();
      onCapture(file);
    }, "image/jpeg");
  };

  const retake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    onCapture(null);
  };

  const handleFallbackFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
    onCapture(file);
  };

  if (previewUrl) {
    return (
      <div className="onboarding__field">
        <span>Selfie photo</span>
        <div className="onboarding__capture-preview onboarding__capture-preview--round">
          <img src={previewUrl} alt="Selfie preview" />
        </div>
        <button className="onboarding__button onboarding__button--secondary" type="button" onClick={retake}>
          Retake
        </button>
      </div>
    );
  }

  return (
    <div className="onboarding__field">
      <span>Selfie photo</span>
      {cameraError ? (
        <>
          <p className="onboarding__hint">{cameraError}</p>
          <label className="onboarding__button onboarding__button--secondary">
            Open camera
            <input required type="file" accept="image/*" capture="user" onChange={handleFallbackFile} hidden />
          </label>
        </>
      ) : (
        <>
          <div className="onboarding__camera-preview">
            <video ref={videoRef} muted playsInline />
          </div>
          <button className="onboarding__button" type="button" disabled={!isCameraReady} onClick={capture}>
            Capture selfie
          </button>
        </>
      )}
    </div>
  );
}
