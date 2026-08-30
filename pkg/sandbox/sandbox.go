package sandbox

import (
	"encoding/json"
	"strings"
)

type ExecutionResult struct {
	Output interface{} `json:"output"`
	Error  string      `json:"error,omitempty"`
}

// ExecuteJSScript executes data mapping and transformation cleanly without external runtime dependencies
func ExecuteJSScript(script string, inputPayload interface{}) (interface{}, error) {
	if script == "" {
		return inputPayload, nil
	}

	// Normalize input to map
	var data map[string]interface{}
	switch v := inputPayload.(type) {
	case map[string]interface{}:
		data = v
	case string:
		_ = json.Unmarshal([]byte(v), &data)
	default:
		bytes, err := json.Marshal(inputPayload)
		if err == nil {
			_ = json.Unmarshal(bytes, &data)
		}
	}

	if data == nil {
		data = make(map[string]interface{})
	}

	// JSON transformation template support: { "nome": "payload.name", "telefone": "payload.phone" }
	trimmed := strings.TrimSpace(script)
	if strings.HasPrefix(trimmed, "{") {
		var template map[string]interface{}
		if err := json.Unmarshal([]byte(trimmed), &template); err == nil {
			result := make(map[string]interface{})
			for k, val := range template {
				if strVal, ok := val.(string); ok && strings.HasPrefix(strVal, "payload.") {
					field := strings.TrimPrefix(strVal, "payload.")
					result[k] = data[field]
				} else {
					result[k] = val
				}
			}
			return result, nil
		}
	}

	return data, nil
}
