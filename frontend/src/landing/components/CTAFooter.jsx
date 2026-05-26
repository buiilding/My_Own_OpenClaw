import ProviderStackIcon from './icons/ProviderStackIcon';

const REPO_URL = 'https://github.com/buiilding/WindieOS';
const DOCS_URL = `${REPO_URL}/blob/main/docs/README.md`;
const INSTALLATION_URL = `${REPO_URL}/blob/main/README.md#quick-start`;
const CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`;
const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

const CTAFooter = () => {
  const currentYear = new Date().getFullYear();

  return (
    <>
      <section id="download" className="cta-section">
        <div className="container">
          <div className="cta-card">
            <div className="cta-glow"></div>
            
            <div className="cta-content">
              <h2 className="cta-title">
                Ready to transform
                <br />
                <span className="gradient-text">your workflow?</span>
              </h2>
              
              <p className="cta-description">
                Install WindieOS locally and start automating your desktop 
                with natural language and vision-first AI.
              </p>
              
              <div className="cta-actions">
                <a 
                  href={REPO_URL}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-large"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  View on GitHub
                </a>
                
                <a href={DOCS_URL} className="btn btn-secondary btn-large">
                  Read Documentation
                </a>
              </div>
              
              <div className="cta-meta">
                <span className="meta-item">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  Open Source
                </span>
                <span className="meta-dot">•</span>
                <span className="meta-item">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  Privacy First
                </span>
                <span className="meta-dot">•</span>
                <span className="meta-item">
                  <ProviderStackIcon size={16} />
                  MIT License
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <span className="footer-logo">WindieOS</span>
              <p className="footer-tagline">Desktop assistant</p>
            </div>
            
            <div className="footer-links">
              <div className="footer-column">
                <h4>Product</h4>
                <ul>
                  <li><a href="#why-windieos">Features</a></li>
                  <li><a href="#how-it-works">How It Works</a></li>
                  <li><a href="#available-today">Available Now</a></li>
                  <li><a href="#roadmap">Roadmap</a></li>
                </ul>
              </div>
              
              <div className="footer-column">
                <h4>Resources</h4>
                <ul>
                  <li><a href={REPO_URL}>GitHub</a></li>
                  <li><a href={DOCS_URL}>Documentation</a></li>
                  <li><a href={INSTALLATION_URL}>Installation</a></li>
                  <li><a href={CHANGELOG_URL}>Changelog</a></li>
                </ul>
              </div>
              
              <div className="footer-column">
                <h4>Legal</h4>
                <ul>
                  <li><a href={LICENSE_URL}>License</a></li>
                  <li><a href="#privacy">Privacy</a></li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="footer-bottom">
            <p>© {currentYear} WindieOS. Open source under MIT License.</p>
            <p className="footer-note">
              Built with vision-first AI for local desktop automation.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
};

export default CTAFooter;
