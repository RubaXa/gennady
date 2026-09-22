// @file: plugins/golang/e2e/fixtures/go-clean-full/main_test.go
// @spec: CLI-VERIFY
// @consumers: N/A
package main

import "testing"

func TestGreet(t *testing.T) {
	if greet() != "hi" {
		t.Fatal("bad")
	}
}
