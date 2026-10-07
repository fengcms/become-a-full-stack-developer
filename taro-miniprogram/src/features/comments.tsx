import { useEffect, useRef, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Textarea, Button } from "@tarojs/components";
import { Heading, State, Avatar } from "../components/ui";
import { api, message, read, toast } from "../core/api";
import { useSession, sessionEpoch } from "../core/session";
import { dateLabel, requireLogin } from "../core/navigation";
import { groupComments } from "../core/comments";
import type { Comment, Page } from "../core/models";
export function Comments({ articleId }: { articleId: number }) {
  const auth = useSession(),
    [items, setItems] = useState<Comment[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(true);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sending, setSending] = useState(false);
  const [content, setContent] = useState(""),
    [reply, setReply] = useState<Comment>(),
    [focus, setFocus] = useState(false);
  const [expanded, setExpanded] = useState<number[]>([]),
    lock = useRef(false),
    generation = useRef(0);
  async function load(reset = false) {
    if (lock.current) return;
    const version = generation.current;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const data = await read<Page<Comment>>(
        `/articles/${articleId}/comments?page=${reset ? 1 : page + 1}&pageSize=20`,
        reset,
      );
      if (version !== generation.current) return;
      setItems((old) => [
        ...new Map((reset ? data.list : [...old, ...data.list]).map((c) => [c.id, c])).values(),
      ]);
      setPage(data.pagination.page);
      setMore(data.pagination.page < data.pagination.totalPages);
    } catch (e) {
      if (version === generation.current) setError(message(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    void load(true);
    return () => {
      generation.current++;
    };
  }, [articleId]);
  useEffect(() => {
    setContent("");
    setReply(undefined);
  }, [auth?.user.id]);
  async function send() {
    if (!requireLogin() || sending || !content.trim()) return;
    setSending(true);
    const epoch = sessionEpoch();
    try {
      const result = await api<Comment>(`/articles/${articleId}/comments`, "POST", {
        content: content.trim(),
        parentId: reply?.id || null,
      });
      if (epoch !== sessionEpoch()) return;
      if (result.status === "rejected") {
        setError("评论未通过审核，请修改后重试");
        return;
      }
      setContent("");
      setReply(undefined);
      setFocus(false);
      Taro.hideKeyboard();
      await load(true);
      Taro.showToast({
        title: result.status === "approved" ? "评论已发表" : "评论待审核",
        icon: "none",
      });
    } catch (e) {
      setError(message(e));
    } finally {
      setSending(false);
    }
  }
  async function remove(c: Comment) {
    const confirmed = await Taro.showModal({
      title: "删除评论",
      content: "关联回复也会被删除，确认继续？",
    });
    if (!confirmed.confirm) return;
    try {
      await api(`/comments/${c.id}`, "DELETE");
      await load(true);
    } catch (e) {
      toast(e);
    }
  }
  function comment(c: Comment, nested = false) {
    const parent = items.find((i) => i.id === c.parentId);
    return (
      <View key={c.id} className={nested ? "comment-reply" : "comment-root"}>
        <View className="row">
          <Avatar name={c.userName} />
          <View className="grow">
            <Text className="bold">{c.userName}</Text>
            <View className="muted">{dateLabel(c.createdAt)}</View>
          </View>
        </View>
        {nested && c.parentId && (
          <Text className="muted">回复 {parent?.userName || "前面的读者"}</Text>
        )}
        <View className="comment-content">
          <Text userSelect>{c.content}</Text>
        </View>
        <View className="row">
          <Button
            className="link"
            onClick={(e) => {
              e.stopPropagation();
              if (requireLogin()) {
                setReply(c);
                setFocus(true);
                Taro.pageScrollTo({ selector: "#composer", duration: 250 });
              }
            }}
          >
            回复
          </Button>
          {auth?.user.id === c.userId && (
            <Button className="muted" onClick={() => void remove(c)}>
              删除
            </Button>
          )}
        </View>
      </View>
    );
  }
  return (
    <View>
      <Heading>交流与讨论</Heading>
      <View id="composer" className="panel composer" onClick={(e) => e.stopPropagation()}>
        {reply && (
          <View className="row between">
            <Text className="muted">回复 {reply.userName}</Text>
            <Button className="link" onClick={() => setReply(undefined)}>
              取消
            </Button>
          </View>
        )}
        <Textarea
          className="field textarea"
          value={content}
          focus={focus}
          maxlength={5000}
          placeholder={auth ? "分享你的想法，友善交流…" : "登录后参与讨论"}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onInput={(e) => setContent(e.detail.value)}
        />
        <Button
          className="button"
          loading={sending}
          disabled={sending || (!!auth && !content.trim())}
          onClick={() => (auth ? void send() : requireLogin())}
        >
          {auth ? "发表评论" : "登录后评论"}
        </Button>
      </View>
      <State loading={busy} error={error} retry={() => load(true)} empty={!busy && !items.length} />
      {groupComments(items).map((group) => (
        <View className="comment-thread" key={group.id}>
          {group.root ? (
            comment(group.root)
          ) : (
            <View className="muted">前面的评论尚未加载或已不可见</View>
          )}
          {group.replies.length > 0 && (
            <View className="comment-floor">
              {(expanded.includes(group.id) ? group.replies : group.replies.slice(0, 3)).map((c) =>
                comment(c, true),
              )}
              {group.replies.length > 3 && (
                <Button
                  className="link"
                  onClick={() =>
                    setExpanded((old) =>
                      old.includes(group.id)
                        ? old.filter((id) => id !== group.id)
                        : [...old, group.id],
                    )
                  }
                >
                  {expanded.includes(group.id)
                    ? "收起回复"
                    : `展开 ${group.replies.length - 3} 条回复`}
                </Button>
              )}
            </View>
          )}
        </View>
      ))}
      {more && !busy && (
        <Button className="load-more" onClick={() => load()}>
          加载更多评论
        </Button>
      )}
    </View>
  );
}
