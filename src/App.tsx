import { useState, useEffect, useRef, type FormEvent } from 'react'

type Page = 'home' | 'services' | 'about' | 'contact'
type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'tn-theme'

function getPreferredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* ignore */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

const PAGE_PATHS: Record<Page, string> = {
  home: '/',
  services: '/services',
  about: '/about',
  contact: '/contact',
}

const PAGE_TITLES: Record<Page, string> = {
  home: 'Home | True North Accessibility',
  services: 'Services | True North Accessibility',
  about: 'About | True North Accessibility',
  contact: 'Contact | True North Accessibility',
}

const PAGE_DESCRIPTIONS: Record<Page, string> = {
  home: 'Digital accessibility consulting for WCAG, ADA, and Section 508. Audits, assistive technology testing, training, and strategy that make digital products work for everyone.',
  services: 'WCAG auditing, assistive technology testing, AR/VR accessibility, advisory, training, and policy services from TrueNorth Accessibility.',
  about: 'Meet Nic Bade and the TrueNorth Accessibility approach to building digital experiences that work for everyone.',
  contact: 'Book a free 30-minute accessibility consultation or contact TrueNorth Accessibility about audits, testing, training, and strategy.',
}

const SITE_ORIGIN = 'https://truenorth-accessibility.com'

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector(selector) as HTMLMetaElement | HTMLLinkElement | null
  if (!el) {
    const tag = attrs.rel ? 'link' : 'meta'
    el = document.createElement(tag)
    document.head.appendChild(el)
  }
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value)
  }
}

function syncDocumentMeta(page: Page) {
  const title = PAGE_TITLES[page]
  const description = PAGE_DESCRIPTIONS[page]
  const url = `${SITE_ORIGIN}${PAGE_PATHS[page]}`

  document.title = title
  upsertMeta('meta[name="description"]', { name: 'description', content: description })
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title })
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description })
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: url })
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title })
  upsertMeta('link[rel="canonical"]', { rel: 'canonical', href: url })
}

function pathToPage(pathname: string): Page {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  const entry = (Object.entries(PAGE_PATHS) as [Page, string][]).find(
    ([, path]) => path === normalized,
  )
  return entry?.[0] ?? 'home'
}

/* ─── Logo ────────────────────────────────────────────────────────────── */

function Logo({
  compact = false,
  title,
  dark = false,
}: {
  compact?: boolean
  title?: string
  dark?: boolean
}) {
  const w = compact ? 150 : 185
  const h = compact ? 49 : 60
  const decorative = !title
  /* on-white: navy mark; on-black: white mark for dark backgrounds */
  const circle = dark ? '#ffffff' : '#1e3a5f'
  const star = dark ? '#000000' : '#ffffff'
  const wordmark = dark ? '#ffffff' : '#1e3a5f'
  const tagline = dark ? '#b8b8b8' : '#595959'
  return (
    <svg
      width={w}
      height={h}
      viewBox="40 42 430 148"
      xmlns="http://www.w3.org/2000/svg"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <circle cx="110" cy="110" r="70" fill={circle} />
      <path
        d="M110 50 L124 96 L170 110 L124 124 L110 170 L96 124 L50 110 L96 96 Z"
        fill={star}
      />
      <circle cx="110" cy="110" r="10" fill={circle} />
      <text
        x="210"
        y="100"
        fontFamily="Arial, sans-serif"
        fontSize="42"
        fontWeight="700"
        fill={wordmark}
      >
        TrueNorth
      </text>
      <text
        x="210"
        y="140"
        fontFamily="Arial, sans-serif"
        fontSize="24"
        fontWeight="400"
        letterSpacing="2"
        fill={tagline}
      >
        ACCESSIBILITY
      </text>
    </svg>
  )
}

function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: Theme
  onToggle: () => void
}) {
  const isDark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="p-2 rounded text-slate hover:text-ink transition-colors"
    >
      {isDark ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}

/* ─── Data ────────────────────────────────────────────────────────────── */

const SERVICES = [
  {
    id: 'auditing',
    name: 'WCAG Auditing',
    summary:
      'Comprehensive conformance audits against WCAG 2.1 and 2.2 at levels A and AA.',
    detail:
      'Delivered as actionable reports with prioritized findings and remediation guidance. Each audit includes a detailed issue log, severity ratings, WCAG criterion references, and specific code-level recommendations your team can act on immediately.',
    includes: [
      'Manual and automated testing',
      'Screen reader and keyboard walkthroughs',
      'Prioritized findings report',
      'WCAG 2.1 and 2.2 A/AA criterion mapping',
      'Remediation guidance with code examples',
      'Executive summary for stakeholders',
    ],
  },
  {
    id: 'at-testing',
    name: 'Assistive Technology Testing',
    summary: 'Manual testing with the assistive technologies your users actually rely on.',
    detail:
      'Real testing across screen readers (NVDA, JAWS, VoiceOver, TalkBack), voice control (Dragon NaturallySpeaking, Voice Control), switch access, zoom and magnification tools, and keyboard-only navigation across Windows, macOS, iOS, and Android.',
    includes: [
      'NVDA, JAWS, VoiceOver, and TalkBack testing',
      'Voice control and switch access evaluation',
      'Zoom and magnification tool testing',
      'Keyboard-only navigation audit',
      'Cross-platform and cross-browser coverage',
      'Annotated video recordings of issues found',
    ],
  },
  {
    id: 'emerging',
    name: 'AR/VR & Emerging Interfaces',
    summary: "Accessibility evaluation for interfaces that don't fit legacy checklists.",
    detail:
      'AR/VR experiences, AI chat features, kiosks, voice interfaces, and other non-traditional interfaces require specialized evaluation frameworks. TrueNorth has developed approaches for these experiences when off-the-shelf checklists fall short.',
    includes: [
      'AR/VR experience accessibility review',
      'AI chat and conversational UI assessment',
      'Kiosk and touchscreen evaluation',
      'Custom evaluation framework development',
      'Standards gap analysis',
      'Emerging best-practice recommendations',
    ],
  },
  {
    id: 'advisory',
    name: 'Design & Development Advisory',
    summary: 'Embedded accessibility consultation during design and build phases.',
    detail:
      'Reviewing wireframes, component libraries, and code before issues become expensive to fix. Shift-left accessibility means your team catches problems in Figma, not in production. Includes recurring office hours, design reviews, and code review support.',
    includes: [
      'Figma and wireframe design reviews',
      'Component library accessibility assessment',
      'Code review and pull-request feedback',
      'Recurring office hours',
      'Accessible component pattern guidance',
      'Developer handoff annotation support',
    ],
  },
  {
    id: 'training',
    name: 'Training & Workshops',
    summary: 'Custom training that meets your team where they are.',
    detail:
      'Half-day introductions to multi-week curricula tailored for design, engineering, QA, and product teams. Workshops are practical and hands-on and participants leave with skills they can apply the next day, not just slides.',
    includes: [
      'Role-specific workshops (design, dev, QA, PM)',
      'Half-day to multi-week formats',
      'Hands-on screen reader lab sessions',
      'WCAG criteria deep dives',
      'Custom exercises using your own products',
      'Follow-up Q&A and resource library',
    ],
  },
  {
    id: 'policy',
    name: 'Policy & Strategy',
    summary: 'Build the internal infrastructure that makes accessibility sustainable.',
    detail:
      "Helping organizations develop internal accessibility programs, maturity models, procurement policies, and legal risk frameworks. Whether you're responding to a lawsuit or building proactively, TrueNorth helps you create systems that outlast any single project.",
    includes: [
      'Accessibility program design',
      'Maturity model assessment and roadmap',
      'Procurement and vendor policy guidance',
      'ADA / Section 508 risk framework',
      'VPAT authoring and review',
      'Legal and regulatory context briefings',
    ],
  },
]

const STANDARDS = [
  { label: 'WCAG 2.1 & 2.2', desc: 'A and AA conformance' },
  { label: 'ADA', desc: 'Americans with Disabilities Act' },
  { label: 'Section 508', desc: 'Federal accessibility standard' },
  { label: 'EN 301 549', desc: 'European accessibility standard' },
]

const CERTS = [
  { name: 'Innovation Strategy Certificate', org: 'Cornell University', year: '2026' },
  { name: 'Leading a Culture of Service Excellence', org: 'Cornell University', year: '2025' },
  { name: 'Full Stack Software Engineering', org: 'Prime Digital Academy', year: '2017' },
]

/* ─── Shared atoms ────────────────────────────────────────────────────── */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-forest text-xs font-semibold tracking-widest uppercase mb-3">
      {children}
    </p>
  )
}

function Divider() {
  return <div className="border-t border-divider" role="separator" aria-hidden="true" />
}

function CTAButton({
  onClick,
  children,
  variant = 'primary',
}: {
  onClick: () => void
  children: React.ReactNode
  variant?: 'primary' | 'secondary'
}) {
  const base =
    'inline-block px-6 py-3 text-sm font-medium rounded transition-colors'
  const styles =
    variant === 'primary'
      ? 'bg-forest-btn text-white hover:bg-forest-btn-hover'
      : 'border border-slate text-ink hover:border-forest hover:text-forest'
  return (
    <button onClick={onClick} className={`${base} ${styles}`}>
      {children}
    </button>
  )
}

/* ─── Nav ─────────────────────────────────────────────────────────────── */

const NAV_LINKS: { label: string; page: Page; path: string }[] = [
  { label: 'Home', page: 'home', path: '/' },
  { label: 'Services', page: 'services', path: '/services' },
  { label: 'About', page: 'about', path: '/about' },
  { label: 'Contact', page: 'contact', path: '/contact' },
]

const LEARN_URL = 'https://learn.truenorth-accessibility.com'

function Nav({
  page,
  navigate,
  theme,
  onToggleTheme,
}: {
  page: Page
  navigate: (p: Page) => void
  theme: Theme
  onToggleTheme: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const hamburgerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const dark = theme === 'dark'

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && menuOpen) {
        setMenuOpen(false)
        hamburgerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [menuOpen])

  useEffect(() => {
    if (menuOpen) {
      const first = menuRef.current?.querySelector<HTMLElement>('a, button')
      first?.focus()
    }
  }, [menuOpen])

  const go = (p: Page) => {
    navigate(p)
    setMenuOpen(false)
  }

  return (
    <header className="sticky top-0 z-40 bg-cream border-b border-divider" role="banner">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo link */}
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); go('home') }}
          className="rounded"
        >
          <Logo dark={dark} />
          <span className="sr-only">TrueNorth Accessibility, Home</span>
        </a>

        {/* Desktop nav */}
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-8 list-none m-0 p-0">
            {NAV_LINKS.map((link) => (
              <li key={link.page}>
                <a
                  href={link.path}
                  onClick={(e) => { e.preventDefault(); go(link.page) }}
                  aria-current={page === link.page ? 'page' : undefined}
                  className={`text-sm font-medium tracking-wide transition-colors rounded ${
                    page === link.page
                      ? 'text-forest underline underline-offset-4'
                      : 'text-slate hover:text-ink'
                  }`}
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href={LEARN_URL}
                className="text-sm font-medium tracking-wide text-slate hover:text-ink transition-colors rounded"
              >
                Learn
              </a>
            </li>
            <li>
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </li>
            <li>
              <a
                href="/contact"
                onClick={(e) => { e.preventDefault(); go('contact') }}
                className="ml-2 px-4 py-2 bg-forest-btn text-white text-sm font-medium rounded hover:bg-forest-btn-hover transition-colors"
              >
                Book a Consultation
              </a>
            </li>
          </ul>
        </nav>

        {/* Mobile controls */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button
            ref={hamburgerRef}
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((o) => !o)}
            className="p-2 rounded text-ink hover:text-forest transition-colors"
          >
            {menuOpen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 6h16M4 12h16M4 18h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          id="mobile-menu"
          ref={menuRef}
          className="md:hidden border-t border-divider bg-cream px-6 py-5"
        >
          <ul className="flex flex-col gap-4 list-none m-0 p-0">
            {NAV_LINKS.map((link) => (
              <li key={link.page}>
                <a
                  href={link.path}
                  onClick={(e) => { e.preventDefault(); go(link.page) }}
                  aria-current={page === link.page ? 'page' : undefined}
                  className={`text-sm font-medium py-1 rounded ${
                    page === link.page
                      ? 'text-forest underline underline-offset-4'
                      : 'text-ink'
                  }`}
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href={LEARN_URL}
                className="text-sm font-medium py-1 text-ink rounded"
              >
                Learn
              </a>
            </li>
            <li>
              <a
                href="/contact"
                onClick={(e) => { e.preventDefault(); go('contact') }}
                className="inline-block px-4 py-2 bg-forest-btn text-white text-sm font-medium rounded text-center"
              >
                Book a Consultation
              </a>
            </li>
          </ul>
        </div>
      )}
    </header>
  )
}

/* ─── Footer ──────────────────────────────────────────────────────────── */

function Footer({
  navigate,
  theme,
}: {
  navigate: (p: Page) => void
  theme: Theme
}) {
  return (
    <footer className="border-t border-divider bg-cream" role="contentinfo">
      <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <Logo compact title="TrueNorth Accessibility logo" dark={theme === 'dark'} />
          <p className="text-xs text-slate mt-3 leading-relaxed">
            &copy; {new Date().getFullYear()} TrueNorth Accessibility LLC.
            <br />
            All rights reserved.
          </p>
        </div>
        <nav aria-label="Footer" className="text-sm text-slate">
          <ul className="flex flex-col sm:flex-row gap-4 sm:gap-6 list-none m-0 p-0">
            {NAV_LINKS.map((link) => (
              <li key={link.page}>
                <a
                  href={link.path}
                  onClick={(e) => { e.preventDefault(); navigate(link.page) }}
                  className="hover:text-ink rounded transition-colors"
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href={LEARN_URL}
                className="hover:text-ink rounded transition-colors"
              >
                Learn
              </a>
            </li>
            <li>
              <a
                href="mailto:hello@truenorth-accessibility.com"
                className="hover:text-ink rounded transition-colors"
              >
                Email us
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}

/* ─── Home Page ───────────────────────────────────────────────────────── */

function HomePage({ navigate }: { navigate: (p: Page) => void }) {
  return (
    <>
      {/* Hero */}
      <section
        aria-labelledby="hero-heading"
        className="max-w-5xl mx-auto px-6 pt-20 pb-24 md:pt-28 md:pb-32"
      >
        <Eyebrow>Digital Accessibility Consulting</Eyebrow>
        <h1
          id="hero-heading"
          className="font-serif text-4xl md:text-6xl text-ink leading-tight mb-6 max-w-3xl"
        >
          Making digital work
          <br />
          for every body.
        </h1>
        <p className="text-lg text-slate max-w-2xl mb-10 leading-relaxed">
          TrueNorth Accessibility partners with organizations to build digital
          products that everyone can use, including people who rely on screen
          readers, keyboards, voice control, and other assistive technologies.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <CTAButton onClick={() => navigate('contact')}>Book a Consultation</CTAButton>
          <CTAButton onClick={() => navigate('services')} variant="secondary">
            View Services
          </CTAButton>
        </div>
      </section>

      <Divider />

      {/* Services overview */}
      <section
        aria-labelledby="services-overview-heading"
        className="max-w-5xl mx-auto px-6 py-16 md:py-24"
      >
        <Eyebrow>What We Do</Eyebrow>
        <h2
          id="services-overview-heading"
          className="font-serif text-3xl text-ink mb-12"
        >
          Core Services
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {SERVICES.slice(0, 4).map((service) => (
            <div
              key={service.id}
              className="border border-divider rounded-sm p-7 hover:border-forest transition-colors"
            >
              <h3 className="font-serif text-xl text-ink mb-2">{service.name}</h3>
              <p className="text-sm text-slate leading-relaxed">{service.summary}</p>
              <a
                href="/services"
                onClick={(e) => { e.preventDefault(); navigate('services') }}
                className="mt-5 inline-block text-forest text-sm font-medium hover:underline rounded"
              >
                Learn more
                <span className="sr-only"> about {service.name}</span>
              </a>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <a
            href="/services"
            onClick={(e) => { e.preventDefault(); navigate('services') }}
            className="text-forest text-sm font-medium hover:underline rounded"
          >
            View all six services
          </a>
        </div>
      </section>

      <Divider />

      {/* Standards & Trust */}
      <section
        aria-labelledby="standards-heading"
        className="max-w-5xl mx-auto px-6 py-16 md:py-24"
      >
        <Eyebrow>Standards & Compliance</Eyebrow>
        <h2 id="standards-heading" className="font-serif text-3xl text-ink mb-4">
          Built on established standards
        </h2>
        <p className="text-slate max-w-xl mb-10 leading-relaxed">
          Every engagement is grounded in recognized international standards so
          your organization can speak confidently to legal, procurement, and
          regulatory requirements.
        </p>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {STANDARDS.map((item) => (
            <div key={item.label} className="border border-divider rounded-sm p-5">
              <dt className="font-semibold text-ink text-sm mb-1">{item.label}</dt>
              <dd className="text-xs text-slate m-0">{item.desc}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Divider />

      {/* CTA banner */}
      <section
        aria-labelledby="cta-heading"
        className="max-w-5xl mx-auto px-6 py-16 md:py-24"
      >
        <div className="bg-surface rounded-sm p-10 md:p-14">
          <Eyebrow>Get Started</Eyebrow>
          <h2
            id="cta-heading"
            className="font-serif text-3xl md:text-4xl text-ink mb-4 max-w-xl leading-snug"
          >
            Ready to make your digital product accessible?
          </h2>
          <p className="text-slate mb-8 max-w-lg leading-relaxed">
            Whether you're starting from scratch or untangling years of technical
            debt, TrueNorth Accessibility can help you build a clear path forward.
          </p>
          <CTAButton onClick={() => navigate('contact')}>Book a Consultation</CTAButton>
        </div>
      </section>
    </>
  )
}

/* ─── Services Page ───────────────────────────────────────────────────── */

function ServicesPage({ navigate }: { navigate: (p: Page) => void }) {
  return (
    <div className="max-w-5xl mx-auto px-6 py-16 md:py-24">
      <Eyebrow>What We Offer</Eyebrow>
      <h1 className="font-serif text-4xl md:text-5xl text-ink mb-4">Services</h1>
      <p className="text-slate max-w-2xl mb-16 leading-relaxed text-lg">
        Every engagement is tailored to your organization's context, maturity
        level, and goals. Request a quote or book a consultation to discuss what
        makes sense for you.
      </p>

      <div className="flex flex-col divide-y divide-divider">
        {SERVICES.map((service, i) => (
          <div key={service.id} className="py-14 first:pt-0 last:pb-0">
            <div className="grid md:grid-cols-[220px_1fr] gap-8 md:gap-14">
              <div>
                <p className="text-xs text-slate mb-2 font-medium tabular-nums">
                  0{i + 1}
                </p>
                <h2 className="font-serif text-2xl text-ink mb-3 leading-snug">
                  {service.name}
                </h2>
                <p className="text-sm text-slate leading-relaxed">{service.summary}</p>
              </div>
              <div>
                <p className="text-sm text-slate leading-relaxed mb-7">{service.detail}</p>
                <h3
                  id={`included-${service.id}`}
                  className="text-forest text-xs font-semibold tracking-widest uppercase mb-3"
                >
                  {"What's Included"}
                </h3>
                <ul
                  className="flex flex-col gap-2"
                  aria-labelledby={`included-${service.id}`}
                >
                  {service.includes.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-slate">
                      <span
                        className="mt-1.5 w-1.5 h-1.5 flex-shrink-0 rounded-full bg-forest"
                        aria-hidden="true"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-divider pt-16 mt-4">
        <div className="bg-surface rounded-sm p-10">
          <h2 className="font-serif text-2xl text-ink mb-3">Not sure where to start?</h2>
          <p className="text-slate mb-6 leading-relaxed">
            Book a free 30-minute consultation and we'll help you figure out which
            services make sense for your organization right now.
          </p>
          <a
            href="/contact"
            onClick={(e) => { e.preventDefault(); navigate('contact') }}
            className="inline-block px-6 py-3 text-sm font-medium rounded transition-colors bg-forest-btn text-white hover:bg-forest-btn-hover"
          >
            Book a Free Consultation
          </a>
        </div>
      </div>
    </div>
  )
}

/* ─── About Page ──────────────────────────────────────────────────────── */

function AboutPage({ navigate }: { navigate: (p: Page) => void }) {
  return (
    <div className="max-w-5xl mx-auto px-6 py-16 md:py-24">
      <Eyebrow>Our Story</Eyebrow>
      <h1 className="font-serif text-4xl md:text-5xl text-ink mb-16">
        About TrueNorth
      </h1>

      {/* Founder bio */}
      <section aria-labelledby="bio-heading" className="mb-16">
        <div className="grid md:grid-cols-[1fr_280px] gap-12 md:gap-20">
          <div className="flex flex-col gap-5">
            <h2
              id="bio-heading"
              className="font-serif text-2xl text-ink leading-snug"
            >
              Nic Bade, Accessibility Consultant
            </h2>
            <p className="text-sm text-slate -mt-2">
              <a
                href="https://nicbade.com"
                className="text-forest font-medium hover:underline rounded"
                rel="noopener noreferrer"
              >
                nicbade.com
              </a>
            </p>
            <p className="text-slate leading-relaxed">
              Nic builds digital experiences that work for everyone. He's
              passionate about accessibility, not just as a job, but as a way to
              give people independence.
            </p>
            <p className="text-slate leading-relaxed">
              He gets it firsthand: Nic has dyslexia and uses a screen reader
              for technical reading, since hearing and reading text together helps
              him process information. That personal connection goes back further
              He used to read aloud to his grandfather after he lost his sight
              later in life, a memory that still shapes why this work matters to
              him.
            </p>
            <p className="text-slate leading-relaxed">
              Before founding TrueNorth Accessibility, Nic spent years as a
              full-stack software engineer and accessibility consultant, building the intuition for where
              accessibility breaks down in real codebases and why it is so much
              cheaper to get it right upfront.
            </p>
          </div>

          {/* Decorative mark */}
          <div
            aria-hidden="true"
            className="hidden md:flex items-start pt-2"
          >
            <div className="w-full rounded-sm bg-surface border border-divider aspect-square flex items-center justify-center">
              <svg
                viewBox="40 40 140 140"
                width="80"
                height="80"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                className="brand-mark"
              >
                <circle cx="110" cy="110" r="70" className="brand-mark__circle" />
                <path
                  d="M110 50 L124 96 L170 110 L124 124 L110 170 L96 124 L50 110 L96 96 Z"
                  className="brand-mark__star"
                />
                <circle cx="110" cy="110" r="10" className="brand-mark__center" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      <Divider />

      {/* Philosophy */}
      <section aria-labelledby="philosophy-heading" className="py-16">
        <Eyebrow>Our Philosophy</Eyebrow>
        <h2
          id="philosophy-heading"
          className="font-serif text-2xl text-ink mb-10"
        >
          Accessibility is a civil right, not a checklist
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              title: 'People-first',
              body: 'Standards exist to serve people, not the other way around. Every recommendation we make is grounded in how real people with disabilities actually use technology.',
            },
            {
              title: 'Shift left',
              body: 'Accessibility caught in design costs a fraction of what it costs to fix in production. We help teams build accessible products from the first wireframe, not the last audit.',
            },
            {
              title: 'Plain language',
              body: 'We translate standards into actionable guidance your designers, developers, and PMs can actually use. No jargon walls, no confusing criterion numbers without context.',
            },
          ].map((item) => (
            <div key={item.title}>
              <h3 className="font-serif text-lg text-ink mb-3">{item.title}</h3>
              <p className="text-sm text-slate leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <Divider />

      {/* CTA */}
      <div className="pt-16">
        <div className="bg-surface rounded-sm p-10 flex flex-col md:flex-row gap-8 items-start md:items-center justify-between">
          <div>
            <h2 className="font-serif text-2xl text-ink mb-2">
              {"Let's talk accessibility"}
            </h2>
            <p className="text-slate text-sm leading-relaxed max-w-md">
              Whether you have a specific project in mind or want to understand
              where your organization stands, we're happy to start with a
              conversation.
            </p>
          </div>
          <div className="flex-shrink-0">
            <a
              href="/contact"
              onClick={(e) => { e.preventDefault(); navigate('contact') }}
              className="inline-block px-6 py-3 text-sm font-medium rounded transition-colors bg-forest-btn text-white hover:bg-forest-btn-hover"
            >
              Get in Touch
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Contact Page ────────────────────────────────────────────────────── */

function ContactPage() {
  const [fields, setFields] = useState({
    name: '',
    email: '',
    company: '',
    service: '',
    message: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const successRef = useRef<HTMLDivElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  const validate = () => {
    const e: Record<string, string> = {}
    if (!fields.name.trim()) e.name = 'Full name is required.'
    if (!fields.email.trim()) {
      e.email = 'Email address is required.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
      e.email = 'Please enter a valid email address.'
    }
    if (!fields.message.trim()) e.message = 'Message is required.'
    return e
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) {
      setErrors(errs)
      requestAnimationFrame(() => errorRef.current?.focus())
      return
    }
    setErrors({})
    setSubmitted(true)
    requestAnimationFrame(() => successRef.current?.focus())
  }

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }))

  if (submitted) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-16 md:py-24">
        <div
          ref={successRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className="bg-surface border border-divider rounded-sm p-12 max-w-xl outline-none"
        >
          <div
            className="w-10 h-10 rounded-full bg-forest-btn flex items-center justify-center mb-6"
            aria-hidden="true"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 13l4 4L19 7"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="font-serif text-3xl text-ink mb-3">Message received</h1>
          <p className="text-slate leading-relaxed mb-6">
            Thanks for reaching out. Nic will review your message and follow up
            at{' '}
            <strong className="text-ink font-medium">
              hello@truenorth-accessibility.com
            </strong>{' '}
            within one to two business days.
          </p>
          <button
            onClick={() => {
              setSubmitted(false)
              setFields({ name: '', email: '', company: '', service: '', message: '' })
            }}
            className="text-forest text-sm font-medium hover:underline rounded"
          >
            ← Send another message
          </button>
        </div>
      </div>
    )
  }

  const inputClass = (field: string) =>
    `w-full px-4 py-3 border rounded-sm bg-cream text-ink text-sm transition-colors ${
      errors[field] ? 'border-danger-border' : 'border-divider'
    }`

  return (
    <div className="max-w-5xl mx-auto px-6 py-16 md:py-24">
      <Eyebrow>{"Let's Talk"}</Eyebrow>
      <h1 className="font-serif text-4xl md:text-5xl text-ink mb-4">Contact</h1>
      <p className="text-slate max-w-xl mb-14 leading-relaxed">
        Reach out to schedule a free 30-minute consultation or to ask about any
        of our services.
      </p>

      <div className="grid md:grid-cols-[1fr_260px] gap-16">
        {/* Form */}
        <div>
          {/* Error summary */}
          {Object.keys(errors).length > 0 && (
            <div
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              aria-live="assertive"
              className="mb-6 p-4 border border-danger-border bg-danger-bg rounded-sm outline-none"
            >
              <p className="font-medium text-danger-text text-sm mb-2">
                Please correct the following before submitting:
              </p>
              <ul className="list-disc list-inside text-sm text-danger-text space-y-1">
                {Object.values(errors).map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate aria-label="Contact form">
            <div className="flex flex-col gap-6">
              {/* Name */}
              <div>
                <label htmlFor="f-name" className="block text-sm font-medium text-ink mb-1.5">
                  Full Name{' '}
                  <span aria-hidden="true" className="text-danger-text">
                    *
                  </span>
                  <span className="sr-only">(required)</span>
                </label>
                <input
                  id="f-name"
                  type="text"
                  value={fields.name}
                  onChange={set('name')}
                  required
                  aria-required="true"
                  aria-describedby={errors.name ? 'err-name' : undefined}
                  aria-invalid={!!errors.name}
                  className={inputClass('name')}
                  autoComplete="name"
                />
                {errors.name && (
                  <p id="err-name" className="mt-1.5 text-xs text-danger-text" role="alert">
                    {errors.name}
                  </p>
                )}
              </div>

              {/* Email */}
              <div>
                <label htmlFor="f-email" className="block text-sm font-medium text-ink mb-1.5">
                  Email Address{' '}
                  <span aria-hidden="true" className="text-danger-text">
                    *
                  </span>
                  <span className="sr-only">(required)</span>
                </label>
                <input
                  id="f-email"
                  type="email"
                  value={fields.email}
                  onChange={set('email')}
                  required
                  aria-required="true"
                  aria-describedby={errors.email ? 'err-email' : undefined}
                  aria-invalid={!!errors.email}
                  className={inputClass('email')}
                  autoComplete="email"
                />
                {errors.email && (
                  <p id="err-email" className="mt-1.5 text-xs text-danger-text" role="alert">
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Company */}
              <div>
                <label htmlFor="f-company" className="block text-sm font-medium text-ink mb-1.5">
                  Organization{' '}
                  <span className="text-slate font-normal">(optional)</span>
                </label>
                <input
                  id="f-company"
                  type="text"
                  value={fields.company}
                  onChange={set('company')}
                  className={inputClass('company')}
                  autoComplete="organization"
                />
              </div>

              {/* Service */}
              <div>
                <label htmlFor="f-service" className="block text-sm font-medium text-ink mb-1.5">
                  Service of Interest{' '}
                  <span className="text-slate font-normal">(optional)</span>
                </label>
                <select
                  id="f-service"
                  value={fields.service}
                  onChange={set('service')}
                  className={`${inputClass('service')} appearance-none`}
                >
                  <option value="">Select a service…</option>
                  {SERVICES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value="other">Other / Not sure yet</option>
                </select>
              </div>

              {/* Message */}
              <div>
                <label htmlFor="f-message" className="block text-sm font-medium text-ink mb-1.5">
                  Message{' '}
                  <span aria-hidden="true" className="text-danger-text">
                    *
                  </span>
                  <span className="sr-only">(required)</span>
                </label>
                <textarea
                  id="f-message"
                  value={fields.message}
                  onChange={set('message')}
                  rows={5}
                  required
                  aria-required="true"
                  aria-describedby={errors.message ? 'err-message' : undefined}
                  aria-invalid={!!errors.message}
                  className={`${inputClass('message')} resize-y`}
                  placeholder="Tell us a bit about your project or what you're looking for…"
                />
                {errors.message && (
                  <p id="err-message" className="mt-1.5 text-xs text-danger-text" role="alert">
                    {errors.message}
                  </p>
                )}
              </div>

              <div>
                <button
                  type="submit"
                  className="px-6 py-3 bg-forest-btn text-white text-sm font-medium rounded hover:bg-forest-btn-hover transition-colors"
                >
                  Send Message
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Contact info sidebar */}
        <aside aria-label="Contact information">
          <div className="flex flex-col gap-8">
            <div>
              <h2 className="text-forest text-xs font-semibold tracking-widest uppercase mb-3">
                Direct Contact
              </h2>
              <div className="flex flex-col gap-4 text-sm">
                <div>
                  <p className="font-medium text-ink mb-1">Email</p>
                  <a
                    href="mailto:hello@truenorth-accessibility.com"
                    className="text-slate hover:text-forest rounded transition-colors break-all"
                  >
                    hello@truenorth-accessibility.com
                  </a>
                </div>
                <div>
                  <p className="font-medium text-ink mb-1">Response Time</p>
                  <p className="text-slate">1–2 business days</p>
                </div>
              </div>
            </div>

            <div className="border-t border-divider pt-6">
              <h2 className="text-forest text-xs font-semibold tracking-widest uppercase mb-3">
                Free Consultation
              </h2>
              <p className="text-sm text-slate leading-relaxed">
                Not sure where to start? Book a free 30-minute call to discuss
                your accessibility needs with no commitment required.
              </p>
            </div>

            <div className="border-t border-divider pt-6">
              <h2 className="text-forest text-xs font-semibold tracking-widest uppercase mb-3">
                Location
              </h2>
              <p className="text-sm text-slate leading-relaxed">
                TrueNorth Accessibility LLC serves clients nationwide, working
                remotely across all time zones.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

/* ─── App ─────────────────────────────────────────────────────────────── */

export default function App() {
  const [page, setPage] = useState<Page>(() => pathToPage(window.location.pathname))
  const [theme, setTheme] = useState<Theme>(() => getPreferredTheme())
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  useEffect(() => {
    syncDocumentMeta(page)
  }, [page])

  useEffect(() => {
    const onPopState = () => {
      setPage(pathToPage(window.location.pathname))
      requestAnimationFrame(() => {
        mainRef.current?.focus()
        window.scrollTo({ top: 0 })
      })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const toggleTheme = () => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  const navigate = (to: Page) => {
    const path = PAGE_PATHS[to]
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path)
    }
    setPage(to)
    // Move focus to main content after page change (WCAG 2.4.3)
    requestAnimationFrame(() => {
      mainRef.current?.focus()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  return (
    <div className="min-h-screen bg-cream font-sans text-ink">
      {/* Skip to main content (WCAG 2.4.1) */}
      <a
        href="#main-content"
        onClick={(e) => { e.preventDefault(); mainRef.current?.focus() }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-forest-btn focus:text-white focus:rounded"
      >
        Skip to main content
      </a>

      <Nav page={page} navigate={navigate} theme={theme} onToggleTheme={toggleTheme} />

      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="outline-none"
      >
        {page === 'home' && <HomePage navigate={navigate} />}
        {page === 'services' && <ServicesPage navigate={navigate} />}
        {page === 'about' && <AboutPage navigate={navigate} />}
        {page === 'contact' && <ContactPage />}
      </main>

      <Footer navigate={navigate} theme={theme} />
    </div>
  )
}
