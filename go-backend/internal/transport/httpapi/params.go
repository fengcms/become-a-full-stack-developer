package httpapi

import (
	"strconv"

	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
)

func pathID(r Request, key string) (int64, error) {
	id, err := strconv.ParseInt(r.HTTP.PathValue(key), 10, 64)
	if err != nil || id < 1 {
		return 0, fault.New(fault.NotFound)
	}
	return id, nil
}

// registerID 集中解析正整数路径参数，非法值沿用资源不存在的契约错误。
// 委托 Register 注册，确保权限、限流和输入校验顺序不变。
func (a *App) registerID(operation, key string, handler func(Request, int64) (any, error)) {
	a.Register(operation, func(r Request) (any, error) {
		id, err := pathID(r, key)
		if err != nil {
			return nil, err
		}
		return handler(r, id)
	})
}
