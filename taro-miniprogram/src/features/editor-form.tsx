import { View, Text, Input, Textarea, Button, Picker, Image } from "@tarojs/components";
import { useRef, useState } from "react";
import { uploadImage, message } from "../core/api";
import { type Draft } from "../core/drafts";
import type { Category } from "../core/models";
function flatten(nodes: Category[], prefix = ""): { id: number; name: string }[] {
  return nodes.flatMap((n) => [
    { id: n.id, name: prefix + n.name },
    ...flatten(n.children || [], prefix + "　"),
  ]);
}
export function EditorForm({
  draft,
  onChange,
  categories,
  disabled,
  onUploading,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  categories: Category[];
  disabled: boolean;
  onUploading: (value: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    cursor = useRef(-1);
  const latest = useRef(draft);
  latest.current = draft;
  const options = [{ id: 0, name: "未分类" }, ...flatten(categories)];
  function change(patch: Partial<Draft>) {
    onChange({ ...latest.current, ...patch });
  }
  function insert(before: string, after = "") {
    const d = latest.current;
    const at = cursor.current < 0 ? d.content.length : Math.min(cursor.current, d.content.length);
    change({ content: d.content.slice(0, at) + before + after + d.content.slice(at) });
    cursor.current = at + before.length;
  }
  async function upload(cover: boolean) {
    if (uploading || disabled) return;
    setUploading(true);
    onUploading(true);
    setError("");
    try {
      const url = await uploadImage();
      if (cover) change({ coverImage: url });
      else insert(`\n![图片说明](${url})\n`);
    } catch (e) {
      if (!String(e).includes("cancel")) setError(message(e));
    } finally {
      setUploading(false);
      onUploading(false);
    }
  }
  return (
    <View onClick={(e) => e.stopPropagation()}>
      <Text className="label">标题 *</Text>
      <Input
        className="field"
        value={draft.title}
        disabled={disabled}
        maxlength={200}
        placeholder="给文章起一个清晰的标题"
        onInput={(e) => change({ title: e.detail.value })}
      />
      <Text className="label">摘要</Text>
      <Textarea
        className="field textarea"
        value={draft.summary}
        disabled={disabled}
        maxlength={500}
        placeholder="用几句话介绍文章内容"
        onInput={(e) => change({ summary: e.detail.value })}
      />
      <Text className="label">分类</Text>
      <Picker
        mode="selector"
        range={options}
        rangeKey="name"
        value={Math.max(
          0,
          options.findIndex((n) => n.id === draft.categoryId),
        )}
        disabled={disabled}
        onChange={(e) => change({ categoryId: options[Number(e.detail.value)].id || null })}
      >
        <View className="field">
          {options.find((n) => n.id === draft.categoryId)?.name || "未分类"}　⌄
        </View>
      </Picker>
      <Text className="label">标签（逗号分隔）</Text>
      <Input
        className="field"
        value={draft.tags}
        disabled={disabled}
        maxlength={300}
        placeholder="React, TypeScript"
        onInput={(e) => change({ tags: e.detail.value })}
      />
      <Text className="label">封面图</Text>
      {draft.coverImage && (
        <Image className="reader-image" mode="widthFix" src={draft.coverImage} />
      )}
      <View className="row">
        <Button
          className="button secondary small"
          loading={uploading}
          disabled={disabled || uploading}
          onClick={() => void upload(true)}
        >
          上传封面
        </Button>
        {draft.coverImage && (
          <Button className="link" onClick={() => change({ coverImage: "" })}>
            移除封面
          </Button>
        )}
      </View>
      <View className="space" />
      <Text className="label">Markdown 正文 *</Text>
      <View className="editor-toolbar">
        {[
          ["H2", "\n## ", ""],
          ["粗体", "**", "**"],
          ["链接", "[文字](", ")"],
          ["代码", "\n```typescript\n", "\n```\n"],
          ["列表", "\n- ", ""],
          ["引用", "\n> ", ""],
        ].map(([label, before, after]) => (
          <Button
            key={label}
            className="button secondary small"
            disabled={disabled}
            onClick={() => insert(before, after)}
          >
            {label}
          </Button>
        ))}
        <Button
          className="button secondary small"
          loading={uploading}
          disabled={disabled || uploading}
          onClick={() => void upload(false)}
        >
          插图
        </Button>
      </View>
      <Textarea
        className="field editor-text"
        value={draft.content}
        disabled={disabled}
        maxlength={65535}
        autoHeight={false}
        placeholder="从这里开始记录你的思考…"
        onInput={(e) => {
          cursor.current = e.detail.cursor;
          change({ content: e.detail.value });
        }}
        onBlur={(e) => {
          cursor.current = e.detail.cursor;
        }}
      />
      <Text className="muted">{draft.content.length} / 65535 字符 · 工具栏在光标处插入</Text>
      {error && <View className="error">{error}</View>}
    </View>
  );
}
