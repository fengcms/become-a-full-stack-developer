package values

import (
	"net/url"
	"testing"
)

func TestEndpointPaging(t *testing.T) {
	for _, tc := range []struct {
		query string
		size  int
	}{
		{"", 10},
		{"pageSize=99", 50},
		{"pageSize=-1", 1},
		{"pageSize=20", 20},
	} {
		q, _ := url.ParseQuery(tc.query)
		p := PagingWith(q, 10, 50)
		if p.Size != tc.size || p.Page != 1 {
			t.Fatalf("%s: %+v", tc.query, p)
		}
	}
	if Paging(url.Values{}).Size != 20 {
		t.Fatal("common default changed")
	}
}
