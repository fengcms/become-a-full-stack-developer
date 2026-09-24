/**
 * @file app/(public)/login/page.tsx
 * @description 登录页：账号密码登录，成功后写入会话并跳转。
 *   服务端页面包裹客户端表单；表单含 useSearchParams 需动态渲染。
 * @module web-frontend/app/(public)
 * @date 2026-09-17
 */

import LoginForm from './LoginForm'

// useSearchParams 在客户端表单中使用，需动态渲染
export const dynamic = 'force-dynamic'

const LoginPage = () => <LoginForm />

export default LoginPage
