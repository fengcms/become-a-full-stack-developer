// Package contract loads the checked-in, generated snapshot of the frozen API.
package contract

import (
	"embed"
	"encoding/json"
	"fmt"
	"github.com/santhosh-tekuri/jsonschema/v6"
)

//go:embed openapi.json
var source embed.FS

type Operation struct {
	BodyRequired              bool
	ID, Method, Path, MinRole string
	Owner                     bool
	Request, Response         *jsonschema.Schema
}
type Catalog struct {
	Operations map[string]Operation
	Document   map[string]any
}

func Load() (*Catalog, error) {
	raw, e := source.ReadFile("openapi.json")
	if e != nil {
		return nil, e
	}
	var doc map[string]any
	if e = json.Unmarshal(raw, &doc); e != nil {
		return nil, e
	}
	normalize(doc)
	compiler := jsonschema.NewCompiler()
	if e = compiler.AddResource("https://befull.local/openapi.json", doc); e != nil {
		return nil, e
	}
	inputCompiler := jsonschema.NewCompiler()
	inputCompiler.AssertFormat()
	if e = inputCompiler.AddResource("https://befull.local/openapi.json", doc); e != nil {
		return nil, e
	}
	c := &Catalog{Operations: map[string]Operation{}, Document: doc}
	paths := doc["paths"].(map[string]any)
	for path, value := range paths {
		for method, v := range value.(map[string]any) {
			o, ok := v.(map[string]any)
			if !ok || o["operationId"] == nil {
				continue
			}
			op := Operation{ID: o["operationId"].(string), Method: method, Path: path}
			if a, ok := o["x-authz"].(map[string]any); ok {
				op.MinRole, _ = a["minRole"].(string)
				op.Owner = a["ownerOverride"] != nil
			}
			base := "https://befull.local/openapi.json#/paths/" + escape(path) + "/" + method
			if b, ok := o["requestBody"].(map[string]any); ok {
				op.BodyRequired, _ = b["required"].(bool)
				if content, ok := b["content"].(map[string]any); ok {
					if _, ok := content["application/json"]; ok {
						op.Request, e = inputCompiler.Compile(base + "/requestBody/content/application~1json/schema")
						if e != nil {
							return nil, fmt.Errorf("%s request: %w", op.ID, e)
						}
					}
				}
			}
			if resp, ok := o["responses"].(map[string]any); ok {
				if response, ok := resp["200"].(map[string]any); ok {
					if content, ok := response["content"].(map[string]any); ok {
						if _, ok := content["application/json"]; ok {
							op.Response, e = compiler.Compile(base + "/responses/200/content/application~1json/schema")
							if e != nil {
								return nil, fmt.Errorf("%s response: %w", op.ID, e)
							}
						}
					}
				}
			}
			c.Operations[op.ID] = op
		}
	}
	return c, nil
}
func escape(s string) string {
	r := ""
	for _, ch := range s {
		switch ch {
		case '~':
			r += "~0"
		case '/':
			r += "~1"
		default:
			r += string(ch)
		}
	}
	return r
}

// The frozen document uses nullable (OAS 3.0 vocabulary) inside OAS 3.1.
// Translate in memory to JSON Schema unions, including nullable $ref.
func normalize(v any) {
	switch x := v.(type) {
	case map[string]any:
		for _, child := range x {
			normalize(child)
		}
		if x["nullable"] == true {
			delete(x, "nullable")
			original := map[string]any{}
			for k, v := range x {
				original[k] = v
				delete(x, k)
			}
			x["anyOf"] = []any{original, map[string]any{"type": "null"}}
		}
	case []any:
		for _, child := range x {
			normalize(child)
		}
	}
}
func Errors(e error) []map[string]string {
	out := []map[string]string{}
	var walk func(*jsonschema.ValidationError)
	walk = func(v *jsonschema.ValidationError) {
		if len(v.Causes) > 0 {
			for _, c := range v.Causes {
				walk(c)
			}
			return
		}
		field := ""
		for _, p := range v.InstanceLocation {
			if field != "" {
				field += "."
			}
			field += fmt.Sprint(p)
		}
		if field == "" {
			field = "_"
		}
		out = append(out, map[string]string{"field": field, "message": v.Error()})
	}
	if v, ok := e.(*jsonschema.ValidationError); ok {
		walk(v)
	}
	if len(out) == 0 {
		out = append(out, map[string]string{"field": "_", "message": e.Error()})
	}
	return out
}

// Site settings declare a bare schema despite the global envelope rule.
// Validate its payload explicitly while retaining the globally required envelope.
func (c *Catalog) CheckResponse(id string, status int, body any) error {
	op, ok := c.Operations[id]
	if !ok {
		return fmt.Errorf("unknown operation %s", id)
	}
	if status == 200 && op.Response != nil {
		switch id {
		case "getSiteSettings", "adminGetSiteSettings", "adminUpdateSiteSettings":
			b, ok := body.(map[string]any)
			if !ok {
				return fmt.Errorf("missing envelope")
			}
			return op.Response.Validate(b["data"])
		default:
			return op.Response.Validate(body)
		}
	}
	return nil
}
