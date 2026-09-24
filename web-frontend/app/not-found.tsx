/** @file Only unavailable resources reach this 404 state. */
import { Empty } from '@/components/ui/Feedback'

const NotFound = () => (
  <Empty
    title="这篇内容暂时找不到"
    message="内容可能已下架，或链接地址有误。"
    href="/"
    action="返回首页"
  />
)
export default NotFound
