export async function apiFetch(path: string, options: RequestInit = {}) {
  const tokenRes = await fetch("/api/auth/token");
  const { accessToken } = await tokenRes.json();

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}