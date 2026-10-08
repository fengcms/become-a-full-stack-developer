// Package contract loads the checked-in, generated snapshot of the frozen API.
package contract

import (
	"embed"
	"encoding/json"
	"fmt"

	"github.com/santhosh-tekuri/jsonschema/v6"
	"github.com/santhosh-tekuri/jsonschema/v6/kind"
)

//go:embed openapi.json
var source embed.FS

// Operation 记录冻结操作的路径、权限和编译后的输入输出校验器。
type Operation struct {
	BodyRequired              bool
	ID, Method, Path, MinRole string
	Owner                     bool
	Request, Response         *jsonschema.Schema
}

// Catalog 保存操作目录和响应信封规则，供启动装配及测试复用。
type Catalog struct {
	Operations                 map[string]Operation
	Document                   map[string]any
	Envelope, ValidationErrors *jsonschema.Schema
}

// Load 读取嵌入快照，在内存规范化后编译各操作的 JSON Schema。
func Load() (*Catalog, error) {
	raw, err := source.ReadFile("openapi.json")
	if err != nil {
		return nil, err
	}
	var doc map[string]any
	if err = json.Unmarshal(raw, &doc); err != nil {
		return nil, err
	}
	normalize(doc)
	compiler := jsonschema.NewCompiler()
	if err = compiler.AddResource("https://befull.local/openapi.json", doc); err != nil {
		return nil, err
	}
	inputCompiler := jsonschema.NewCompiler()
	inputCompiler.AssertFormat()
	if err = inputCompiler.AddResource("https://befull.local/openapi.json", doc); err != nil {
		return nil, err
	}
	c := &Catalog{Operations: map[string]Operation{}, Document: doc}
	c.Envelope, err = compiler.Compile("https://befull.local/openapi.json#/components/schemas/ApiResponse")
	if err != nil {
		return nil, err
	}
	c.ValidationErrors, err = compiler.Compile("https://befull.local/openapi.json#/components/schemas/ValidationErrorList")
	if err != nil {
		return nil, err
	}
	paths, ok := doc["paths"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("contract paths must be an object")
	}
	for path, value := range paths {
		methods, ok := value.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("contract path %s must be an object", path)
		}
		for method, value := range methods {
			op, err := operationAt(path, method, value, compiler, inputCompiler)
			if err != nil {
				return nil, err
			}
			if op.ID != "" {
				c.Operations[op.ID] = op
			}
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

// 冻结文件在 OAS 3.1 内沿用 nullable，只在内存转换为 JSON Schema union。
// 不写回源文件，也不把可空字段误解释为未提交字段。
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

// Errors 将校验树展开成字段错误，必填字段保留具体路径。
func Errors(err error) []map[string]string {
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
		if required, ok := v.ErrorKind.(*kind.Required); ok {
			for _, missing := range required.Missing {
				path := missing
				if field != "" {
					path = field + "." + missing
				}
				out = append(out, map[string]string{"field": path, "message": "该字段为必填项"})
			}
			return
		}
		if field == "" {
			field = "_"
		}
		out = append(out, map[string]string{"field": field, "message": v.Error()})
	}
	if v, ok := err.(*jsonschema.ValidationError); ok {
		walk(v)
	}
	if len(out) == 0 {
		out = append(out, map[string]string{"field": "_", "message": err.Error()})
	}
	return out
}

// CheckResponse 保留全局响应信封，同时单独校验站点设置的裸 payload schema。
// 这是处理冻结资料内部差异，不修改各客户端已经依赖的响应形状。
func (c *Catalog) CheckResponse(id string, status int, body any) error {
	if err := c.Envelope.Validate(body); err != nil {
		return err
	}
	if b, ok := body.(map[string]any); ok && b["code"] == float64(4001) {
		if err := c.ValidationErrors.Validate(b["data"]); err != nil {
			return err
		}
	}
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
