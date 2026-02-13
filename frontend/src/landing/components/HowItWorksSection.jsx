import React from 'react';

const HowItWorksSection = () => {
  const steps = [
    {
      number: '01',
      title: 'Capture Context',
      description: 'WindieOS takes a screenshot of your desktop or specific windows, using OCR and vision models to understand what\'s on screen—text, UI elements, and visual context.',
      code: 'windie.capture_screen()'
    },
    {
      number: '02',
      title: 'Understand Intent',
      description: 'Your natural language command is combined with the visual context. The LLM understands both what you said and what you\'re looking at.',
      code: 'windie.ask("Click the Submit button")'
    },
    {
      number: '03',
      title: 'Execute Actions',
      description: 'The local sidecar executes tools—clicking, typing, navigating, or running commands. Actions happen on your machine, not in the cloud.',
      code: 'windie.tools.click(x=450, y=320)'
    },
    {
      number: '04',
      title: 'Learn & Remember',
      description: 'Successful workflows are stored in episodic memory. Preferences go to semantic memory. WindieOS gets better the more you use it.',
      code: 'memory.store_episode(action, result)'
    }
  ];

  return (
    <section id="how-it-works" className="how-section">
      <div className="container">
        <div className="section-header">
          <span className="badge badge-primary mb-4">How It Works</span>
          <h2 className="heading-2 mb-4">
            See. Understand.
            <span className="gradient-text">Act.</span>
          </h2>
          <p className="text-large text-secondary max-w-2xl mx-auto">
            WindieOS combines vision, language, and local execution to create 
            a seamless AI assistant that works the way you do.
          </p>
        </div>
        
        <div className="steps-container">
          {steps.map((step, index) => (
            <div key={index} className="step-row">
              <div className="step-content">
                <div className="step-number">{step.number}</div>
                <div className="step-text">
                  <h3 className="step-title">{step.title}</h3>
                  <p className="step-description">{step.description}</p>
                </div>
              </div>
              
              <div className="step-code">
                <div className="code-window">
                  <div className="code-header">
                    <span className="code-dot red"></span>
                    <span className="code-dot yellow"></span>
                    <span className="code-dot green"></span>
                    <span className="code-label">python</span>
                  </div>
                  <pre className="code-content">
                    <code>{step.code}</code>
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
