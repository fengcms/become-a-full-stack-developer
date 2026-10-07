package article

import (
	"gorm.io/gorm/clause"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf16"
)

var heading = regexp.MustCompile(`^(#{1,6})\s+(.+?)\s*#*\s*$`)
var invalidAnchor = regexp.MustCompile(`[^a-z0-9_一-龥]+`)

func jsSlice(s string, n int) string {
	u := utf16.Encode([]rune(s))
	if len(u) > n {
		u = u[:n]
	}
	return string(utf16.Decode(u))
}
func ParseToc(content string) []map[string]any {
	out := []map[string]any{}
	seen := map[string]int{}
	fence := false
	for _, line := range strings.Split(content, "\n") {
		if strings.HasPrefix(strings.TrimLeft(line, " \t\r"), "```") {
			fence = !fence
			continue
		}
		if fence {
			continue
		}
		m := heading.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		text := strings.TrimSpace(m[2])
		if text == "" {
			continue
		}
		anchor := strings.Trim(invalidAnchor.ReplaceAllString(strings.ToLower(text), "-"), "-")
		anchor = jsSlice(anchor, 100)
		if anchor == "" {
			anchor = "heading"
		}
		n := seen[anchor]
		seen[anchor]++
		if n > 0 {
			suffix := "-" + strconv.Itoa(n)
			anchor = jsSlice(anchor, 100-len(suffix)) + suffix
		}
		out = append(out, map[string]any{"level": len(m[1]), "text": jsSlice(text, 200), "anchor": anchor})
	}
	return out
}
func fnv(s string) string {
	h := uint32(0x811c9dc5)
	for _, ch := range utf16.Encode([]rune(s)) {
		h ^= uint32(ch)
		h *= 0x01000193
	}
	return strconv.FormatUint(uint64(h), 16)
}
func onConflict() clause.OnConflict { return clause.OnConflict{DoNothing: true} }
