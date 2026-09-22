// @file: plugins/golang/e2e/fixtures/go-generate-fix-loop/main.go
// @spec: CLI-VERIFY
// @consumers: N/A
package main

//go:generate sh -c "printf generated > gen.out"

func main() {}
