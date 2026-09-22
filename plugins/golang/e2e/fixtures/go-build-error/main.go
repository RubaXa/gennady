// @file: plugins/golang/e2e/fixtures/go-build-error/main.go
// @spec: CLI-VERIFY
// @consumers: N/A
package main

func main() {
	var x int = "not an int"
	_ = x
}
