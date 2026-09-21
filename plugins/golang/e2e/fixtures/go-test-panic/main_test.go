// @file: plugins/golang/e2e/fixtures/go-test-panic/main_test.go
// @spec: CLI-VERIFY
// @consumers: N/A
package main

import "testing"

func TestBoom(t *testing.T) {
	boom()
}
