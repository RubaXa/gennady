// @file: plugins/golang/e2e/fixtures/go-fix-missing-tool/main.go
// @spec: CLI-VERIFY
// @consumers: N/A
package main

//go:generate gennady-absent-generator out.txt

func main() {}
