import Taro from "@tarojs/taro";
import { API, session, sessionEpoch, setSession } from "./session";
import { cache, privateCache } from "./cache";
import type { Auth, Method } from "./models";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: number,
    message: string,
  ) {
    super(message);
  }
}
interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}
let refreshFlight: Promise<void> | null = null;
async function raw<T>(path: string, method: Method, data: unknown, token: string): Promise<T> {
  const r = await Taro.request<Envelope<T>>({
    url: API + path,
    method,
    data: data as object,
    timeout: 20000,
    header: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (r.statusCode >= 400 || r.data?.code !== 0)
    throw new ApiError(r.statusCode, r.data?.code || 5000, r.data?.message || "网络请求失败");
  return r.data.data;
}
export async function refreshSession() {
  if (refreshFlight) return refreshFlight;
  const old = session(),
    generation = sessionEpoch();
  if (!old) throw new ApiError(401, 1004, "请先登录");
  const flight = raw<Auth>("/auth/refresh", "POST", { refreshToken: old.refreshToken }, "")
    .then((auth) => {
      if (sessionEpoch() !== generation) throw new Error("账号已切换，请重新操作");
      setSession(auth, false);
    })
    .catch((error) => {
      if (sessionEpoch() === generation && error instanceof ApiError && error.status === 401)
        setSession(null);
      throw error;
    })
    .finally(() => {
      if (refreshFlight === flight) refreshFlight = null;
    });
  refreshFlight = flight;
  return flight;
}
export async function api<T>(
  path: string,
  method: Method = "GET",
  data?: unknown,
  authenticated = true,
): Promise<T> {
  const generation = sessionEpoch(),
    token = authenticated ? session()?.accessToken || "" : "";
  try {
    let value: T;
    try {
      value = await raw<T>(path, method, data, token);
    } catch (error) {
      // 仅认证失败（未执行业务）可刷新后重放一次；网络错误不重试写入。
      if (
        !(error instanceof ApiError) ||
        error.status !== 401 ||
        !token ||
        path.startsWith("/auth/") ||
        sessionEpoch() !== generation
      )
        throw error;
      if (session()?.accessToken === token) await refreshSession();
      if (sessionEpoch() !== generation) throw new Error("账号已切换，请重新操作");
      value = await raw<T>(path, method, data, session()?.accessToken || "");
    }
    if (authenticated && sessionEpoch() !== generation) throw new Error("账号已切换，请重新操作");
    return value;
  } finally {
    if (method !== "GET" && !path.startsWith("/auth/") && !path.endsWith("/view")) {
      privateCache.clear();
      if (!path.startsWith("/me/")) cache.clear();
    }
  }
}
export function read<T>(path: string, force = false, privateData = false, ttl = 60000) {
  const identity = privateData ? `${session()?.user.id || "guest"}:${sessionEpoch()}` : "public";
  return (privateData ? privateCache : cache).read(
    `${API}:${identity}:${path}`,
    () => api<T>(path, "GET", undefined, privateData),
    ttl,
    force,
  );
}
export function message(error: unknown) {
  return error instanceof Error ? error.message : "网络异常，请稍后重试";
}
export function toast(error: unknown) {
  Taro.showToast({ title: message(error), icon: "none", duration: 2500 });
}
export async function uploadImage(): Promise<string> {
  if (!session()) throw new Error("请先登录");
  const generation = sessionEpoch();
  const choice = await Taro.chooseMedia({
    count: 1,
    mediaType: ["image"],
    sizeType: ["compressed"],
  });
  if (sessionEpoch() !== generation) throw new Error("账号已切换");
  const file = choice.tempFiles[0];
  if (!file) throw new Error("未选择图片");
  if (file.size > 10 * 1024 * 1024) throw new Error("图片不能超过 10MB");
  const r = await Taro.uploadFile({
    url: API + "/upload",
    filePath: file.tempFilePath,
    name: "file",
    header: { Authorization: `Bearer ${session()!.accessToken}` },
  });
  if (sessionEpoch() !== generation) throw new Error("账号已切换");
  const body = JSON.parse(r.data) as Envelope<{ url: string }>;
  if (r.statusCode >= 400 || body.code !== 0) throw new Error(body.message || "上传失败");
  return body.data.url;
}
