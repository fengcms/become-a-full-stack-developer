// Package fault 定义不依赖传输协议的业务错误。
package fault

import (
	"errors"

	"gorm.io/gorm"
)

// 业务码遵循冻结契约；具体 HTTP 状态由 Status 集中映射。
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

// Error 表示业务错误码和可选明细，HTTP 状态由传输层映射。
type Error struct {
	Code int
	Data any
}

// Error 返回契约错误文案，满足标准库 error 接口。
func (failure *Error) Error() string { return Message(failure.Code) }

// New 构造不带明细的业务错误，领域代码不依赖 HTTP 包。
func New(code int) error { return &Error{Code: code} }

// Field 构造 4001 字段校验错误，维持冻结的 errors 数组结构。
func Field(field, message string) error {
	return &Error{
		Code: Validation,
		Data: map[string]any{
			"errors": []map[string]string{
				{
					"field":   field,
					"message": message,
				},
			},
		},
	}
}

// Resolve 用 errors.As/Is 识别业务及数据库错误，未知错误映射为内部失败。
func Resolve(err error) *Error {
	var failure *Error
	if errors.As(err, &failure) {
		return failure
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return &Error{Code: NotFound}
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) || errors.Is(err, gorm.ErrForeignKeyViolated) {
		return &Error{Code: Conflict}
	}
	return &Error{Code: Internal}
}

// Status 将业务错误码映射为 HTTP 状态，不暴露数据库实现信息。
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

var messages = map[int]string{
	0:           "ok",
	Credentials: "用户名或密码错误",
	Token:       "令牌无效或已过期",
	Refresh:     "刷新令牌失效，请重新登录",
	Missing:     "未携带访问令牌",
	Disabled:    "账号已被禁用",
	Forbidden:   "无权限执行该操作",
	NotFound:    "资源不存在",
	Conflict:    "资源冲突（唯一约束或引用占用）",
	State:       "当前状态不允许该操作",
	Validation:  "参数校验失败",
	Internal:    "服务内部错误",
	Limited:     "请求过于频繁，请稍后重试",
}

// Message 返回集中维护的契约文案，调用时不重建映射。
func Message(code int) string { return messages[code] }
