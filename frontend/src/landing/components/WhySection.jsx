/**
 * Provides the why section module for the renderer UI.
 */

import SectionIntro from './SectionIntro';
import ProviderStackIcon from './icons/ProviderStackIcon';

const WhySection = () => {
  const features = [
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      ),
      title: 'OS-Level Control',
      description: 'Unlike IDE-limited assistants, WindieOS operates at the system level. Control any application, manage files, and automate workflows across your entire desktop environment.'
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
      ),
      title: 'Vision-First Interaction',
      description: 'WindieOS sees what you see. Using screenshots and OCR/vision grounding, it understands your screen context to take precise actions without explicit coordinates or complex setup.'
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
          <line x1="12" y1="22.08" x2="12" y2="12"/>
        </svg>
      ),
      title: 'Local Tool Execution',
      description: 'A lightweight Python sidecar runs locally on your machine, executing tools and commands securely without sending sensitive data to external services.'
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a10 10 0 1 0 10 10H12V2z"/>
          <path d="M12 2a10 10 0 0 1 10 10"/>
          <path d="M12 12L2.5 8.5"/>
        </svg>
      ),
      title: 'Persistent Memory',
      description: 'Episodic and semantic memory stores your preferences, workflows, and context locally. WindieOS learns from interactions and remembers what matters to you.'
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2"/>
          <path d="M8 21h8"/>
          <path d="M12 17v4"/>
          <path d="M7 8l3 3 7-7"/>
        </svg>
      ),
      title: 'Browser Automation',
      description: 'Navigate websites, fill forms, extract data, and interact with web applications—all through natural language commands with full visual feedback.'
    },
    {
      icon: <ProviderStackIcon />,
      title: 'Multi-Provider Support',
      description: 'Connect to OpenAI, Anthropic, or other LLM providers. Switch models based on your needs—use powerful models for complex tasks, faster ones for quick queries.'
    }
  ];

  return (
    <section id="why-windieos" className="why-section">
      <div className="container">
        <SectionIntro
          badge="Why WindieOS"
          headingPrefix="Beyond the IDE."
          headingGradient="Beyond the browser."
          description="Most AI assistants are trapped in a single application. WindieOS works across your entire operating system, understanding context from any app and taking action wherever needed."
          wrapperClassName="section-header"
          descriptionClassName="text-large text-secondary max-w-2xl mx-auto"
        />
        
        <div className="features-grid">
          {features.map((feature, index) => (
            <div 
              key={index} 
              className="feature-card"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="feature-icon">{feature.icon}</div>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-description">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhySection;
