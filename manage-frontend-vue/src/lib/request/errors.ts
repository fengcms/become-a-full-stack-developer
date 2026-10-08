import type { ErrorCode } from '@/types/common'

export const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1'

export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly requestId?: string
  readonly data?: unknown

  constructor(input: {
    code: ErrorCode
    status: number
    message: string
    requestId?: string
    data?: unknown
  }) {
    super(input.message)
    this.name = 'ApiError'
    this.code = input.code
    this.status = input.status
    this.requestId = input.requestId
    this.data = input.data
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError
