package taxonomy

import (
	"context"
	"fmt"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/fault"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/testutil"
	"github.com/fengcms/become-a-full-stack-developer/go-backend/internal/values"
	"testing"
	"time"
)

func TestCategoryDepthCycleAndZeroValues(t *testing.T) {
	s := New(testutil.DB(t))
	ctx := context.Background()
	stamp := time.Now().Format("150405000000")
	ids := []int64{}
	for depth := 1; depth <= 4; depth++ {
		in := values.Fields{"name": "分类", "slug": fmt.Sprintf("c-%s-%d", stamp, depth), "sortOrder": float64(8)}
		if depth > 1 {
			in["parentId"] = float64(ids[depth-2])
		}
		v, e := s.Save(ctx, 0, in)
		if e != nil {
			t.Fatal(e)
		}
		ids = append(ids, v.(map[string]any)["id"].(int64))
	}
	if _, e := s.Save(ctx, 0, values.Fields{"name": "过深", "slug": "deep-" + stamp, "parentId": float64(ids[3])}); fault.Resolve(e).Code != fault.Conflict {
		t.Fatal(e)
	}
	if _, e := s.Save(ctx, ids[0], values.Fields{"name": "成环", "slug": "cycle-" + stamp, "parentId": float64(ids[3])}); fault.Resolve(e).Code != fault.Conflict {
		t.Fatal(e)
	}
	if e := s.Delete(ctx, ids[0]); fault.Resolve(e).Code != fault.Conflict {
		t.Fatal(e)
	}
	v, e := s.Save(ctx, ids[3], values.Fields{"name": "第四层", "slug": "leaf-" + stamp, "sortOrder": float64(0)})
	if e != nil || v.(map[string]any)["sortOrder"].(int64) != 0 {
		t.Fatal(v, e)
	}
}
