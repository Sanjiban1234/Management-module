export function formatDate(value) {
  if (!value) {
    return "N/A";
  }

  return new Date(value).toLocaleString();
}

export function formatDateOnly(value) {
  if (!value) {
    return "N/A";
  }

  // If it's already a full ISO string, just take the date part
  const datePart = value.includes("T") ? value.split("T")[0] : value;
  const date = new Date(`${datePart}T00:00:00Z`);
  
  if (isNaN(date.getTime())) {
    return "Invalid Date";
  }

  return date.toLocaleDateString();
}

export function maskToken(token) {
  if (!token || token.length < 12) {
    return token || "N/A";
  }

  return `${token.slice(0, 6)}...${token.slice(-6)}`;
}

export function getStatusTone(status) {
  switch (status) {
    case "active":
    case "paid":
      return "good";
    case "pending":
      return "warn";
    case "overdue":
    case "completed":
      return "neutral";
    default:
      return "neutral";
  }
}

