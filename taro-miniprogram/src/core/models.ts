export interface User { id: number; username: string; nickname: string | null; avatar: string | null; email?: string | null; role: string; level: number; canSetCredentials?: boolean }
export interface Auth { user: User; accessToken: string; refreshToken: string; expiresIn: number }
export interface Article { id: number; slug: string; title: string; summary: string | null; coverImage: string | null; authorId: number; authorName: string; categoryId: number | null; categoryName: string | null; tags: string[]; content?: string; status: string; rejectedReason?: string | null; viewCount: number; likeCount: number; publishedAt: string | null; createdAt: string; updatedAt: string }
export interface Page<T> { list: T[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
export interface Category { id: number; name: string; slug: string; children: Category[]; articleCount?: number }
export interface Tag { id: number; name: string; slug: string; articleCount?: number }
export interface Comment { id: number; userId: number; userName: string; content: string; parentId: number | null; createdAt: string; status: string }
export interface Notice { id: number; title: string; body?: string | null; link?: string | null; type: string; isRead: boolean; articleId?: number; targetId?: number; createdAt: string }
export interface HistoryItem { article: Article; progress: number | null; lastReadAt: string }
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
