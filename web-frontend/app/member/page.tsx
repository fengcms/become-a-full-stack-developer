/** @file Member center defaults to the reader's saved articles. */
import { redirect } from 'next/navigation'

const Page = () => redirect('/member/favorites')
export default Page
