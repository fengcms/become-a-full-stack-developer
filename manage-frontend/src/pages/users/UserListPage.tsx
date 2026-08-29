/**
 * @file src/pages/users/UserListPage.tsx
 * @description 用户管理列表页（Phase 4，admin 专属）。GET /users 驱动，支持按角色 / 状态 / 关键词筛选与分页。
 *   行操作：编辑（角色 / 状态 / 等级，PATCH /users/{id}）、重置密码（POST /admin/users/{id}/reset-password）。
 *
 * 契约要点：列表端点在 `/users`（非 `/admin/users`）；重置密码端点才是 `/admin/users/{id}/reset-password`。
 * 角色三角：member / editor / admin；status：active / disabled（disabled=封号）。
 * @module manage-frontend/pages/users
 * @date 2026-08-29
 */

import { format } from 'date-fns'
import { KeyRound, Pencil } from 'lucide-react'
import { useState } from 'react'
import { type ColumnDef, DataTable } from '@/components/data/DataTable'
import { TablePagination } from '@/components/data/TablePagination'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { ROLE_LABELS } from '@/config/roles'
import { useTableQuery } from '@/hooks/useTableQuery'
import { useResetPassword, useUpdateUser, useUsers } from '@/hooks/useUsers'
import type { User, UserRole, UserStatus } from '@/types/common'
import { ResetPasswordDialog } from './ResetPasswordDialog'
import { UserEditDialog } from './UserEditDialog'

/** 角色中文标签 + 徽标配色（走 index.css 语义令牌）。 */
const ROLE_CLASS: Record<UserRole, string> = {
  admin: 'bg-role-admin text-role-admin-fg',
  editor: 'bg-role-editor text-role-editor-fg',
  member: 'bg-role-member text-role-member-fg',
}

/** 状态中文标签 + 徽标配色。 */
const STATUS_LABEL: Record<UserStatus, string> = { active: '启用', disabled: '禁用' }
const STATUS_CLASS: Record<UserStatus, string> = {
  active: 'bg-user-status-active text-user-status-active-fg',
  disabled: 'bg-user-status-disabled text-user-status-disabled-fg',
}

/** 角色徽标。 */
const RoleBadge = ({ role }: { role: UserRole }) => (
  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${ROLE_CLASS[role]}`}>
    {ROLE_LABELS[role]}
  </span>
)

/** 状态徽标。 */
const StatusBadge = ({ status }: { status: UserStatus }) => (
  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
    {STATUS_LABEL[status]}
  </span>
)

/** 日期格式化；空值回退「—」。 */
const formatDate = (v?: string | null) => (v ? format(new Date(v), 'yyyy-MM-dd HH:mm') : '—')

/**
 * 用户管理列表页。
 */
const UserListPage = () => {
  const { page, pageSize, query, setPage, setPageSize, setFilters } = useTableQuery()
  const role = query.role as UserRole | undefined
  const status = query.status as UserStatus | undefined
  const keyword = (query.keyword as string | undefined) ?? undefined

  const listQuery = { page, pageSize, role, status, keyword }
  const { data, isLoading } = useUsers(listQuery)

  const updateMut = useUpdateUser()
  const resetMut = useResetPassword()

  const [editing, setEditing] = useState<User | null>(null)
  const [resetting, setResetting] = useState<User | null>(null)

  /** 列定义。 */
  const columns: ColumnDef<User>[] = [
    { key: 'id', header: 'ID', className: 'w-14' },
    {
      key: 'username',
      header: '用户名',
      render: (r) => <span className="font-medium">{r.username}</span>,
    },
    { key: 'nickname', header: '昵称', render: (r) => r.nickname ?? '—' },
    { key: 'email', header: '邮箱', render: (r) => r.email ?? '—' },
    { key: 'role', header: '角色', render: (r) => <RoleBadge role={r.role} /> },
    { key: 'status', header: '状态', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'level', header: '等级', render: (r) => r.level ?? 1 },
    { key: 'createdAt', header: '注册时间', render: (r) => formatDate(r.createdAt) },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing(r)} title="编辑角色/状态">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setResetting(r)} title="重置密码">
            <KeyRound className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="用户管理"
        description="角色升降、启用禁用、等级调整与密码重置，均为 admin 专属"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={role ?? ''}
          onChange={(e) =>
            setFilters({ role: (e.target.value || undefined) as UserRole | undefined })
          }
          className="h-9 rounded-md border border-input px-2 text-sm"
        >
          <option value="">全部角色</option>
          <option value="admin">管理员</option>
          <option value="editor">编辑</option>
          <option value="member">会员</option>
        </select>
        <select
          value={status ?? ''}
          onChange={(e) =>
            setFilters({ status: (e.target.value || undefined) as UserStatus | undefined })
          }
          className="h-9 rounded-md border border-input px-2 text-sm"
        >
          <option value="">全部状态</option>
          <option value="active">启用</option>
          <option value="disabled">禁用</option>
        </select>
        <input
          value={keyword ?? ''}
          onChange={(e) => setFilters({ keyword: e.target.value || undefined })}
          placeholder="搜索用户名 / 昵称 / 邮箱"
          className="h-9 w-64 rounded-md border border-input px-2 text-sm"
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.list ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyText="暂无用户"
      />

      {data?.pagination ? (
        <TablePagination
          page={data.pagination.page}
          pageSize={data.pagination.pageSize}
          total={data.pagination.total}
          totalPages={data.pagination.totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}

      <UserEditDialog
        user={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        loading={updateMut.isPending}
        onSubmit={(id, payload) =>
          updateMut.mutate({ id, payload }, { onSuccess: () => setEditing(null) })
        }
      />

      <ResetPasswordDialog
        user={resetting}
        open={!!resetting}
        onOpenChange={(o) => !o && setResetting(null)}
        loading={resetMut.isPending}
        onSubmit={(id, newPassword) =>
          resetMut.mutate({ id, newPassword }, { onSuccess: () => setResetting(null) })
        }
      />
    </div>
  )
}

export default UserListPage
