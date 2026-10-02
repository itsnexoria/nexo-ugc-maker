import { useValidation } from '../hooks/useValidation';
import { useUI } from '../store/ui';
import { PropertiesPanel } from './PropertiesPanel';
import { ValidationPanel } from './ValidationPanel';

export function RightPanel() {
  const tab = useUI((s) => s.rightTab);
  const setTab = useUI((s) => s.setRightTab);
  const report = useValidation();
  const issues = report.errors + report.warnings;
  return (
    <aside className="right" aria-label="Properties and validation">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'properties'} className={`tab ${tab === 'properties' ? 'active' : ''}`} onClick={() => setTab('properties')}>
          Properties
        </button>
        <button role="tab" aria-selected={tab === 'validation'} className={`tab ${tab === 'validation' ? 'active' : ''}`} onClick={() => setTab('validation')}>
          Validation
          {issues > 0 ? <span className={`count ${report.errors ? 'err' : 'warn'}`}>{issues}</span> : <span className="count ok">✓</span>}
        </button>
      </div>
      <div className="right-body" role="tabpanel">
        {tab === 'properties' ? <PropertiesPanel /> : <ValidationPanel />}
      </div>
    </aside>
  );
}
