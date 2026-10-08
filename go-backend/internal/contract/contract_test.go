package contract

import "testing"

func TestFrozenCatalog(t *testing.T) {
	c, err := Load()
	if err != nil {
		t.Fatal(err)
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
	if err := op.Request.Validate(map[string]any{"avatar": nil, "nickname": ""}); err != nil {
		t.Fatal(err)
	}
	if err := op.Request.Validate(map[string]any{"nickname": 17}); err == nil {
		t.Fatal("invalid input accepted")
	}
}
