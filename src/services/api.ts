let accountRevision: number | undefined;
export function setAccountRevision(revision: number) {
  accountRevision = revision;
}

export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const requestedRevision = accountRevision;
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(requestedRevision !== undefined && method !== "GET"
        ? { "X-Account-Revision": String(requestedRevision) }
        : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      data && typeof data === "object" && "detail" in data ? data.detail : null;
    throw new Error(
      typeof detail === "string"
        ? detail
        : "Không thể xử lý yêu cầu. Kiểm tra máy chủ và thử lại.",
    );
  }
  if (method !== "GET" && requestedRevision !== accountRevision)
    throw new Error("Tài khoản đã đổi. Kết quả thao tác cũ đã được bỏ qua.");
  return data as T;
}
