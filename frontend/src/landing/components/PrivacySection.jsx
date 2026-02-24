import SectionIntro from './SectionIntro';
import ProviderStackIcon from './icons/ProviderStackIcon';

const PrivacySection = () => {
  const privacyFeatures = [
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      ),
      title: 'Local-First Architecture',
      description: 'Your memory databases, files, and preferences stay on your machine. Nothing is uploaded to external servers unless you explicitly choose to use a cloud LLM provider.'
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      ),
      title: 'Encrypted Memory Storage',
      description: 'Episodic and semantic memories are stored locally with encryption. Your conversation history and learned preferences are yours alone.'
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      ),
      title: 'Minimal Data Transmission',
      description: 'Only inference-required data (screenshots, commands) is sent to LLM providers. No telemetry, no analytics, no tracking of your usage patterns.'
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
      ),
      title: 'Open Source',
      description: 'WindieOS is open source. You can inspect the code, verify what data is collected, and modify it to meet your specific privacy requirements.'
    },
    {
      icon: <ProviderStackIcon />,
      title: 'Provider Choice',
      description: 'Use local models via Ollama for complete privacy, or choose your preferred cloud provider. You control where your data goes.'
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
          <path d="M12 6v6l4 2"/>
        </svg>
      ),
      title: 'Session Control',
      description: 'Clear your memory at any time. Full control over what WindieOS remembers and for how long. No persistent tracking across sessions.'
    }
  ];
  const privacyHighlights = [
    {
      title: 'Local-First',
      detail: 'Memory & files stay on your device',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      ),
    },
    {
      title: 'Transparent',
      detail: 'Open source, auditable code',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      ),
    },
    {
      title: 'Your Choice',
      detail: 'Pick your LLM provider',
      icon: <ProviderStackIcon size={20} />,
    },
  ];

  return (
    <section id="privacy" className="privacy-section">
      <div className="container">
        <div className="privacy-grid">
          <div className="privacy-content">
            <SectionIntro
              badge="Privacy & Trust"
              headingPrefix="Your data."
              headingGradient="Your control."
              description="WindieOS is built on a local-first philosophy. We believe AI assistants should enhance your productivity without compromising your privacy."
              descriptionClassName="text-large text-secondary mb-6"
            />
            
            <div className="privacy-highlights">
              {privacyHighlights.map((highlight) => (
                <div key={highlight.title} className="highlight-item">
                  <div className="highlight-icon">{highlight.icon}</div>
                  <div className="highlight-text">
                    <strong>{highlight.title}</strong>
                    <span>{highlight.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="privacy-features">
            {privacyFeatures.map((feature, index) => (
              <div key={index} className="privacy-feature-card">
                <div className="privacy-feature-icon">{feature.icon}</div>
                <h4 className="privacy-feature-title">{feature.title}</h4>
                <p className="privacy-feature-description">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default PrivacySection;
