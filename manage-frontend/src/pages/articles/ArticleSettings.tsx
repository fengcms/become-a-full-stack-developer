/**
 * @file pages/articles/ArticleSettings.tsx
 * @description 发布设置：摘要、横向封面、分类路径和已有标签联想。
 */
import { type Control, Controller } from 'react-hook-form'
import { QueryErrorState } from '@/components/feedback/QueryErrorState'
import { ImageUploadField } from '@/components/form/ImageUploadField'
import { SelectField } from '@/components/form/SelectField'
import { TagsField } from '@/components/form/TagsField'
import { TextAreaField } from '@/components/form/TextAreaField'
import { useCategoryTree } from '@/hooks/useCategories'
import { useTags } from '@/hooks/useTags'
import { type ArticleFormValues, categoryOptions } from './articleForm'

/** 设置保留挂载，切换面板不会丢失上传任务或标签输入。 */
export const ArticleSettings = ({ control }: { control: Control<ArticleFormValues> }) => {
  const categories = useCategoryTree()
  const tags = useTags()
  return (
    <div className="max-w-2xl space-y-5 py-2">
      <TextAreaField
        control={control}
        name="summary"
        label="摘要"
        placeholder="用几句话介绍文章，可选，最多 500 字"
      />
      <ImageUploadField
        control={control}
        name="coverImage"
        label="封面图"
        shape="landscape"
        description="建议使用 16:9 横图；保存文章后生效"
      />
      {categories.isError ? (
        <QueryErrorState title="分类加载失败" onRetry={() => categories.refetch()} />
      ) : (
        <SelectField
          control={control}
          name="categoryId"
          label="分类"
          description="草稿可暂不选择，发布时必填"
          options={[
            { value: '', label: categories.isPending ? '分类加载中…' : '未分类' },
            ...categoryOptions(categories.data ?? []),
          ]}
        />
      )}
      <Controller
        control={control}
        name="tags"
        render={({ field }) => (
          <TagsField
            value={field.value}
            onChange={field.onChange}
            suggestions={tags.data?.map((tag) => tag.name) ?? []}
            label="标签"
            description="选择已有标签，或输入后按回车添加；支持中英文逗号"
          />
        )}
      />
    </div>
  )
}
