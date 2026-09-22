// @file: plugins/golang/e2e/fixtures/go-vet-error/main.go
// @spec: CLI-VERIFY
// @consumers: N/A
package main

import "io"

func main() {
	// vet: composite literal uses unkeyed fields
	_ = io.LimitedReader{nil, 3}
}
