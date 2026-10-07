import { useCallback, useEffect, useRef, useState } from "react";
import Taro, { useDidShow, usePullDownRefresh, useReachBottom } from "@tarojs/taro";
import { cache, privateCache } from "../core/cache";
import { read, message } from "../core/api";
import { useSession, sessionEpoch } from "../core/session";
import type { Article, HistoryItem, Page } from "../core/models";

export function useResource<T>(path: string, privateData = false) {
  const auth = useSession();
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const serial = useRef(0);
  const load = useCallback(
    async (force = false) => {
      const id = ++serial.current,
        epoch = sessionEpoch();
      if (!path || (privateData && !auth)) {
        setData(undefined);
        return;
      }
      setLoading(true);
      try {
        const result = await read<T>(path, force, privateData);
        if (id === serial.current && (!privateData || epoch === sessionEpoch())) {
          setData(result);
          setError("");
        }
      } catch (e) {
        if (id === serial.current) {
          setError(message(e));
          setData(undefined);
        }
      } finally {
        if (id === serial.current) setLoading(false);
      }
    },
    [path, privateData, auth?.user.id],
  );
  useEffect(() => {
    setData(undefined);
    void load();
    return () => {
      serial.current++;
    };
  }, [load]);
  useDidShow(() => {
    void load();
  });
  return { data, error, loading, reload: load };
}
export function useFeed(path: string, privateData = false) {
  const auth = useSession();
  const [items, setItems] = useState<Article[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const lock = useRef(false),
    serial = useRef(0),
    loadedAt = useRef(0),
    revision = useRef(-1);
  const load = useCallback(
    async (reset = false, force = false) => {
      if ((!reset && (lock.current || !more)) || !path || (privateData && !auth)) return;
      const id = ++serial.current,
        epoch = sessionEpoch(),
        next = reset ? 1 : page + 1;
      lock.current = true;
      setLoading(true);
      setError("");
      try {
        const separator = path.includes("?") ? "&" : "?";
        let result = await read<
          Page<Article | HistoryItem> | Article[] | { articles: Page<Article> }
        >(`${path}${separator}page=${next}&pageSize=12`, force, privateData);
        if ("articles" in result) result = result.articles;
        const list = (Array.isArray(result) ? result : result.list).map((item) =>
          "article" in item ? item.article : item,
        );
        if (id !== serial.current || (privateData && epoch !== sessionEpoch())) return;
        setItems((old) => [
          ...new Map((reset ? list : [...old, ...list]).map((a) => [a.id, a])).values(),
        ]);
        loadedAt.current = Date.now();
        revision.current = (privateData ? privateCache : cache).revision();
        setPage(next);
        setMore(Array.isArray(result) ? list.length === 12 : next < result.pagination.totalPages);
      } catch (e) {
        if (id === serial.current) setError(message(e));
      } finally {
        if (id === serial.current) {
          lock.current = false;
          setLoading(false);
        }
      }
    },
    [path, privateData, auth?.user.id, page, more],
  );
  const latest = useRef(load);
  latest.current = load;
  useEffect(() => {
    serial.current++;
    lock.current = false;
    setItems([]);
    setPage(0);
    setMore(true);
    setError("");
    if (path && (!privateData || auth)) void latest.current(true);
    return () => {
      serial.current++;
    };
  }, [path, privateData, auth?.user.id]);
  usePullDownRefresh(() => {
    void latest.current(true, true).finally(() => Taro.stopPullDownRefresh());
  });
  useDidShow(() => {
    if (
      !lock.current &&
      loadedAt.current &&
      (Date.now() - loadedAt.current > 60000 ||
        revision.current !== (privateData ? privateCache : cache).revision())
    )
      void latest.current(true);
  });
  useReachBottom(() => {
    void latest.current();
  });
  return { items, error, loading, more, load: () => load(), refresh: () => load(true, true) };
}
