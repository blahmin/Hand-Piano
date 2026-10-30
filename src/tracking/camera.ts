export async function openCamera(): Promise<MediaStream> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "Camera access needs localhost or HTTPS. You can still play with the keys below.",
    );
  }
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30, max: 30 },
      facingMode: "user",
    },
  });
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function cameraError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError")
      return "Camera permission was declined. Allow it in your browser’s site settings and try again, or play with your keyboard.";
    if (error.name === "NotFoundError")
      return "No webcam found. Connect a camera and try again, or use the piano keys below.";
    if (error.name === "NotReadableError")
      return "The camera is busy. Close other camera apps and try again. Keyboard mode is ready.";
  }
  return error instanceof Error
    ? error.message
    : "The camera could not start. Try again or use keyboard mode.";
}
