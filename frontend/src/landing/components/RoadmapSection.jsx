import React from 'react';

const RoadmapSection = () => {
  const phases = [
    {
      status: 'available',
      phase: 'Phase 1',
      title: 'Core Platform',
      description: 'Local AI assistant with vision, memory, and tool execution.',
      items: [
        'Vision-based screen understanding',
        'Local episodic & semantic memory',
        'Multi-LLM provider support',
        'Browser automation',
        'File system & shell tools'
      ]
    },
    {
      status: 'planned',
      phase: 'Phase 2',
      title: 'Enhanced Capabilities',
      description: 'Planned improvements to core functionality and user experience.',
      items: [
        'Advanced workflow recording & replay',
        'Custom tool creation interface',
        'Improved vision model integration',
        'Voice command support',
        'Plugin system for extensions'
      ]
    },
    {
      status: 'planned',
      phase: 'Phase 3',
      title: 'Multi-Agent System',
      description: 'Planned: Virtual employees that can work independently on tasks.',
      items: [
        'Autonomous task execution',
        'Multi-agent coordination',
        'Background process management',
        'Scheduled & triggered workflows',
        'Agent-to-agent communication'
      ]
    },
    {
      status: 'planned',
      phase: 'Phase 4',
      title: 'Cloud Infrastructure',
      description: 'Planned: Optional hosted backend for teams and enterprise.',
      items: [
        'Hosted multi-tenant backend',
        'Team collaboration features',
        'Auth, billing & usage plans',
        'Centralized memory sync',
        'Enterprise admin controls'
      ]
    }
  ];

  return (
    <section id="roadmap" className="roadmap-section">
      <div className="container">
        <div className="section-header">
          <span className="badge badge-primary mb-4">Planned Roadmap</span>
          
          <h2 className="heading-2 mb-4">
            Where we're
            <span className="gradient-text"> headed.</span>
          </h2>
          <p className="text-large text-secondary max-w-2xl mx-auto">
            WindieOS is actively developed. Here's what's available now and 
            what's planned for future releases.
          </p>
        </div>
        
        <div className="roadmap-timeline">
          {phases.map((phase, index) => (
            <div 
              key={index} 
              className={`roadmap-phase ${phase.status}`}
            >
              <div className="phase-marker">
                <div className={`phase-dot ${phase.status}`}></div>
                <div className="phase-line"></div>
              </div>
              
              <div className="phase-content">
                <div className="phase-header">
                  <span className={`phase-badge ${phase.status}`}>
                    {phase.status === 'available' ? 'Available' : 'Planned'}
                  </span>
                  <span className="phase-label">{phase.phase}</span>
                </div>
                
                <h3 className="phase-title">{phase.title}</h3>
                
                <p className="phase-description">{phase.description}</p>
                
                <ul className="phase-items">
                  {phase.items.map((item, itemIndex) => (
                    <li key={itemIndex} className="phase-item">
                      <span className="item-check">
                        {phase.status === 'available' ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/>
                          </svg>
                        )}
                      </span>
                      <span className="item-text">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
        
        <div className="roadmap-note">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <p>
            Roadmap items are subject to change based on community feedback and development priorities. 
            Join the discussion on GitHub to influence the direction of WindieOS.
          </p>
        </div>
      </div>
    </section>
  );
};

export default RoadmapSection;
