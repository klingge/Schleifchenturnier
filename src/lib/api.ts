let csrfToken = "";

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
    throw Object.assign(new Error(data.error || "Anfrage fehlgeschlagen."), {
      data,
      status: response.status,
    });
  }
  return data;
}
