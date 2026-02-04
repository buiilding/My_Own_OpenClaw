import '../../../../styles/SettingsPanel.css';

function ProceduralSection() {
  return (
    <div className="settings-panel">
      <div className="settings-header">
        <div>
          <h2>Procedural Memory</h2>
          <p>Skills and reusable workflows.</p>
        </div>
      </div>
      <section className="settings-section">
        <h3>SKILLS.md</h3>
        <div className="settings-card">
          <div className="settings-card-title">Not detected</div>
          <div className="settings-card-desc">Add a SKILLS.md file to enable procedural memory.</div>
        </div>
      </section>
    </div>
  );
}

export default ProceduralSection;
