import Taro from '@tarojs/taro'

export const API = 'https://api-befull.kao9.com/api/v1'
let accessToken = ''
let refreshToken = ''
interface Envelope<T> { code: number; message: string; data: T }
interface Auth { accessToken: string; refreshToken: string }

// 验证项目只在内存持有凭据；不会写入日志、草稿或页面输出。
export async function request<T>(path: string, method: 'GET' | 'POST' = 'GET', data?: object): Promise<T> {
  const response = await Taro.request<Envelope<T>>({
    url: API + path, method, data, timeout: 15000,
    header: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  })
  if (response.statusCode >= 400 || response.data.code !== 0) {
    throw new Error(`HTTP ${response.statusCode} / code ${response.data.code}: ${response.data.message || '请求失败'}`)
  }
  return response.data.data
}
export async function login(username: string, password: string) {
  const result = await request<Auth>('/auth/login', 'POST', { username, password })
  accessToken = result.accessToken
  refreshToken = result.refreshToken
}
export async function refresh() {
  if (!refreshToken) throw new Error('请先用测试账号登录')
  const result = await request<Auth>('/auth/refresh', 'POST', { refreshToken })
  accessToken = result.accessToken
  refreshToken = result.refreshToken
}
export function forget() { accessToken = ''; refreshToken = '' }
export async function upload() {
  if (!accessToken) throw new Error('请先用测试账号登录')
  const choice = await Taro.chooseMedia({ count: 1, mediaType: ['image'] })
  const result = await Taro.uploadFile({
    url: API + '/upload', filePath: choice.tempFiles[0].tempFilePath, name: 'file',
    header: { Authorization: `Bearer ${accessToken}` },
  })
  const body = JSON.parse(result.data) as Envelope<{ url: string }>
  if (result.statusCode >= 400 || body.code !== 0) throw new Error(body.message || '上传失败')
  return body.data.url
}
