import { useState } from "react";
import { View, Text, Button } from "@tarojs/components";
import { Screen, State, Heading } from "../../components/ui";
import { Private } from "../../components/private";
import { useResource } from "../../hooks/data";
import { api, toast } from "../../core/api";
import { dateLabel, openLink } from "../../core/navigation";
import type { Notice, Page } from "../../core/models";
function Content() {
  const [page, setPage] = useState(1),
    [unread, setUnread] = useState(false),
    [busy, setBusy] = useState(false);
  const result = useResource<Page<Notice>>(
    `/me/notifications?page=${page}&pageSize=15${unread ? "&isRead=false" : ""}`,
    true,
  );
  async function mark(id?: number) {
    if (busy) return;
    setBusy(true);
    try {
      await api(
        id ? `/me/notifications/${id}` : "/me/notifications/read-all",
        id ? "PATCH" : "POST",
        id ? { isRead: true } : undefined,
      );
      await result.reload(true);
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
          <Button className="link" onClick={() => void mark()}>
            全部已读
          </Button>
        }
      >
        消息通知
      </Heading>
      <View className="chips">
        {[false, true].map((value) => (
          <Button
            key={String(value)}
            className={`chip ${unread === value ? "selected" : ""}`}
            onClick={() => {
              setUnread(value);
              setPage(1);
            }}
          >
            {value ? "未读" : "全部"}
          </Button>
        ))}
      </View>
      <State
        error={result.error}
        loading={result.loading && !result.data}
        empty={result.data?.list.length === 0}
        retry={() => result.reload(true)}
      />
      {result.data?.list.map((n) => (
        <View className="panel" key={n.id}>
          <View className="row between">
            <Text className="bold">{n.title}</Text>
            <Text className="pill">{n.isRead ? "已读" : "未读"}</Text>
          </View>
          <View className="space" />
          <Text userSelect>{n.body}</Text>
          {n.link && (
            <Button
              className="link"
              onClick={() => {
                void mark(n.id);
                void openLink(n.link!);
              }}
            >
              查看详情 →
            </Button>
          )}
          <View className="row between meta">
            <Text>{dateLabel(n.createdAt)}</Text>
            {!n.isRead && (
              <Button className="link" onClick={() => void mark(n.id)}>
                标为已读
              </Button>
            )}
          </View>
        </View>
      ))}
      <View className="row between">
        <Button
          className="button secondary"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          上一页
        </Button>
        <Text>{page}</Text>
        <Button
          className="button secondary"
          disabled={!result.data || page >= result.data.pagination.totalPages}
          onClick={() => setPage(page + 1)}
        >
          下一页
        </Button>
      </View>
    </>
  );
}
export default function Notifications() {
  return (
    <Screen>
      <Private>
        <Content />
      </Private>
    </Screen>
  );
}
