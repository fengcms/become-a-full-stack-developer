// Package fault defines transport-independent business failures.
package fault

import (
	"errors"

	"gorm.io/gorm"
)

const (
	Credentials = 1001
	Token       = 1002
	Refresh     = 1003
	Missing     = 1004
	Disabled    = 1005
	Forbidden   = 2001
	NotFound    = 3001
	Conflict    = 3002
	State       = 3003
	Validation  = 4001
	Internal    = 5000
	Limited     = 5001
)

type Error struct {
	Code int
	Data any
}

func (e *Error) Error() string { return Message(e.Code) }
func New(code int) error       { return &Error{Code: code} }
func Field(field, message string) error {
	return &Error{Code: Validation, Data: map[string]any{"errors": []map[string]string{{"field": field, "message": message}}}}
}
func Resolve(err error) *Error {
	var e *Error
	if errors.As(err, &e) {
		return e
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return &Error{Code: NotFound}
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) || errors.Is(err, gorm.ErrForeignKeyViolated) {
		return &Error{Code: Conflict}
	}
	return &Error{Code: Internal}
}
func Status(code int) int {
	switch code {
	case Credentials, Token, Refresh, Missing, Disabled:
		return 401
	case Forbidden:
		return 403
	case NotFound:
		return 404
	case Conflict, State:
		return 409
	case Validation:
		return 400
	case Limited:
		return 429
	default:
		return 500
	}
}
func Message(code int) string {
	return map[int]string{0: "ok", Credentials: "用户名或密码错误", Token: "令牌无效或已过期", Refresh: "刷新令牌失效，请重新登录", Missing: "未携带访问令牌", Disabled: "账号已被禁用", Forbidden: "无权限执行该操作", NotFound: "资源不存在", Conflict: "资源冲突（唯一约束或引用占用）", State: "当前状态不允许该操作", Validation: "参数校验失败", Internal: "服务内部错误", Limited: "请求过于频繁，请稍后重试"}[code]
}
