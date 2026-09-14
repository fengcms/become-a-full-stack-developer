/**
 * @file lib/imageUpload.ts
 * @description 图片上传的本地约束，错误信息可直接反馈给选择文件的用户。
 */
export class ImageValidationError extends Error {}
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024
/** 发起网络请求前检查类型和体积，与后端 10MB 上限对齐。 */
export const validateImage = (file: Pick<File, 'type' | 'size'>): void => {
  if (!file.type.startsWith('image/')) throw new ImageValidationError('请选择图片文件')
  if (file.size > MAX_IMAGE_SIZE) throw new ImageValidationError('图片不能超过 10MB，请压缩后重试')
}
