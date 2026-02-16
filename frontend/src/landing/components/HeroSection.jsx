const HeroSection = () => {
  return (
    <section className="hero-section">
      <div className="hero-background">
        <div className="hero-glow hero-glow-1"></div>
        <div className="hero-glow hero-glow-2"></div>
      </div>
      
      <div className="container">
        <div className="hero-content">
          <div className="hero-badge animate-fade-in-up">
            <span className="status-dot status-dot-pulse"></span>
            <span>Now Available</span>
          </div>
          
          <h1 className="hero-title animate-fade-in-up stagger-1">
            WindieOS
          </h1>
          
          <p className="hero-subtitle animate-fade-in-up stagger-2">
            Desktop assistant
          </p>
          
          <p className="hero-description animate-fade-in-up stagger-3">
            An OS-level AI assistant that sees your screen, understands context, 
            and takes action. No IDE required—just natural language and vision-first 
            interaction across your entire desktop.
          </p>
          
          <div className="hero-actions animate-fade-in-up stagger-4">
            <a href="#download" className="btn btn-primary btn-large">
              Get Started
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </a>
            <a href="#how-it-works" className="btn btn-secondary btn-large">
              See How It Works
            </a>
          </div>
          
          <div className="hero-features animate-fade-in-up stagger-5">
            <div className="hero-feature">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
              </svg>
              <span>Vision-First</span>
            </div>
            <div className="hero-feature">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a10 10 0 1 0 10 10H12V2z"/>
                <path d="M12 2a10 10 0 0 1 10 10"/>
              </svg>
              <span>Local Memory</span>
            </div>
            <div className="hero-feature">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span>Privacy First</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
