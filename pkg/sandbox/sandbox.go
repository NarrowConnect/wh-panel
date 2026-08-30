package sandbox

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/dop251/goja"
)

const (
	maxScriptLength  = 10000         // 10KB max script size
	executionTimeout = 3 * time.Second // 3 second max execution time
)

type ExecutionResult struct {
	Output interface{} `json:"output"`
	Error  string      `json:"error,omitempty"`
}

// ExecuteJSScript runs a lightweight JS transformation script in a Goja VM sandbox with timeout and size limits
func ExecuteJSScript(script string, inputPayload interface{}) (interface{}, error) {
	if script == "" {
		return inputPayload, nil
	}

	if len(script) > maxScriptLength {
		return nil, fmt.Errorf("script exceeds maximum allowed size of %d bytes", maxScriptLength)
	}

	// Run with timeout to prevent infinite loops
	ctx, cancel := context.WithTimeout(context.Background(), executionTimeout)
	defer cancel()

	resultCh := make(chan interface{}, 1)
	errCh := make(chan error, 1)

	go func() {
		vm := goja.New()

		// Disable dangerous globals
		vm.Set("require", goja.Undefined())
		vm.Set("process", goja.Undefined())
		vm.Set("globalThis", goja.Undefined())

		// Inject input payload into JS global 'payload' variable
		if err := vm.Set("payload", inputPayload); err != nil {
			errCh <- fmt.Errorf("failed to inject payload into JS sandbox: %w", err)
			return
		}

		// Wrapper to return transformed payload
		jsCode := fmt.Sprintf(`
			(function() {
				%s
				if (typeof transform === 'function') {
					return transform(payload);
				}
				return payload;
			})()
		`, script)

		val, err := vm.RunString(jsCode)
		if err != nil {
			errCh <- fmt.Errorf("JS sandbox execution error: %w", err)
			return
		}

		if val == nil || goja.IsUndefined(val) || goja.IsNull(val) {
			errCh <- errors.New("JS script returned null or undefined")
			return
		}

		resultCh <- val.Export()
	}()

	select {
	case result := <-resultCh:
		return result, nil
	case err := <-errCh:
		return nil, err
	case <-ctx.Done():
		return nil, errors.New("JS sandbox execution timed out (3 second limit)")
	}
}
