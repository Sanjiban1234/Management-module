import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

export function QRScanner({ onScan, autoStart = false }) {
  const [isScanning, setIsScanning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState("");
  const [manualToken, setManualToken] = useState("");
  const html5QrCodeRef = useRef(null);
  const hasSubmittedScanRef = useRef(false);
  const autoStartedRef = useRef(false);
  const startInFlightRef = useRef(false);

  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current && isScanning) {
        html5QrCodeRef.current.stop().catch(() => {});
      }
    };
  }, [isScanning]);

  useEffect(() => {
    if (!autoStart || autoStartedRef.current) {
      return;
    }

    autoStartedRef.current = true;
    setTimeout(() => {
      startScanner();
    }, 120);
  }, [autoStart]);

  async function startScanner() {
    if (startInFlightRef.current) {
      return;
    }

    startInFlightRef.current = true;
    setIsStarting(true);
    setError("");
    hasSubmittedScanRef.current = false;

    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode("qr-reader");
      }

      // Ensure preview container is visible before scanner starts.
      setIsScanning(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));

      const cameras = await Html5Qrcode.getCameras();
      const rearCamera =
        cameras?.find((camera) =>
          /back|rear|environment|wide|ultra/i.test(camera.label || "")
        ) || cameras?.[cameras.length - 1];

      const tryConfigs = [
        rearCamera?.id,
        { facingMode: "environment" },
        cameras?.[0]?.id,
        { facingMode: "user" }
      ].filter(Boolean);

      let started = false;
      let lastError = null;

      for (const config of tryConfigs) {
        try {
          await html5QrCodeRef.current.start(
            config,
            {
              fps: 12,
              qrbox: { width: 280, height: 280 },
              aspectRatio: 1
            },
            (decodedText) => {
              if (hasSubmittedScanRef.current) {
                return;
              }
              hasSubmittedScanRef.current = true;
              stopScanner();
              onScan(decodedText);
            },
            () => {
              // ignore scan errors, they happen continuously until a QR code is found
            }
          );
          started = true;
          break;
        } catch (configError) {
          lastError = configError;
        }
      }

      if (!started) {
        throw lastError || new Error("Unable to access camera for QR scanning.");
      }
    } catch (scanError) {
      setIsScanning(false);
      const message =
        typeof scanError === "string"
          ? scanError
          : scanError?.message || "Unable to start QR scanner.";
      setError(
        message.toLowerCase().includes("permission")
          ? "Camera permission denied. Please allow camera access and try again."
          : message
      );
    } finally {
      startInFlightRef.current = false;
      setIsStarting(false);
    }
  }

  function stopScanner() {
    if (html5QrCodeRef.current && isScanning) {
      html5QrCodeRef.current.stop().then(() => {
        setIsScanning(false);
      }).catch((err) => {
        console.error("Failed to stop scanner", err);
        setIsScanning(false);
      });
    } else {
      setIsScanning(false);
    }
  }

  function handleManualSubmit(event) {
    event.preventDefault();
    if (!manualToken.trim()) {
      return;
    }
    onScan(manualToken.trim());
    setManualToken("");
  }

  return (
    <section className="panel">
      <div className="section-head">
        <h3>Scan Attendance QR</h3>
      </div>
      <p className="muted">
        Use camera scanning, or paste the QR token manually.
      </p>
      <div className="scanner-box">
        <div id="qr-reader" style={{ width: "100%", maxWidth: "500px", margin: "0 auto", display: isScanning ? 'block' : 'none' }}></div>
        {!isScanning && (
          <div style={{ padding: "40px 0", textAlign: "center", backgroundColor: "var(--background-alt)", borderRadius: "var(--radius-md)" }}>
            <p className="muted">{isStarting ? "Starting camera..." : "Camera is offline"}</p>
          </div>
        )}
      </div>
      <div className="scanner-actions" style={{ marginTop: "1rem", display: "flex", justifyContent: "center" }}>
        {!isScanning ? (
          <button className="primary-button" type="button" onClick={startScanner} disabled={isStarting}>
            {isStarting ? "Starting..." : autoStart ? "Retry Camera Scan" : "Start Camera Scan"}
          </button>
        ) : (
          <button className="secondary-button" type="button" onClick={stopScanner}>
            Stop Scan
          </button>
        )}
      </div>
      {error ? <p className="error-text" style={{ marginTop: "1rem" }}>{error}</p> : null}
      <form className="inline-form" onSubmit={handleManualSubmit} style={{ marginTop: "1rem" }}>
        <input
          value={manualToken}
          onChange={(event) => setManualToken(event.target.value)}
          placeholder="Paste QR token"
          type="text"
        />
        <button className="secondary-button" type="submit">
          Submit Token
        </button>
      </form>
    </section>
  );
}
