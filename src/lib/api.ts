let csrfToken = "";
const unauthorizedListeners = new Set<() => void>();

export function onUnauthorized(listener: () => void) {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

export function setCsrfToken(token: string) {
  csrfToken = token;
}

export function clearCsrfToken() {
  csrfToken = "";
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(csrfToken && !["GET", "HEAD"].includes(init.method ?? "GET")
        ? { "x-csrf-token": csrfToken }
        : {}),
      ...init.headers,
    },
  });
  const data = (await response.json()) as T & {
    error?: string;
    csrf?: string;
  };
  if (data.csrf) setCsrfToken(data.csrf);
  if (!response.ok) {
    if (response.status === 401 && path.startsWith("/admin/")) {
      clearCsrfToken();
      unauthorizedListeners.forEach((listener) => listener());
    }
    throw Object.assign(new Error(data.error || "Anfrage fehlgeschlagen."), {
      data,
      status: response.status,
    });
  }
  return data;
}
