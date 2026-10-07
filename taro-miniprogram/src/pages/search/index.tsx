import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Input, Button } from "@tarojs/components";
import { Screen, Feed, Heading, Icon } from "../../components/ui";
import { useFeed, useResource } from "../../hooks/data";
import type { Tag } from "../../core/models";
const historyKey = "befull:search-history";
export default function Search() {
  const [input, setInput] = useState(""),
    [query, setQuery] = useState("");
  const [history, setHistory] = useState<string[]>(() => {
    const value = Taro.getStorageSync(historyKey);
    return Array.isArray(value) ? value.slice(0, 12) : [];
  });
  const tags = useResource<Tag[]>("/tags"),
    feed = useFeed(query ? `/search?q=${encodeURIComponent(query)}` : "");
  function submit(value = input) {
    const q = value.trim();
    if (!q) return;
    setInput(q);
    setQuery(q);
    const next = [q, ...history.filter((s) => s !== q)].slice(0, 12);
    setHistory(next);
    Taro.setStorageSync(historyKey, next);
    Taro.hideKeyboard();
  }
  return (
    <Screen>
      <View className="brand">搜索</View>
      <View className="space" />
      <View className="searchbox" onClick={(e) => e.stopPropagation()}>
        <Icon name="search" />
        <Input
          value={input}
          placeholder="搜索文章、技术关键词"
          confirmType="search"
          maxlength={100}
          onInput={(e) => setInput(e.detail.value)}
          onConfirm={() => submit()}
        />
        <Button className="button small" onClick={() => submit()}>
          搜索
        </Button>
      </View>
      {query ? (
        <>
          <Heading
            aside={
              <Button
                className="link"
                onClick={() => {
                  setQuery("");
                  setInput("");
                }}
              >
                清空
              </Button>
            }
          >
            “{query}” 的结果
          </Heading>
          <Feed feed={feed} />
        </>
      ) : (
        <>
          <Heading
            aside={
              <Button
                className="link"
                onClick={() => {
                  setHistory([]);
                  Taro.removeStorageSync(historyKey);
                }}
              >
                清空
              </Button>
            }
          >
            最近搜索
          </Heading>
          <View className="chips">
            {history.length ? (
              history.map((h) => (
                <Button key={h} className="chip" onClick={() => submit(h)}>
                  {h}
                </Button>
              ))
            ) : (
              <Text className="muted">还没有搜索记录</Text>
            )}
          </View>
          <Heading>试试这些关键词</Heading>
          <View className="chips">
            {tags.data?.slice(0, 18).map((t) => (
              <Button key={t.id} className="chip" onClick={() => submit(t.name)}>
                # {t.name}
              </Button>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}
