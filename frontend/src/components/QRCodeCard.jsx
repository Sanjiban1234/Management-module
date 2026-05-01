import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QRCodeCard({ value, title }) {
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    let active = true;

    async function renderCode() {
      if (!value) {
        setImageUrl("");
        return;
      }

      const url = await QRCode.toDataURL(value, {
        margin: 1,
        width: 220,
        color: {
          dark: "#102116",
          light: "#f8faf5"
        }
      });

      if (active) {
        setImageUrl(url);
      }
    }

    renderCode();

    return () => {
      active = false;
    };
  }, [value]);

  return (
    <section className="panel qr-card">
      <div className="section-head">
        <h3>{title}</h3>
      </div>
      {imageUrl ? <img src={imageUrl} alt="QR code" className="qr-image" /> : <p>No QR token found.</p>}
      <code className="token-block">{value || "No token available"}</code>
    </section>
  );
}

