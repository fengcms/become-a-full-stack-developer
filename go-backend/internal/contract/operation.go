package contract

import (
	"fmt"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

// objectAt 沿固定键读取对象；缺失字段留给操作元数据判断，不做裸类型断言。
func objectAt(value any, keys ...string) map[string]any {
	for _, key := range keys {
		object, ok := value.(map[string]any)
		if !ok {
			return nil
		}
		value = object[key]
	}
	object, _ := value.(map[string]any)
	return object
}

// operationAt 独立解释一个操作，让 Load 只负责目录遍历和编译器生命周期。
func operationAt(path, method string, value any, responseCompiler, inputCompiler *jsonschema.Compiler) (Operation, error) {
	object, ok := value.(map[string]any)
	if !ok || object["operationId"] == nil {
		return Operation{}, nil
	}
	id, ok := object["operationId"].(string)
	if !ok || id == "" {
		return Operation{}, fmt.Errorf("invalid operationId at %s %s", method, path)
	}
	op := Operation{ID: id, Method: method, Path: path}
	authz := objectAt(object, "x-authz")
	op.MinRole, _ = authz["minRole"].(string)
	op.Owner = authz["ownerOverride"] != nil
	body := objectAt(object, "requestBody")
	op.BodyRequired, _ = body["required"].(bool)
	pointer := "https://befull.local/openapi.json#/paths/" + escape(path) + "/" + method
	var err error
	if hasJSON(body) {
		op.Request, err = inputCompiler.Compile(pointer + "/requestBody/content/application~1json/schema")
		if err != nil {
			return op, fmt.Errorf("%s request: %w", id, err)
		}
	}
	response := objectAt(object, "responses", "200")
	if hasJSON(response) {
		op.Response, err = responseCompiler.Compile(pointer + "/responses/200/content/application~1json/schema")
		if err != nil {
			return op, fmt.Errorf("%s response: %w", id, err)
		}
	}
	return op, nil
}

func hasJSON(object map[string]any) bool {
	_, ok := objectAt(object, "content")["application/json"]
	return ok
}
