package otp

import (
	"testing"
)

func TestGenerateProducesSixDigits(t *testing.T) {
	for i := 0; i < 200; i++ {
		code, err := Generate()
		if err != nil {
			t.Fatalf("generate: %v", err)
		}
		if len(code) != Length {
			t.Fatalf("got %q (%d chars), want %d", code, len(code), Length)
		}
		if !IsWellFormed(code) {
			t.Fatalf("generated code %q is not six digits", code)
		}
	}
}

func TestGenerateIsNotObviouslyPredictable(t *testing.T) {
	// Not a randomness test — just a guard against a constant or a counter.
	seen := map[string]int{}
	const runs = 300
	for i := 0; i < runs; i++ {
		code, err := Generate()
		if err != nil {
			t.Fatalf("generate: %v", err)
		}
		seen[code]++
	}
	if len(seen) < runs/2 {
		t.Fatalf("only %d distinct codes in %d draws; generation looks predictable", len(seen), runs)
	}
}

func TestGenerateCanProduceLeadingZeros(t *testing.T) {
	// A code below 100000 must still be six characters. Rather than wait for a
	// 10% chance, check the formatting contract directly over many draws.
	for i := 0; i < 500; i++ {
		code, _ := Generate()
		if len(code) != Length {
			t.Fatalf("code %q lost its padding", code)
		}
	}
}

func TestHashDoesNotContainTheCode(t *testing.T) {
	const code = "483921"

	hash, err := Hash(code)
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if hash == code {
		t.Fatal("the code was stored verbatim")
	}
	if len(hash) < 50 {
		t.Fatalf("hash %q is too short to be bcrypt", hash)
	}
}

func TestHashIsSaltedPerCall(t *testing.T) {
	first, _ := Hash("483921")
	second, _ := Hash("483921")

	if first == second {
		t.Fatal("two hashes of the same code are identical; the hash is not salted")
	}
}

func TestMatches(t *testing.T) {
	const code = "483921"
	hash, err := Hash(code)
	if err != nil {
		t.Fatalf("hash: %v", err)
	}

	if !Matches(hash, code) {
		t.Fatal("the correct code did not match its hash")
	}
	for _, wrong := range []string{"483920", "000000", "48392", "4839210", "", "abcdef"} {
		if Matches(hash, wrong) {
			t.Errorf("wrong code %q matched", wrong)
		}
	}
}

func TestMatchesRejectsAGarbageHash(t *testing.T) {
	if Matches("not-a-bcrypt-hash", "483921") {
		t.Fatal("a malformed hash must never match")
	}
}

func TestIsWellFormed(t *testing.T) {
	valid := []string{"000000", "483921", "999999"}
	for _, code := range valid {
		if !IsWellFormed(code) {
			t.Errorf("%q should be accepted", code)
		}
	}

	invalid := []string{"", "12345", "1234567", "12345a", " 12345", "12 345", "-12345"}
	for _, code := range invalid {
		if IsWellFormed(code) {
			t.Errorf("%q should be rejected", code)
		}
	}
}
