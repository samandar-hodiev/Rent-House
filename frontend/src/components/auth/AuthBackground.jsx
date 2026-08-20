/**
 * The atmosphere behind every auth screen.
 *
 * Four layers, back to front: a faint architectural grid, three ambient glows
 * (emerald, blue, rose), two very slow orbital arcs, and a scatter of tiny
 * points. Together they give the page depth without ever competing with the
 * card — every element here is under 20% opacity and most are far below it.
 *
 * The two themes are composed separately rather than one being an inversion of
 * the other. Dark mode carries light against deep navy, so the glows can be
 * tighter and more saturated. Light mode uses larger, softer, much fainter
 * washes, because on a near-white ground a small saturated blob reads as a
 * smudge rather than as light.
 *
 * Everything is `pointer-events-none` and absolutely positioned, so none of it
 * can intercept a click or shift the layout.
 */
function AuthBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <Grid />
      <Glows />
      <OrbitalArcs />
      <Particles />
    </div>
  )
}

// Masked so it fades out before it reaches the card. Lighter in dark mode,
// where a pale line on a dark ground is far more visible per unit of opacity.
function Grid() {
  return (
    <div
      className="animate-grid absolute inset-0 [--grid-opacity:0.45] dark:[--grid-opacity:0.26]"
      style={{
        opacity: 'var(--grid-opacity)',
        backgroundImage:
          'linear-gradient(to right, var(--color-border) 1px, transparent 1px),' +
          'linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
        backgroundSize: '56px 56px',
        maskImage: 'radial-gradient(ellipse 76% 56% at 50% 45%, transparent 30%, black 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 76% 56% at 50% 45%, transparent 30%, black 100%)',
      }}
    />
  )
}

/**
 * Three glows on deliberately mismatched cycles (24s, 31s, 38s) so they never
 * fall into step and produce a visible pulse.
 *
 * Emerald leads because it is the brand colour; blue and rose are supporting
 * accents kept at roughly half its strength. Enough to make the light feel
 * coloured rather than grey, not enough to read as "a colourful background".
 */
function Glows() {
  return (
    <>
      {/* Emerald — upper left, the dominant light source. */}
      <div
        className="animate-glow-a absolute -left-[18%] -top-[22%] size-[38rem] rounded-full blur-3xl
                   bg-[radial-gradient(circle,rgba(16,185,129,0.10)_0%,rgba(16,185,129,0.04)_45%,transparent_70%)]
                   dark:size-[32rem] dark:bg-[radial-gradient(circle,rgba(16,185,129,0.20)_0%,rgba(16,185,129,0.07)_45%,transparent_70%)]
                   sm:size-[44rem] dark:sm:size-[36rem]"
      />

      {/* Blue — lower right, cooling the composition. */}
      <div
        className="animate-glow-b absolute -bottom-[26%] -right-[16%] size-[40rem] rounded-full blur-3xl
                   bg-[radial-gradient(circle,rgba(56,138,229,0.07)_0%,rgba(20,184,166,0.03)_45%,transparent_70%)]
                   dark:size-[34rem] dark:bg-[radial-gradient(circle,rgba(59,130,246,0.13)_0%,rgba(20,184,166,0.05)_45%,transparent_70%)]
                   sm:size-[46rem] dark:sm:size-[38rem]"
      />

      {/* Rose — upper right, the smallest and faintest of the three. It stops
          the palette from being only green and blue, which would read cold. */}
      <div
        className="animate-glow-c absolute -right-[12%] -top-[18%] size-[26rem] rounded-full blur-3xl
                   bg-[radial-gradient(circle,rgba(244,114,182,0.05)_0%,transparent_65%)]
                   dark:size-[22rem] dark:bg-[radial-gradient(circle,rgba(244,114,182,0.10)_0%,transparent_65%)]
                   sm:size-[30rem] dark:sm:size-[26rem]"
      />

      {/* Light mode only: a broad neutral lift so the card sits on a pool of
          light rather than a flat sheet. Dark mode does not need it — the
          card's own surface already separates it from the ground. */}
      <div className="absolute left-1/2 top-1/2 size-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.8)_0%,transparent_65%)] blur-2xl dark:hidden sm:size-[58rem]" />
    </>
  )
}

/**
 * Two enormous thin rings, centred behind the card and rotating over minutes.
 *
 * They are what makes the background feel constructed rather than randomly
 * blurred. Sized in viewport units so the composition holds together on a
 * 1920px monitor, where a fixed-size decoration would look lost.
 */
function OrbitalArcs() {
  return (
    <>
      <div
        className="animate-orbit-slow absolute left-1/2 top-1/2 hidden size-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/[0.07] dark:border-primary/[0.10] sm:block"
        style={{
          maskImage: 'linear-gradient(160deg, black 0%, transparent 55%)',
          WebkitMaskImage: 'linear-gradient(160deg, black 0%, transparent 55%)',
        }}
      />
      <div
        className="animate-orbit-slower absolute left-1/2 top-1/2 hidden size-[64rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/[0.05] dark:border-primary/[0.08] lg:block"
        style={{
          maskImage: 'linear-gradient(20deg, black 0%, transparent 60%)',
          WebkitMaskImage: 'linear-gradient(20deg, black 0%, transparent 60%)',
        }}
      />
    </>
  )
}

// Percentage positions so they follow the viewport rather than sitting at fixed
// pixels. Kept away from the centre column where the card lives.
const POINTS = [
  { top: '18%', left: '12%', delay: '0s', size: 'size-1' },
  { top: '32%', left: '84%', delay: '-6s', size: 'size-[3px]' },
  { top: '68%', left: '9%', delay: '-11s', size: 'size-[3px]' },
  { top: '78%', left: '88%', delay: '-3s', size: 'size-1' },
  { top: '12%', left: '68%', delay: '-14s', size: 'size-[2px]' },
  { top: '86%', left: '30%', delay: '-8s', size: 'size-[2px]' },
]

// Tiny points that drift and fade. Hidden below `sm:` — on a phone the card
// fills most of the screen and they would only crowd it.
function Particles() {
  return (
    <div className="hidden sm:block">
      {POINTS.map((point, index) => (
        <span
          key={index}
          className={`animate-drift absolute ${point.size} rounded-full bg-primary/25 dark:bg-primary/40`}
          style={{ top: point.top, left: point.left, animationDelay: point.delay }}
        />
      ))}
    </div>
  )
}

export default AuthBackground
