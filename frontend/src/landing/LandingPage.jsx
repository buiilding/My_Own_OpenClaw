/**
 * Provides the landing page module for the frontend.
 */

import HeroSection from './components/HeroSection';
import WhySection from './components/WhySection';
import HowItWorksSection from './components/HowItWorksSection';
import AvailableTodaySection from './components/AvailableTodaySection';
import PrivacySection from './components/PrivacySection';
import RoadmapSection from './components/RoadmapSection';
import CTAFooter from './components/CTAFooter';
import './styles/LandingPage.css';

const LandingPage = () => {
  return (
    <div className="landing-page">
      <HeroSection />
      <WhySection />
      <HowItWorksSection />
      <AvailableTodaySection />
      <PrivacySection />
      <RoadmapSection />
      <CTAFooter />
    </div>
  );
};

export default LandingPage;
