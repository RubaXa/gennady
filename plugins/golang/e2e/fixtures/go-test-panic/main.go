// @file: plugins/golang/e2e/fixtures/go-test-panic/main.go
// @spec: CLI-VERIFY
// @consumers: N/A
package main

func boom() { panic("boom") }

func main() {}
