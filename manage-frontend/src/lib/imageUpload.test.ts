/**
 * @file lib/imageUpload.test.ts
 * @description 防止超限文件进入网络上传，以及把合法边界文件误判为失败。
 */
import { describe, expect, it } from 'vitest'
import { ImageValidationError, MAX_IMAGE_SIZE, validateImage } from './imageUpload'

describe('图片上传预检', () => {
  it('拒绝伪装扩展名的非图片类型', () => {
    expect(() => validateImage({ type: 'application/pdf', size: 1024 })).toThrow(
      ImageValidationError,
    )
  })
  it('接受恰好 10MB 的图片，但拒绝多出一个字节', () => {
    expect(() => validateImage({ type: 'image/png', size: MAX_IMAGE_SIZE })).not.toThrow()
    expect(() => validateImage({ type: 'image/png', size: MAX_IMAGE_SIZE + 1 })).toThrow(
      '图片不能超过 10MB',
    )
  })
})
