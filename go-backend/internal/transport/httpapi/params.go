package httpapi

import (
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"strconv"
)

func pathID(r Request, key string) (int64, error) {
	id, e := strconv.ParseInt(r.HTTP.PathValue(key), 10, 64)
	if e != nil || id < 1 {
		return 0, fault.New(fault.NotFound)
	}
	return id, nil
}
