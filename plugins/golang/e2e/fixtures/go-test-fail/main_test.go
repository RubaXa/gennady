// @file: plugins/golang/e2e/fixtures/go-test-fail/main_test.go
// @spec: CLI-VERIFY
// @consumers: N/A
package main

import "testing"

func TestGreet(t *testing.T) {
	if greet() != "bye" {
		t.Fatalf("got %q", greet())
	}
}
