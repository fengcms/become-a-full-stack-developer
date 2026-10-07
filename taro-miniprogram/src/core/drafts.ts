import Taro from "@tarojs/taro";
import { API } from "./session";
export interface Draft {
  title: string;
  summary: string;
  content: string;
  categoryId: number | null;
  tags: string;
  coverImage: string;
  updatedAt?: string;
}
export const emptyDraft = (): Draft => ({
  title: "",
  summary: "",
  content: "",
  categoryId: null,
  tags: "",
  coverImage: "",
});
export const draftKey = (userId: number, id: string) => `befull:draft:${API}:${userId}:${id}`;
export function saveDraft(userId: number, id: string, value: Draft) {
  Taro.setStorageSync(draftKey(userId, id), { ...value, updatedAt: new Date().toISOString() });
}
export function readDraft(userId: number, id: string): Draft | null {
  const value = Taro.getStorageSync(draftKey(userId, id));
  return value && typeof value.title === "string" && typeof value.content === "string"
    ? value
    : null;
}
export function deleteDraft(userId: number, id: string) {
  Taro.removeStorageSync(draftKey(userId, id));
}
export function validateDraft(draft: Draft) {
  if (!draft.title.trim()) return "请填写文章标题";
  if (!draft.content.trim()) return "请填写文章正文";
  if (draft.title.length > 200 || draft.summary.length > 500 || draft.content.length > 65535)
    return "标题、摘要或正文超出长度限制";
  if (draft.coverImage && !/^https?:\/\//i.test(draft.coverImage))
    return "封面须为有效的 HTTP(S) 地址";
  return "";
}
export function draftPayload(draft: Draft) {
  return {
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    content: draft.content,
    categoryId: draft.categoryId,
    coverImage: draft.coverImage || null,
    tags: [
      ...new Set(
        draft.tags
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ],
  };
}
