import { useMemo, useState } from 'react';
import { DataModulePage, type DataModulePageProps } from './DataModulePage';

export type ModuleTab = DataModulePageProps & {
  key: string;
  label: string;
};

type TabbedModulePageProps = {
  tabs: ModuleTab[];
};

export function TabbedModulePage({ tabs }: TabbedModulePageProps) {
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const activeTab = useMemo(() => tabs.find((tab) => tab.key === activeKey) ?? tabs[0], [activeKey, tabs]);

  if (!activeTab) return null;
  const { key: tabKey, label: _label, ...pageProps } = activeTab;

  return (
    <div className="workspace-page">
      <div className="workspace-tabs" role="tablist" aria-label="Module tabs">
        {tabs.map((tab) => (
          <button
            className={tab.key === activeTab.key ? 'active' : ''}
            key={tab.key}
            type="button"
            onClick={() => setActiveKey(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <DataModulePage key={tabKey} {...pageProps} />
    </div>
  );
}
