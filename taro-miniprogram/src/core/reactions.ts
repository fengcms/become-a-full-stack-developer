import { useSyncExternalStore } from "react";
import { read } from "./api";
import { sessionEpoch, subscribe } from "./session";
import type { Article, Page } from "./models";
export interface Reaction {
  liked?: boolean;
  count?: number;
  favorite?: boolean;
}
const values = new Map<number, Reaction>(),
  listeners = new Set<() => void>();
let epoch = sessionEpoch();
subscribe(() => {
  if (sessionEpoch() !== epoch) {
    epoch = sessionEpoch();
    values.clear();
    [...listeners].forEach((fn) => fn());
  }
});
export function patchReaction(id: number, patch: Reaction) {
  values.set(id, { ...values.get(id), ...patch });
  if (values.size > 200) values.delete(values.keys().next().value!);
  [...listeners].forEach((fn) => fn());
}
export function useReaction(id: number) {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => values.get(id),
    () => values.get(id),
  );
}
export async function isFavorite(id: number) {
  for (let page = 1; ; page++) {
    const data = await read<Page<Article>>(`/me/favorites?page=${page}&pageSize=100`, false, true);
    if (data.list.some((a) => a.id === id)) return true;
    if (page >= data.pagination.totalPages) return false;
  }
}
