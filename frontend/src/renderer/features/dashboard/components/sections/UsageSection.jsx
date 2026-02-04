import '../../../../styles/SettingsPanel.css';

function UsageSection() {
  return (
    <div className="settings-panel">
      <div className="settings-header">
        <div>
          <h2>Usage</h2>
          <p>Limits, quotas, and current consumption.</p>
        </div>
      </div>
      <section className="settings-section">
        <h3>Limits</h3>
        <div className="settings-grid">
          <div className="settings-card">
            <div className="settings-card-title">Weekly Limit</div>
            <div className="settings-card-desc">Not configured.</div>
          </div>
          <div className="settings-card">
            <div className="settings-card-title">Session Limit</div>
            <div className="settings-card-desc">5-hour cap not configured.</div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default UsageSection;
