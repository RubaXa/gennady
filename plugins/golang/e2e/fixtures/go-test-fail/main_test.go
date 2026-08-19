package main

import "testing"

func TestGreet(t *testing.T) {
	if greet() != "bye" {
		t.Fatalf("got %q", greet())
	}
}
