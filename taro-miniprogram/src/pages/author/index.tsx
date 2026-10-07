import { useState } from "react";
import { useRouter } from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import { Screen, Avatar, ArticleCard, Heading, State } from "../../components/ui";
import { useResource } from "../../hooks/data";
import type { Article } from "../../core/models";
export default function Author() {
  const id = useRouter().params.id,
    [page, setPage] = useState(1);
  const data = useResource<{
    nickname: string;
    avatar: string;
    level: number;
    articleCount: number;
    articles: Article[];
  }>(`/members/${encodeURIComponent(id || "")}?page=${page}&pageSize=12`);
  return (
    <Screen>
      <State
        error={data.error}
        loading={data.loading && !data.data}
        retry={() => data.reload(true)}
      />
      {data.data && (
        <>
          <View className="panel row">
            <Avatar src={data.data.avatar} name={data.data.nickname} />
            <View>
              <View className="section-title">{data.data.nickname}</View>
              <Text className="muted">
                等级 {data.data.level} · {data.data.articleCount} 篇文章
              </Text>
            </View>
          </View>
          <Heading>作者文章</Heading>
          {data.data.articles.map((a) => (
            <ArticleCard key={a.id} article={a} />
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
              disabled={page * 12 >= data.data.articleCount}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </Button>
          </View>
        </>
      )}
    </Screen>
  );
}
