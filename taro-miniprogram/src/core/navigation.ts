import Taro from "@tarojs/taro";
import { session } from "./session";
export function go(page: string, params: Record<string, string | number> = {}) {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  const url = `/pages/${page}/index${query ? "?" + query : ""}`;
  return Taro.navigateTo({ url }).catch(() =>
    Taro.showToast({ title: "页面打开失败，请返回重试", icon: "none" }),
  );
}
export function tab(page: string) {
  return Taro.switchTab({ url: `/pages/${page}/index` });
}
export function requireLogin() {
  if (session()) return true;
  go("auth");
  return false;
}
export function openArticle(id: string | number, preview = false) {
  return go("article", { id, ...(preview ? { preview: 1 } : {}) });
}
export async function openLink(href: string) {
  if (/^(https:\/\/befull\.kao9\.com)?\/articles\//.test(href)) {
    const id = href.split("/articles/")[1].split(/[?#]/)[0];
    if (id) {
      try {
        openArticle(decodeURIComponent(id));
      } catch {
        Taro.showToast({ title: "链接地址无效", icon: "none" });
      }
      return;
    }
  }
  if (!/^https?:\/\//i.test(href)) {
    Taro.showToast({ title: "不支持此链接类型", icon: "none" });
    return;
  }
  const r = await Taro.showModal({ title: "打开外部链接", content: href, confirmText: "复制地址" });
  if (r.confirm) await Taro.setClipboardData({ data: href });
}
export const dateLabel = (date?: string | null) => (date ? date.slice(0, 10) : "");
