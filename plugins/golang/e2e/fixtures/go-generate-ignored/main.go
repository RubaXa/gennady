// @file: plugins/golang/e2e/fixtures/go-generate-ignored/main.go
// @spec: CLI-VERIFY
// @consumers: N/A
package main

//go:generate sh -c "printf fresh > gen.out"

func main() {}
