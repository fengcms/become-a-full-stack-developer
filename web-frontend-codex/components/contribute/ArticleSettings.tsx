'use client'
import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import { Failure } from '@/components/ui/Feedback'
import { type DraftFields, uploadImage, writingOptions } from '@/lib/api/contributions'
import { categoryChoices } from '@/lib/contribution-model'
export function ArticleSettings({
  fields,
  change,
  articleId,
  onBusy,
  onError,
}: {
  fields: DraftFields
  change: (fields: Partial<DraftFields>) => void
  articleId?: number
  onBusy: (busy: boolean) => void
  onError: (error: string) => void
}) {
  const query = useQuery({ queryKey: ['writing-options'], queryFn: writingOptions })
  return (
    <div className="writing-settings">
      <label>
        文章摘要
        <textarea
          value={fields.summary ?? ''}
          maxLength={500}
          rows={4}
          onChange={(e) => change({ summary: e.target.value })}
          placeholder="选填，用几句话介绍文章"
        />
        <small>{fields.summary?.length ?? 0} / 500</small>
      </label>
      <label>
        封面图
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            onBusy(true)
            try {
              change({ coverImage: await uploadImage(file, articleId) })
            } catch (error) {
              onError(error instanceof Error ? error.message : '封面上传失败')
            } finally {
              onBusy(false)
            }
          }}
        />
        <small>建议 16:9 横图，最大 10MB</small>
      </label>
      {fields.coverImage && (
        <div>
          <Image
            unoptimized
            width={880}
            height={495}
            className="writing-cover"
            src={fields.coverImage}
            alt="文章封面"
          />
          <button className="textbutton" type="button" onClick={() => change({ coverImage: '' })}>
            移除封面
          </button>
        </div>
      )}
      {query.isError ? (
        <Failure
          retry={() => {
            void query.refetch()
          }}
          message="分类与标签加载失败"
        />
      ) : (
        <>
          <label>
            文章分类
            <select
              value={fields.categoryId ?? ''}
              onChange={(e) =>
                change({ categoryId: e.target.value ? Number(e.target.value) : null })
              }
            >
              <option value="">{query.isPending ? '正在加载…' : '请选择分类（投稿时必选）'}</option>
              {categoryChoices(query.data?.categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>文章标签（选填）</legend>
            <div className="writing-tags">
              {query.data?.tags.map((tag) => (
                <label key={tag.id}>
                  <input
                    type="checkbox"
                    checked={fields.tags?.includes(tag.name) ?? false}
                    onChange={(e) =>
                      change({
                        tags: e.target.checked
                          ? [...(fields.tags ?? []), tag.name]
                          : fields.tags?.filter((t) => t !== tag.name),
                      })
                    }
                  />
                  {tag.name}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
    </div>
  )
}
