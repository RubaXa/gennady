// @file: plugins/golang/e2e/fixtures/go-test-fail/main.go
// @spec: CLI-VERIFY
// @consumers: N/A
package main

func greet() string { return "hi" }

func main() { _ = greet() }
