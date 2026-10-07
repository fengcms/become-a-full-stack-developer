package contract

import "testing"

func TestFrozenCatalog(t *testing.T) {
	c, e := Load()
	if e != nil {
		t.Fatal(e)
	}
	if len(c.Operations) != 68 {
		t.Fatal(len(c.Operations))
	}
	for id, op := range c.Operations {
		if op.Response == nil {
			t.Errorf("%s has no response schema", id)
		}
	}
	op := c.Operations["updateMyProfile"]
	if e := op.Request.Validate(map[string]any{"avatar": nil, "nickname": ""}); e != nil {
		t.Fatal(e)
	}
	if e := op.Request.Validate(map[string]any{"nickname": 17}); e == nil {
		t.Fatal("invalid input accepted")
	}
}
