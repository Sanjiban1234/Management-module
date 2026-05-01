import { auth } from "./firebase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// safer response parser
async function parseResponse(response) {
  const text = await response.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const fallbackMessage = text?.trim() || `Request failed with status ${response.status}`;
    throw new Error(data?.error?.message || data?.message || fallbackMessage);
  }

  if (!data) {
    if (!text?.trim()) {
      return {};
    }

    throw new Error(`Server returned non-JSON response (status ${response.status}).`);
  }

  return data;
}

async function resolveAuthToken(explicitToken) {
  if (explicitToken) {
    return explicitToken;
  }

  if (!auth.currentUser) {
    return "";
  }

  try {
    return await auth.currentUser.getIdToken();
  } catch (error) {
    console.error("Failed to resolve Firebase ID token:", error);
    return "";
  }
}

export async function apiRequest(path, { method = "GET", body, token } = {}) {
  if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not configured.");
  }

  const authToken = await resolveAuthToken(token);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authToken && { Authorization: `Bearer ${authToken}` })
    },
    body: body ? JSON.stringify(body) : undefined
  });

  return parseResponse(response);
}
