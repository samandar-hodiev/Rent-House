// What every test can assume.
//
// `toBeInTheDocument` and the rest come from jest-dom; without them an
// assertion about the screen reads as an assertion about an object.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Rendered components are torn down between tests, so one test's screen is
// never another's.
afterEach(() => {
  cleanup()
})
