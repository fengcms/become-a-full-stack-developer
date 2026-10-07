import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import { Screen, State, Heading } from "../../components/ui";
import { Private } from "../../components/private";
import { useFeed } from "../../hooks/data";
import { api, toast } from "../../core/api";
import { dateLabel, go, openArticle } from "../../core/navigation";
const labels: Record<string, string> = {
  "": "全部",
  draft: "草稿",
  pending: "审核中",
  published: "已发布",
};
function Content() {
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    feed = useFeed(`/me/articles${status ? "?status=" + status : ""}`, true);
  async function mutate(id: number, action: "submit" | "delete" | "withdraw") {
    if (busy) return;
    const r = await Taro.showModal({
      title:
        action === "delete" ? "删除文章？" : action === "withdraw" ? "撤回为草稿？" : "提交审核？",
      content:
        action === "delete" ? "文章将被移除，请确认已保留需要的内容。" : "操作将更新文章状态。",
    });
    if (!r.confirm) return;
    setBusy(true);
    try {
      await api(
        `/articles/${id}${action === "submit" ? "/submit" : ""}`,
        action === "submit" ? "POST" : action === "delete" ? "DELETE" : "PUT",
        action === "withdraw" ? { status: "draft" } : undefined,
      );
      await feed.refresh();
    } catch (e) {
      toast(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        aside={
          <Button className="link" onClick={() => go("editor")}>
            ＋ 写文章
          </Button>
        }
      >
        我的文章
      </Heading>
      <View className="chips">
        {Object.entries(labels).map(([s, title]) => (
          <Button
            key={s}
            className={`chip ${s === status ? "selected" : ""}`}
            onClick={() => setStatus(s)}
          >
            {title}
          </Button>
        ))}
      </View>
      {feed.items.map((a) => (
        <View className="panel" key={a.id}>
          <View className="row between">
            <Text className="pill">{labels[a.status] || a.status}</Text>
            <Text className="muted">{dateLabel(a.updatedAt)}</Text>
          </View>
          <View className="story-title" onClick={() => openArticle(a.id, true)}>
            {a.title}
          </View>
          <View className="row wrap">
            <Button className="link" onClick={() => go("editor", { id: a.id })}>
              编辑
            </Button>
            <Button className="link" onClick={() => openArticle(a.id, true)}>
              预览
            </Button>
            {a.status === "draft" && (
              <Button className="link" onClick={() => void mutate(a.id, "submit")}>
                提交审核
              </Button>
            )}
            {a.status === "pending" && (
              <Button className="link" onClick={() => void mutate(a.id, "withdraw")}>
                撤回
              </Button>
            )}
            <Button className="muted" onClick={() => void mutate(a.id, "delete")}>
              删除
            </Button>
          </View>
        </View>
      ))}
      <State
        error={feed.error}
        loading={feed.loading}
        empty={!feed.items.length}
        retry={feed.load}
      />
      {feed.more && !feed.loading && (
        <Button className="load-more" onClick={feed.load}>
          加载更多
        </Button>
      )}
    </>
  );
}
export default function MyArticles() {
  return (
    <Screen>
      <Private>
        <Content />
      </Private>
    </Screen>
  );
}
