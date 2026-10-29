import React, { useState, useEffect } from 'react';
import banner1Img from '../assets/hero/banner-1.webp';
import banner2Img from '../assets/hero/banner-2.webp';
import banner3Img from '../assets/hero/banner-3.webp';
import banner4Img from '../assets/hero/banner-4.webp';
import banner5StageImg from '../assets/hero/banner-5-stage.png';

interface WhereUElevateLandingProps {
  onNavigateToTest: () => void;
}

interface SlideItem {
  id: number;
  bgImage: string;
  gradientOverlay: string;
  heading: React.ReactNode;
  hasDivider: boolean;
  dividerWidth?: string;
  subtitle: string;
  ctaText: string;
  ctaUrl: string;
  isMagentaButton?: boolean;
  hasTopWave?: boolean;
}

const HERO_SLIDES: SlideItem[] = [
  // Slide 1 (Screenshot 1)
  {
    id: 0,
    bgImage: banner1Img,
    gradientOverlay: 'transparent',
    heading: (
      <>
        One Platform for<br />
        Hackathons, Jobs &amp;<br />
        Skill-Based Hiring
      </>
    ),
    hasDivider: true,
    dividerWidth: '420px',
    subtitle: 'From learning to hiring - everything you need to grow, prove, and get discovered.',
    ctaText: 'Create your Profile',
    ctaUrl: 'https://whereuelevate.com',
    hasTopWave: false
  },
  // Slide 2 (Screenshot 2)
  {
    id: 1,
    bgImage: banner2Img,
    gradientOverlay: 'transparent',
    heading: (
      <>
        Make Your<br />
        Brand<br />
        Unforgettable
      </>
    ),
    hasDivider: true,
    dividerWidth: '380px',
    subtitle: 'Launch hackathons to discover innovative talent and build a future-ready hiring pipeline.',
    ctaText: 'For Organizations',
    ctaUrl: 'https://whereuelevate.com/organization',
    hasTopWave: false
  },
  // Slide 3 (Screenshot 3)
  {
    id: 2,
    bgImage: banner3Img,
    gradientOverlay: 'transparent',
    heading: (
      <>
        Get Hired Through<br />
        <span style={{ color: '#38bdf8' }}>Hackathons, Not</span><br />
        Resumes
      </>
    ),
    hasDivider: true,
    dividerWidth: '360px',
    subtitle: 'Compete in real-world challenges, prove your skills, and get discovered by top companies actively hiring.',
    ctaText: 'Explore Opportunities',
    ctaUrl: 'https://whereuelevate.com/jobs',
    hasTopWave: false
  },
  // Slide 4 (Screenshot 4)
  {
    id: 3,
    bgImage: banner4Img,
    gradientOverlay: 'transparent',
    heading: (
      <>
        Enable Industry-Ready<br />
        Careers for Your<br />
        Students
      </>
    ),
    hasDivider: true,
    dividerWidth: '380px',
    subtitle: 'Partner with us to bring hackathons, innovation challenges, and industry opportunities to your campus.',
    ctaText: 'Partner With Us',
    ctaUrl: 'https://whereuelevate.com/solutions-for-academia',
    hasTopWave: false
  },
  // Slide 5 (Screenshot 5)
  {
    id: 4,
    bgImage: banner5StageImg,
    gradientOverlay: 'radial-gradient(ellipse at 50% 50%, rgba(15, 10, 35, 0.75) 0%, rgba(15, 10, 35, 0.35) 60%, rgba(15, 10, 35, 0.1) 100%)',
    heading: (
      <>
        <span style={{ color: '#e879f9', fontWeight: 800 }}>hack</span>Front India<br />
        Nationwide Innovation League
      </>
    ),
    hasDivider: false,
    subtitle: "Where India's top builders builds across 2 Sectors, 8 Themes. One national stage. ₹1 Crore+ in prizes.",
    ctaText: 'Registrations are LIVE',
    ctaUrl: 'https://hackfrontindia.tech',
    isMagentaButton: true,
    hasTopWave: false
  }
];

export const WhereUElevateLanding: React.FC<WhereUElevateLandingProps> = ({ onNavigateToTest }) => {
  const [activeSlide, setActiveSlide] = useState<number>(0);
  const totalSlides = HERO_SLIDES.length;

  const currentSlide = HERO_SLIDES[activeSlide];

  const handleNextSlide = () => {
    setActiveSlide((prev) => (prev + 1) % totalSlides);
  };

  const handlePrevSlide = () => {
    setActiveSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  // Auto-advance slides every 6 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % totalSlides);
    }, 6000);
    return () => clearInterval(timer);
  }, [totalSlides]);

  return (
    <div className="wue-landing-container">
      {/* ============================================================ */}
      {/* 1. HERO SECTION WITH DYNAMIC 5 CAROUSEL SLIDES                */}
      {/* ============================================================ */}
      <section className="wue-hero-section">
        {/* Dynamic Background Image & Color Overlay */}
        <div className="wue-hero-bg-wrapper">
          <img
            key={currentSlide.id}
            src={currentSlide.bgImage}
            alt="Where U Elevate Hero Background"
            className="wue-hero-bg-img"
          />
          <div
            className="wue-hero-blue-overlay"
            style={{ background: currentSlide.gradientOverlay }}
          />
        </div>

        {/* Decorative Wave in Top-Right Corner (Slide 1 signature) */}
        {currentSlide.hasTopWave && (
          <div className="wue-hero-top-wave" aria-hidden="true">
            <svg viewBox="0 0 450 180" fill="none" preserveAspectRatio="none">
              <path
                d="M0,0 C90,80 150,150 240,95 C330,45 390,120 450,165 L450,0 Z"
                fill="#ffffff"
              />
            </svg>
          </div>
        )}

        {/* Hero Slide Content */}
        <div className="wue-hero-content-wrap">
          <div className="wue-hero-text-block" key={currentSlide.id}>
            <h1 className="wue-hero-heading">
              <span>{currentSlide.heading}</span>
            </h1>

            {/* White divider bar if applicable */}
            {currentSlide.hasDivider && (
              <div
                className="wue-hero-divider"
                style={{ width: currentSlide.dividerWidth || '400px' }}
              />
            )}

            <p className="wue-hero-subtext">{currentSlide.subtitle}</p>

            <div className="wue-hero-cta-group">
              <button
                className={currentSlide.isMagentaButton ? 'wue-btn-magenta' : 'wue-btn-profile'}
                onClick={() => {
                  window.open(currentSlide.ctaUrl, '_blank', 'noopener,noreferrer');
                }}
              >
                <span>{currentSlide.ctaText}</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>

              <button
                className="wue-btn-pbai-cta"
                onClick={onNavigateToTest}
                title="Navigate to ExamZone Proctoring Platform"
              >
                <span>Try ExamZone</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polygon points="10 8 16 12 10 16 10 8" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Carousel Controls: Previous and Next Buttons */}
        <button
          aria-label="Previous slide"
          className="wue-carousel-arrow wue-carousel-prev"
          onClick={handlePrevSlide}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <button
          aria-label="Next slide"
          className="wue-carousel-arrow wue-carousel-next"
          onClick={handleNextSlide}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>

        {/* Carousel Indicators */}
        <div className="wue-carousel-indicators">
          {HERO_SLIDES.map((slide, idx) => (
            <button
              key={slide.id}
              aria-label={`Go to slide ${idx + 1}`}
              className={`wue-indicator-dot ${idx === activeSlide ? 'active' : ''}`}
              onClick={() => setActiveSlide(idx)}
            />
          ))}
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2. CUSTOMER & PARTNER LOGOS STRIP                             */}
      {/* ============================================================ */}
      <section className="wue-partner-strip">
        <div className="wue-partner-logos-wrap">
          <div className="wue-partner-logo-item" title="Synchrony">
            <img
              src="https://dfxy74dfhcx53.cloudfront.net/V2/icons/customer/synchrony.svg"
              alt="Synchrony"
            />
          </div>
          <div className="wue-partner-logo-item" title="Nasscom">
            <img
              src="https://dfxy74dfhcx53.cloudfront.net/V2/icons/customer/nasscom.svg"
              alt="Nasscom"
            />
          </div>
          <div className="wue-partner-logo-item" title="Mercedes Benz">
            <img
              src="https://dfxy74dfhcx53.cloudfront.net/V2/icons/customer/mercedes-benz.svg"
              alt="Mercedes Benz"
            />
          </div>
          <div className="wue-partner-logo-item" title="Cybersecurity Centre of Excellence">
            <img
              src="https://dfxy74dfhcx53.cloudfront.net/V2/icons/customer/cybersecurity.svg"
              alt="Cybersecurity Centre of Excellence"
            />
          </div>
          <div className="wue-partner-logo-item" title="Grant Thornton">
            <img
              src="https://dfxy74dfhcx53.cloudfront.net/V2/icons/customer/grant-thornton.svg"
              alt="Grant Thornton"
            />
          </div>
          <div className="wue-partner-logo-item" title="Department of Education">
            <img
              src="https://dfxy74dfhcx53.cloudfront.net/V2/icons/customer/dept-of-education.svg"
              alt="Department of Education"
            />
          </div>
          <div className="wue-partner-logo-item" title="Govt of Bengal">
            <img
              src="https://dfxy74dfhcx53.cloudfront.net/V2/icons/customer/govt-west-bengal.svg"
              alt="Govt of Bengal"
            />
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 3. "YOUR PATH TO SUCCESS" SECTION                             */}
      {/* ============================================================ */}
      <section className="wue-section-wrapper">
        <div className="wue-section-header">
          <h2 className="wue-section-title">Your Path to Success</h2>
          <p className="wue-section-subtitle">
            From your first hackathon to your first paycheck. Where U Elevate connects every dot.
          </p>
        </div>

        <div className="wue-path-cards-grid">
          {/* Card 1: Hackathons */}
          <a
            href="https://whereuelevate.com/drills"
            target="_blank"
            rel="noopener noreferrer"
            className="wue-path-card"
            style={{ backgroundColor: '#0284c7' }}
          >
            <div className="wue-path-card-grid-pattern" />
            <div className="wue-path-card-body">
              <div className="wue-path-card-top">
                <h3 className="wue-path-card-title">Hackathons</h3>
                <div className="wue-path-card-icon-btn">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 7h10v10" />
                    <path d="M7 17 17 7" />
                  </svg>
                </div>
              </div>
              <p className="wue-path-card-desc">Compete in Real Hackathons That Matter</p>
            </div>
          </a>

          {/* Card 2: Jobs */}
          <a
            href="https://whereuelevate.com/jobs"
            target="_blank"
            rel="noopener noreferrer"
            className="wue-path-card"
            style={{ backgroundColor: '#0ea5e9' }}
          >
            <div className="wue-path-card-grid-pattern" />
            <div className="wue-path-card-body">
              <div className="wue-path-card-top">
                <h3 className="wue-path-card-title">Jobs</h3>
                <div className="wue-path-card-icon-btn">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 7h10v10" />
                    <path d="M7 17 17 7" />
                  </svg>
                </div>
              </div>
              <p className="wue-path-card-desc">Get Jobs Based on Your Skills - Not Just Resumes</p>
            </div>
          </a>

          {/* Card 3: Internships */}
          <a
            href="https://whereuelevate.com/internships"
            target="_blank"
            rel="noopener noreferrer"
            className="wue-path-card"
            style={{ backgroundColor: '#FFBD59' }}
          >
            <div className="wue-path-card-grid-pattern" />
            <div className="wue-path-card-body">
              <div className="wue-path-card-top">
                <h3 className="wue-path-card-title" style={{ color: '#252726' }}>Internships</h3>
                <div className="wue-path-card-icon-btn" style={{ color: '#252726' }}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 7h10v10" />
                    <path d="M7 17 17 7" />
                  </svg>
                </div>
              </div>
              <p className="wue-path-card-desc" style={{ color: 'rgba(37,39,38,0.75)' }}>
                Land Internships That Build Real-World Experience
              </p>
            </div>
          </a>

          {/* Card 4: Events & Bootcamps */}
          <a
            href="https://whereuelevate.com/events"
            target="_blank"
            rel="noopener noreferrer"
            className="wue-path-card"
            style={{ backgroundColor: '#7C3AED' }}
          >
            <div className="wue-path-card-grid-pattern" />
            <div className="wue-path-card-body">
              <div className="wue-path-card-top">
                <h3 className="wue-path-card-title">Events &amp; Bootcamps</h3>
                <div className="wue-path-card-icon-btn">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 7h10v10" />
                    <path d="M7 17 17 7" />
                  </svg>
                </div>
              </div>
              <p className="wue-path-card-desc">Explore bootcamps and action-first learning for industry readiness.</p>
            </div>
          </a>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 4. "NUMBERS DON'T LIE" STATS SECTION                          */}
      {/* ============================================================ */}
      <section className="wue-section-wrapper wue-stats-section">
        <div className="wue-section-header">
          <h2 className="wue-section-title">Numbers Don't Lie</h2>
        </div>

        <div className="wue-stats-grid">
          <div className="wue-stat-box">
            <div className="wue-stat-number">1M+</div>
            <div className="wue-stat-label">Users</div>
            <div className="wue-stat-footnote">Growing next-gen innovator community</div>
          </div>

          <div className="wue-stat-box">
            <div className="wue-stat-number">500+</div>
            <div className="wue-stat-label">Institutions</div>
            <div className="wue-stat-footnote">Campus innovation network built</div>
          </div>

          <div className="wue-stat-box">
            <div className="wue-stat-number">100+</div>
            <div className="wue-stat-label">Customers</div>
            <div className="wue-stat-footnote">Trusted by leading organizations</div>
          </div>

          <div className="wue-stat-box">
            <div className="wue-stat-number">250+</div>
            <div className="wue-stat-label">Hackathons</div>
            <div className="wue-stat-footnote">Real innovation challenges delivered</div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 5. FOOTER SECTION                                             */}
      {/* ============================================================ */}
      <footer className="wue-footer-section">
        <div className="wue-footer-content-wrap">
          <div className="wue-footer-grid">
            {/* Col 1: Brand Info */}
            <div className="wue-footer-brand-col">
              <div className="wue-footer-logo">
                <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
                  <path d="M4 22a13 13 0 0 1 26 0" fill="none" stroke="#0a58b8" strokeWidth="3" strokeLinecap="round" />
                  <rect x="11" y="20" width="12" height="4" rx="1" fill="#0e7bf0" />
                  <rect x="13" y="15" width="10" height="4" rx="1" fill="#0a58b8" />
                  <rect x="16" y="10" width="8" height="4" rx="1" fill="#0e7bf0" />
                </svg>
                <span className="wue-footer-brand-name">Where U Elevate</span>
              </div>
              <p className="wue-footer-brand-desc">
                Where U Elevate is working on creating the next generation innovative workforce which is agile,
                adaptable, and innovative by leveraging cutting edge technologies, advanced analytics and deep expertise.
              </p>
            </div>

            {/* Col 2: For Participants */}
            <div className="wue-footer-col">
              <h4>For Participants</h4>
              <ul>
                <li><a href="https://whereuelevate.com/drills" target="_blank" rel="noopener noreferrer">Hackathons</a></li>
                <li><a href="https://whereuelevate.com/jobs" target="_blank" rel="noopener noreferrer">Jobs</a></li>
                <li><a href="https://whereuelevate.com/internships" target="_blank" rel="noopener noreferrer">Internships</a></li>
                <li><a href="https://whereuelevate.com/events" target="_blank" rel="noopener noreferrer">Events &amp; Bootcamps</a></li>
                <li><a href="https://whereuelevate.com/blogs" target="_blank" rel="noopener noreferrer">Blogs</a></li>
              </ul>
            </div>

            {/* Col 3: Flagship Events */}
            <div className="wue-footer-col">
              <h4>Our Flagship Events</h4>
              <ul>
                <li><a href="https://hackfrontindia.tech" target="_blank" rel="noopener noreferrer">hackFront India</a></li>
                <li><a href="https://whereuelevate.com" target="_blank" rel="noopener noreferrer">The Elevation Forum</a></li>
                <li><a href="/test" onClick={(e) => { e.preventDefault(); onNavigateToTest(); }}>ExamZone Proctoring</a></li>
              </ul>
            </div>

            {/* Col 4: For Organization */}
            <div className="wue-footer-col">
              <h4>For Organization</h4>
              <ul>
                <li><a href="https://whereuelevate.com/organization" target="_blank" rel="noopener noreferrer">Organization</a></li>
                <li><a href="https://whereuelevate.com/products" target="_blank" rel="noopener noreferrer">Products</a></li>
                <li><a href="https://whereuelevate.com/solutions-for-enterprises" target="_blank" rel="noopener noreferrer">Solutions for Enterprises</a></li>
                <li><a href="https://whereuelevate.com/solutions-for-academia" target="_blank" rel="noopener noreferrer">Solutions for Academia</a></li>
                <li><a href="https://whereuelevate.com/book-a-demo" target="_blank" rel="noopener noreferrer">Book a demo</a></li>
              </ul>
            </div>

            {/* Col 5: Company */}
            <div className="wue-footer-col">
              <h4>Company</h4>
              <ul>
                <li><a href="https://whereuelevate.com/about-us" target="_blank" rel="noopener noreferrer">About us</a></li>
                <li><a href="https://whereuelevate.com/life-at-wue" target="_blank" rel="noopener noreferrer">Life @ Where U Elevate</a></li>
                <li><a href="https://whereuelevate.com/contact-us" target="_blank" rel="noopener noreferrer">Contact us</a></li>
                <li><a href="https://whereuelevate.com/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a></li>
              </ul>
            </div>
          </div>

          {/* Bottom Copyright Strip */}
          <div className="wue-footer-bottom">
            <p>Copyright © 2026 WUELEV8 Innovation Services Pvt. Ltd. - All Rights reserved.</p>
            <div className="wue-footer-socials">
              <a href="https://www.linkedin.com/company/whereuelevate" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">LinkedIn</a>
              <a href="https://twitter.com/whereuelevate" target="_blank" rel="noopener noreferrer" aria-label="Twitter">Twitter/X</a>
              <a href="https://discord.gg/3rEMQZj8rv" target="_blank" rel="noopener noreferrer" aria-label="Discord">Discord</a>
              <a href="https://www.instagram.com/whereuelevate/" target="_blank" rel="noopener noreferrer" aria-label="Instagram">Instagram</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
