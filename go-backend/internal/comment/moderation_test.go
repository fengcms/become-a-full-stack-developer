package comment

import (
	"strings"
	"testing"
)

func TestModerationUsesProductThresholdAndUTF16(t *testing.T) {
	content, status := Moderate("广告" + strings.Repeat("好", 8))
	if content != "**"+strings.Repeat("好", 8) || status != "rejected" {
		t.Fatal(content, status)
	}
	_, status = Moderate("广告" + strings.Repeat("😀", 10))
	if status != "approved" {
		t.Fatal("emoji must count as two UTF16 units")
	}
	if display(strings.Repeat("好", 2001), 2000) != strings.Repeat("好", 1999)+"…" {
		t.Fatal("wire length exceeded")
	}
}
