/**
 * @file src/lib/utils.ts
 * @description 通用工具：合并 className（clsx + tailwind-merge），及若干格式化小函数。
 * @module manage-frontend/lib
 * @date 2026-08-29
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * 合并条件类名并解决 Tailwind 冲突（后写的工具类覆盖先写的）。
 * @param inputs - 任意数量的 className / 条件对象 / 数组。
 * @returns 合并后的单一 className 字符串。
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))
