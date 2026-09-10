package main

import "io"

func main() {
	// vet: composite literal uses unkeyed fields
	_ = io.LimitedReader{nil, 3}
}
