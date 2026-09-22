// @file: plugins/golang/e2e/fixtures/go-clean-full/main.go
// @spec: CLI-VERIFY
// @consumers: N/A
package main

func main() {
	println(greet())
}

func greet() string {
	return "hi"
}
