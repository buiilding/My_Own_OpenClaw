import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';

function FrontendOnboardingSlideshow({ onComplete, stopAgentShortcutLabel = 'Shift + Tab' }) {
  const slides = useMemo(() => ([
    {
      id: 'permissions',
      title: 'Grant access to your computer',
      body: 'Allow the requested permissions so WindieOS can capture screen state and safely run actions for you.',
      emphasisLabel: 'Access',
      emphasisValue: 'Required for agent actions',
    },
    {
      id: 'stop-flow',
      title: 'Stop the agent during loops',
      body: 'Press this keybind to stop the active agent loop immediately.',
      emphasisLabel: 'Keybind',
      emphasisValue: stopAgentShortcutLabel,
    },
  ]), [stopAgentShortcutLabel]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

  const activeSlide = slides[activeSlideIndex];
  const isLastSlide = activeSlideIndex === slides.length - 1;

  return (
    <div className="frontend-onboarding-shell">
      <section
        className="frontend-onboarding-card"
        aria-label="WindieOS onboarding"
        role="dialog"
        aria-modal="true"
      >
        <p className="frontend-onboarding-progress">
          Step {activeSlideIndex + 1} of {slides.length}
        </p>
        <h1 className="frontend-onboarding-title">{activeSlide.title}</h1>
        <p className="frontend-onboarding-body">{activeSlide.body}</p>
        <div className="frontend-onboarding-emphasis">
          <span className="frontend-onboarding-emphasis-label">{activeSlide.emphasisLabel}</span>
          <span className="frontend-onboarding-emphasis-value">{activeSlide.emphasisValue}</span>
        </div>
        <div className="frontend-onboarding-actions">
          {activeSlideIndex > 0 ? (
            <button
              type="button"
              className="frontend-onboarding-button secondary"
              onClick={() => setActiveSlideIndex((current) => Math.max(current - 1, 0))}
            >
              Back
            </button>
          ) : (
            <span aria-hidden="true" className="frontend-onboarding-action-spacer" />
          )}
          {isLastSlide ? (
            <button
              type="button"
              className="frontend-onboarding-button primary"
              onClick={onComplete}
            >
              Start WindieOS
            </button>
          ) : (
            <button
              type="button"
              className="frontend-onboarding-button primary"
              onClick={() => setActiveSlideIndex((current) => Math.min(current + 1, slides.length - 1))}
            >
              Next
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

FrontendOnboardingSlideshow.propTypes = {
  onComplete: PropTypes.func.isRequired,
  stopAgentShortcutLabel: PropTypes.string,
};

export default FrontendOnboardingSlideshow;
