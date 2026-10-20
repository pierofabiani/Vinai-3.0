// Chiamate all'api: JSON in, JSON out, errori con il messaggio del server in italiano.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; form?: FormData } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (init.form) body = init.form;
  else if (init.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? (body ? "POST" : "GET"),
      headers,
      body,
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, "Server non raggiungibile: controlla la connessione");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Errore ${res.status}`);
  return data as T;
}
