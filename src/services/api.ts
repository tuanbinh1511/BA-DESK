const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export type ConnectionStatus = "connecting" | "connected" | "offline" | "forbidden";
let connectionStatus: ConnectionStatus = "connecting";
const listeners = new Set<() => void>();
export const getConnectionStatus = () => connectionStatus;
export function subscribeConnection(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setConnectionStatus(status: ConnectionStatus) {
  if (status === connectionStatus) return;
  connectionStatus = status;
  listeners.forEach((listener) => listener());
}
export function requireConnection() {
  if (connectionStatus !== "connected")
    throw new Error("Chưa kết nối với Mac. Dữ liệu đang ở chế độ chỉ đọc; kết nối lại trước khi lưu.");
}
export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
let accountRevision: number | undefined;
export function setAccountRevision(revision: number) { accountRevision = revision; }

export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const writing = method !== "GET";
  if (writing) requireConnection();
  const requestedRevision = accountRevision;
  const controller = new AbortController();
  // Reports can wait for several AI chunks; ordinary requests should fail promptly.
  const timer = setTimeout(() => controller.abort(), path === "/reports" ? 900_000 : writing ? 60_000 : 12_000);
  try {
    const response = await fetch(`${API_BASE_URL}/api${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(requestedRevision !== undefined && writing
          ? { "X-Account-Revision": String(requestedRevision) } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = data && typeof data === "object" && "detail" in data ? data.detail : null;
      throw new ApiError(typeof detail === "string" ? detail : "Máy chủ không thể xử lý yêu cầu.", response.status);
    }
    if (data === null) throw new ApiError("Máy chủ trả về dữ liệu không hợp lệ.", 502);
    if (writing && requestedRevision !== accountRevision)
      throw new ApiError("Tài khoản đã đổi. Kết quả thao tác cũ đã được bỏ qua.", 409);
    return data as T;
  } catch (error) {
    if (writing && (!(error instanceof ApiError) || error.status >= 500 || [401, 403].includes(error.status)))
      setConnectionStatus(error instanceof ApiError && [401, 403].includes(error.status) ? "forbidden" : "offline");
    if (error instanceof ApiError) throw error;
    throw new Error(writing
      ? "Mất kết nối. Chưa xác nhận thao tác đã lưu; kiểm tra dữ liệu sau khi kết nối lại trước khi gửi lần nữa."
      : "Không nhận được dữ liệu từ Mac. Kiểm tra Tailscale và máy chủ.");
  } finally { clearTimeout(timer); }
}
