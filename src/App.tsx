import { useState, useEffect, useRef, type FormEvent } from 'react'

type Page = 'home' | 'services' | 'about' | 'contact'

/* ─── Logo ────────────────────────────────────────────────────────────── */

function Logo({ compact = false }: { compact?: boolean }) {
  const w = compact ? 150 : 185
  const h = compact ? 49 : 60
  return (
    <svg
      width={w}
      height={h}
      viewBox="40 42 430 148"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="110" cy="110" r="70" fill="#1e3a5f" />
      <path
        d="M110 50 L124 96 L170 110 L124 124 L110 170 L96 124 L50 110 L96 96 Z"
        fill="#ffffff"
      />
      <circle cx="110" cy="110" r="10" fill="#1e3a5f" />
      <text
        x="210"
        y="100"
        fontFamily="Arial, sans-serif"
        fontSize="42"
        fontWeight="700"
        fill="#1e3a5f"
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
        fill="#595959"
      >
        ACCESSIBILITY
      </text>
    </svg>
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
    'inline-block px-6 py-3 text-sm font-medium rounded transition-colors focus:outline-none'
  const styles =
    variant === 'primary'
      ? 'bg-forest text-white hover:bg-forest-dark'
      : 'border border-divider text-ink hover:border-forest hover:text-forest'
  return (
    <button onClick={onClick} className={`${base} ${styles}`}>
      {children}
    </button>
  )
}

/* ─── Nav ─────────────────────────────────────────────────────────────── */

const NAV_LINKS: { label: string; page: Page }[] = [
  { label: 'Home', page: 'home' },
  { label: 'Services', page: 'services' },
  { label: 'About', page: 'about' },
  { label: 'Contact', page: 'contact' },
]

function Nav({
  page,
  navigate,
}: {
  page: Page
  navigate: (p: Page) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const hamburgerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

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
          href="#home"
          onClick={(e) => { e.preventDefault(); go('home') }}
          className="focus:outline-none rounded"
        >
          <Logo />
          <span className="sr-only">TrueNorth Accessibility, Go to homepage</span>
        </a>

        {/* Desktop nav */}
        <nav aria-label="Main navigation" className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <a
              key={link.page}
              href={`#${link.page}`}
              onClick={(e) => { e.preventDefault(); go(link.page) }}
              aria-current={page === link.page ? 'page' : undefined}
              className={`text-sm font-medium tracking-wide transition-colors focus:outline-none rounded ${
                page === link.page ? 'text-forest' : 'text-slate hover:text-ink'
              }`}
            >
              {link.label}
            </a>
          ))}
          <a
            href="#contact"
            onClick={(e) => { e.preventDefault(); go('contact') }}
            className="ml-2 px-4 py-2 bg-forest text-white text-sm font-medium rounded hover:bg-forest-dark transition-colors focus:outline-none"
          >
            Book a Consultation
          </a>
        </nav>

        {/* Mobile hamburger */}
        <button
          ref={hamburgerRef}
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((o) => !o)}
          className="md:hidden p-2 rounded text-ink hover:text-forest focus:outline-none transition-colors"
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

      {/* Mobile menu */}
      {menuOpen && (
        <div
          id="mobile-menu"
          ref={menuRef}
          className="md:hidden border-t border-divider bg-cream px-6 py-5 flex flex-col gap-4"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.page}
              href={`#${link.page}`}
              onClick={(e) => { e.preventDefault(); go(link.page) }}
              aria-current={page === link.page ? 'page' : undefined}
              className={`text-sm font-medium py-1 rounded focus:outline-none ${
                page === link.page ? 'text-forest' : 'text-ink'
              }`}
            >
              {link.label}
            </a>
          ))}
          <a
            href="#contact"
            onClick={(e) => { e.preventDefault(); go('contact') }}
            className="px-4 py-2 bg-forest text-white text-sm font-medium rounded text-center focus:outline-none"
          >
            Book a Consultation
          </a>
        </div>
      )}
    </header>
  )
}

/* ─── Footer ──────────────────────────────────────────────────────────── */

function Footer({ navigate }: { navigate: (p: Page) => void }) {
  return (
    <footer className="border-t border-divider bg-cream" role="contentinfo">
      <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <Logo compact />
          <p className="text-xs text-slate mt-3 leading-relaxed">
            &copy; {new Date().getFullYear()} TrueNorth Accessibility LLC.
            <br />
            All rights reserved.
          </p>
        </div>
        <nav aria-label="Footer navigation" className="flex flex-col sm:flex-row gap-4 sm:gap-6 text-sm text-slate">
          {NAV_LINKS.map((link) => (
            <a
              key={link.page}
              href={`#${link.page}`}
              onClick={(e) => { e.preventDefault(); navigate(link.page) }}
              className="hover:text-ink focus:outline-none rounded transition-colors"
            >
              {link.label}
            </a>
          ))}
          <a
            href="mailto:truenorth.accessibilityllc@gmail.com"
            className="hover:text-ink focus:outline-none rounded transition-colors break-all"
          >
            truenorth.accessibilityllc@gmail.com
          </a>
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
            <article
              key={service.id}
              className="border border-divider rounded-sm p-7 hover:border-forest transition-colors"
            >
              <h3 className="font-serif text-xl text-ink mb-2">{service.name}</h3>
              <p className="text-sm text-slate leading-relaxed">{service.summary}</p>
              <button
                onClick={() => navigate('services')}
                className="mt-5 text-forest text-sm font-medium hover:underline focus:outline-none rounded"
              >
                Learn more →
              </button>
            </article>
          ))}
        </div>
        <div className="mt-8">
          <button
            onClick={() => navigate('services')}
            className="text-forest text-sm font-medium hover:underline focus:outline-none rounded"
          >
            View all six services →
          </button>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-14">
          {STANDARDS.map((item) => (
            <div key={item.label} className="border border-divider rounded-sm p-5">
              <p className="font-semibold text-ink text-sm mb-1">{item.label}</p>
              <p className="text-xs text-slate">{item.desc}</p>
            </div>
          ))}
        </div>
        <Eyebrow>Credentials</Eyebrow>
        <ul className="flex flex-col gap-3" aria-label="Certifications">
          {CERTS.map((cert) => (
            <li key={cert.name} className="flex items-start gap-3 text-sm">
              <span
                className="mt-1.5 w-1.5 h-1.5 flex-shrink-0 rounded-full bg-forest"
                aria-hidden="true"
              />
              <span>
                <span className="font-medium text-ink">{cert.name}</span>
                <span className="text-slate">
                  {' '}
                  · {cert.org}, {cert.year}
                </span>
              </span>
            </li>
          ))}
        </ul>
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

      <ol className="flex flex-col divide-y divide-divider list-none" aria-label="Service list">
        {SERVICES.map((service, i) => (
          <li key={service.id} className="py-14 first:pt-0 last:pb-0">
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
                <Eyebrow>{"What's Included"}</Eyebrow>
                <ul
                  className="flex flex-col gap-2"
                  aria-label={`${service.name} inclusions`}
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
          </li>
        ))}
      </ol>

      <div className="border-t border-divider pt-16 mt-4">
        <div className="bg-surface rounded-sm p-10">
          <h2 className="font-serif text-2xl text-ink mb-3">Not sure where to start?</h2>
          <p className="text-slate mb-6 leading-relaxed">
            Book a free 30-minute consultation and we'll help you figure out which
            services make sense for your organization right now.
          </p>
          <CTAButton onClick={() => navigate('contact')}>
            Book a Free Consultation
          </CTAButton>
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
              Nic Bade, Lead Accessibility Consultant
            </h2>
            <p className="text-slate leading-relaxed">
              Nic builds digital experiences that work for everyone. He's
              passionate about accessibility, not just as a job, but as a way to
              give people independence.
            </p>
            <p className="text-slate leading-relaxed">
              He gets it firsthand: Nic has mild dyslexia and uses a screen reader
              for technical reading, since hearing and reading text together helps
              him process information. That personal connection goes back further
              He used to read aloud to his grandfather after he lost his sight
              later in life, a memory that still shapes why this work matters to
              him.
            </p>
            <p className="text-slate leading-relaxed">
              Before founding TrueNorth Accessibility, Nic spent years as a
              full-stack software engineer, building the intuition for where
              accessibility breaks down in real codebases and why it is so much
              cheaper to get it right upfront.
            </p>
          </div>

          {/* Decorative navy mark */}
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
              >
                <circle cx="110" cy="110" r="70" fill="#1e3a5f" />
                <path
                  d="M110 50 L124 96 L170 110 L124 124 L110 170 L96 124 L50 110 L96 96 Z"
                  fill="#ffffff"
                />
                <circle cx="110" cy="110" r="10" fill="#1e3a5f" />
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

      {/* Credentials */}
      <section aria-labelledby="creds-heading" className="py-16">
        <Eyebrow>Credentials</Eyebrow>
        <h2 id="creds-heading" className="font-serif text-2xl text-ink mb-8">
          Education & Certifications
        </h2>
        <ul className="flex flex-col gap-4" aria-label="Certifications and education">
          {CERTS.map((cert) => (
            <li
              key={cert.name}
              className="flex items-start gap-4 border border-divider rounded-sm p-5"
            >
              <span
                className="mt-0.5 w-8 h-8 flex-shrink-0 rounded bg-forest flex items-center justify-center"
                aria-hidden="true"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M5 13l4 4L19 7"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div>
                <p className="font-medium text-ink text-sm">{cert.name}</p>
                <p className="text-slate text-sm">
                  {cert.org} · {cert.year}
                </p>
              </div>
            </li>
          ))}
        </ul>
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
            <CTAButton onClick={() => navigate('contact')}>Get in Touch</CTAButton>
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
            className="w-10 h-10 rounded-full bg-forest flex items-center justify-center mb-6"
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
              truenorth.accessibilityllc@gmail.com
            </strong>{' '}
            within one to two business days.
          </p>
          <button
            onClick={() => {
              setSubmitted(false)
              setFields({ name: '', email: '', company: '', service: '', message: '' })
            }}
            className="text-forest text-sm font-medium hover:underline focus:outline-none rounded"
          >
            ← Send another message
          </button>
        </div>
      </div>
    )
  }

  const inputClass = (field: string) =>
    `w-full px-4 py-3 border rounded-sm bg-cream text-ink text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-forest focus:border-forest ${
      errors[field] ? 'border-red-400' : 'border-divider'
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
              className="mb-6 p-4 border border-red-300 bg-red-50 rounded-sm outline-none"
            >
              <p className="font-medium text-red-700 text-sm mb-2">
                Please correct the following before submitting:
              </p>
              <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
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
                  <span aria-hidden="true" className="text-red-600">
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
                  <p id="err-name" className="mt-1.5 text-xs text-red-600" role="alert">
                    {errors.name}
                  </p>
                )}
              </div>

              {/* Email */}
              <div>
                <label htmlFor="f-email" className="block text-sm font-medium text-ink mb-1.5">
                  Email Address{' '}
                  <span aria-hidden="true" className="text-red-600">
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
                  <p id="err-email" className="mt-1.5 text-xs text-red-600" role="alert">
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
                  <span aria-hidden="true" className="text-red-600">
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
                  <p id="err-message" className="mt-1.5 text-xs text-red-600" role="alert">
                    {errors.message}
                  </p>
                )}
              </div>

              <div>
                <button
                  type="submit"
                  className="px-6 py-3 bg-forest text-white text-sm font-medium rounded hover:bg-forest-dark transition-colors focus:outline-none"
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
              <Eyebrow>Direct Contact</Eyebrow>
              <div className="flex flex-col gap-4 text-sm">
                <div>
                  <p className="font-medium text-ink mb-1">Email</p>
                  <a
                    href="mailto:truenorth.accessibilityllc@gmail.com"
                    className="text-slate hover:text-forest focus:outline-none rounded transition-colors break-all"
                  >
                    truenorth.accessibilityllc@gmail.com
                  </a>
                </div>
                <div>
                  <p className="font-medium text-ink mb-1">Response Time</p>
                  <p className="text-slate">1–2 business days</p>
                </div>
              </div>
            </div>

            <div className="border-t border-divider pt-6">
              <Eyebrow>Free Consultation</Eyebrow>
              <p className="text-sm text-slate leading-relaxed">
                Not sure where to start? Book a free 30-minute call to discuss
                your accessibility needs with no commitment required.
              </p>
            </div>

            <div className="border-t border-divider pt-6">
              <Eyebrow>Location</Eyebrow>
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
  const [page, setPage] = useState<Page>('home')
  const mainRef = useRef<HTMLElement>(null)

  const navigate = (to: Page) => {
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
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-forest focus:text-white focus:rounded focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2"
      >
        Skip to main content
      </a>

      <Nav page={page} navigate={navigate} />

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

      <Footer navigate={navigate} />
    </div>
  )
}
