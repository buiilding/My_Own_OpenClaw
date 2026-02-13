import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LandingPage from '../../../frontend/src/landing/LandingPage';
import HeroSection from '../../../frontend/src/landing/components/HeroSection';
import WhySection from '../../../frontend/src/landing/components/WhySection';
import HowItWorksSection from '../../../frontend/src/landing/components/HowItWorksSection';
import AvailableTodaySection from '../../../frontend/src/landing/components/AvailableTodaySection';
import PrivacySection from '../../../frontend/src/landing/components/PrivacySection';
import RoadmapSection from '../../../frontend/src/landing/components/RoadmapSection';
import CTAFooter from '../../../frontend/src/landing/components/CTAFooter';

// Mock CSS imports
jest.mock('../../../frontend/src/landing/styles/LandingPage.css', () => ({}));

describe('LandingPage', () => {
  it('renders without crashing', () => {
    render(<LandingPage />);
  });

  it('contains main brand elements', () => {
    render(<LandingPage />);
    
    // Use getAllByText because WindieOS appears in both Hero and Footer
    const brandElements = screen.getAllByText(/WindieOS/);
    expect(brandElements.length).toBeGreaterThan(0);
    
    // Check for subtitle
    const subtitleElements = screen.getAllByText(/Desktop assistant/i);
    expect(subtitleElements.length).toBeGreaterThan(0);
  });
});

describe('HeroSection', () => {
  it('renders hero content', () => {
    render(<HeroSection />);
    
    expect(screen.getByText('WindieOS')).toBeInTheDocument();
    expect(screen.getByText('Desktop assistant')).toBeInTheDocument();
    expect(screen.getByText(/OS-level AI assistant/)).toBeInTheDocument();
    expect(screen.getByText('Get Started')).toBeInTheDocument();
    expect(screen.getByText('See How It Works')).toBeInTheDocument();
  });

  it('renders feature highlights', () => {
    render(<HeroSection />);
    
    expect(screen.getByText('Vision-First')).toBeInTheDocument();
    expect(screen.getByText('Local Memory')).toBeInTheDocument();
    expect(screen.getByText('Privacy First')).toBeInTheDocument();
  });
});

describe('WhySection', () => {
  it('renders section header', () => {
    render(<WhySection />);
    
    expect(screen.getByText('Why WindieOS')).toBeInTheDocument();
    expect(screen.getByText(/Beyond the IDE/)).toBeInTheDocument();
  });

  it('renders all feature cards', () => {
    render(<WhySection />);
    
    expect(screen.getByText('OS-Level Control')).toBeInTheDocument();
    expect(screen.getByText('Vision-First Interaction')).toBeInTheDocument();
    expect(screen.getByText('Local Tool Execution')).toBeInTheDocument();
    expect(screen.getByText('Persistent Memory')).toBeInTheDocument();
    expect(screen.getByText('Browser Automation')).toBeInTheDocument();
    expect(screen.getByText('Multi-Provider Support')).toBeInTheDocument();
  });
});

describe('HowItWorksSection', () => {
  it('renders section header', () => {
    render(<HowItWorksSection />);
    
    expect(screen.getByText('How It Works')).toBeInTheDocument();
  });

  it('renders all steps', () => {
    render(<HowItWorksSection />);
    
    expect(screen.getByText('Capture Context')).toBeInTheDocument();
    expect(screen.getByText('Understand Intent')).toBeInTheDocument();
    expect(screen.getByText('Execute Actions')).toBeInTheDocument();
    expect(screen.getByText('Learn & Remember')).toBeInTheDocument();
  });
});

describe('AvailableTodaySection', () => {
  it('renders section header', () => {
    render(<AvailableTodaySection />);
    
    expect(screen.getByText('Available Today')).toBeInTheDocument();
    expect(screen.getByText(/Ready to/)).toBeInTheDocument();
  });

  it('renders all categories', () => {
    render(<AvailableTodaySection />);
    
    expect(screen.getByText('Core')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('Browser')).toBeInTheDocument();
  });

  it('renders CTA box', () => {
    render(<AvailableTodaySection />);
    
    expect(screen.getByText('Start using WindieOS today')).toBeInTheDocument();
    expect(screen.getByText('View Installation Guide')).toBeInTheDocument();
  });
});

describe('PrivacySection', () => {
  it('renders section header', () => {
    render(<PrivacySection />);
    
    expect(screen.getByText('Privacy & Trust')).toBeInTheDocument();
    expect(screen.getByText(/Your data/)).toBeInTheDocument();
  });

  it('renders privacy highlights', () => {
    render(<PrivacySection />);
    
    expect(screen.getByText('Local-First')).toBeInTheDocument();
    expect(screen.getByText('Transparent')).toBeInTheDocument();
    expect(screen.getByText('Your Choice')).toBeInTheDocument();
  });
});

describe('RoadmapSection', () => {
  it('renders section header', () => {
    render(<RoadmapSection />);
    
    expect(screen.getByText('Planned Roadmap')).toBeInTheDocument();
  });

  it('renders all phases', () => {
    render(<RoadmapSection />);
    
    expect(screen.getByText('Core Platform')).toBeInTheDocument();
    expect(screen.getByText('Enhanced Capabilities')).toBeInTheDocument();
    expect(screen.getByText('Multi-Agent System')).toBeInTheDocument();
    expect(screen.getByText('Cloud Infrastructure')).toBeInTheDocument();
  });

  it('distinguishes available vs planned', () => {
    render(<RoadmapSection />);
    
    expect(screen.getByText('Available')).toBeInTheDocument();
    // Should have multiple 'Planned' badges
    const plannedBadges = screen.getAllByText('Planned');
    expect(plannedBadges.length).toBeGreaterThan(0);
  });
});

describe('CTAFooter', () => {
  it('renders CTA section', () => {
    render(<CTAFooter />);
    
    expect(screen.getByText(/Ready to transform/)).toBeInTheDocument();
    expect(screen.getByText('View on GitHub')).toBeInTheDocument();
  });

  it('renders footer content', () => {
    render(<CTAFooter />);
    
    expect(screen.getByText('Product')).toBeInTheDocument();
    expect(screen.getByText('Resources')).toBeInTheDocument();
    expect(screen.getByText('Legal')).toBeInTheDocument();
  });

  it('renders copyright', () => {
    render(<CTAFooter />);
    
    const currentYear = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`© ${currentYear} WindieOS`))).toBeInTheDocument();
  });
});
