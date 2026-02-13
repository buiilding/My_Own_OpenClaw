import React from 'react';

const AvailableTodaySection = () => {
  const features = [
    {
      category: 'Core',
      items: [
        { name: 'Vision-based screen understanding', status: 'available' },
        { name: 'OCR text extraction', status: 'available' },
        { name: 'Natural language commands', status: 'available' },
        { name: 'Multi-LLM provider support', status: 'available' }
      ]
    },
    {
      category: 'Tools',
      items: [
        { name: 'Mouse control (click, move, drag)', status: 'available' },
        { name: 'Keyboard input & hotkeys', status: 'available' },
        { name: 'Screenshot capture', status: 'available' },
        { name: 'Application window management', status: 'available' },
        { name: 'File system operations', status: 'available' },
        { name: 'Shell command execution', status: 'available' }
      ]
    },
    {
      category: 'Memory',
      items: [
        { name: 'Episodic memory (conversation history)', status: 'available' },
        { name: 'Semantic memory (facts & preferences)', status: 'available' },
        { name: 'Local vector storage (FAISS)', status: 'available' },
        { name: 'Memory search & retrieval', status: 'available' }
      ]
    },
    {
      category: 'Browser',
      items: [
        { name: 'Web navigation automation', status: 'available' },
        { name: 'Form filling', status: 'available' },
        { name: 'Data extraction', status: 'available' },
        { name: 'Visual element interaction', status: 'available' }
      ]
    }
  ];

  return (
    <section id="available-today" className="available-section">
      <div className="container">
        <div className="section-header">
          <span className="badge badge-accent mb-4">Available Today</span>
          <h2 className="heading-2 mb-4">
            Ready to
            <span className="gradient-text"> use now.</span>
          </h2>
          <p className="text-large text-secondary max-w-2xl mx-auto">
            WindieOS is fully functional today. Install it locally and start 
            automating your desktop workflows immediately.
          </p>
        </div>
        
        <div className="features-grid">
          {features.map((category, catIndex) => (
            <div key={catIndex} className="category-card">
              <h3 className="category-title">{category.category}</h3>
              <ul className="feature-list">
                {category.items.map((item, itemIndex) => (
                  <li key={itemIndex} className={`feature-item ${item.status}`}>
                    <span className="feature-check">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </span>
                    <span className="feature-name">{item.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        
        <div className="cta-box">
          <div className="cta-content">
            <h3 className="cta-title">Start using WindieOS today</h3>
            <p className="cta-description">
              Clone the repository, install dependencies, and run locally. 
              No cloud account required.
            </p>
            <div className="cta-code">
              <code>git clone https://github.com/buiilding/WindieOS.git</code>
            </div>          
          </div>
          
          <a href="#download" className="btn btn-primary btn-large">
            View Installation Guide
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
};

export default AvailableTodaySection;
