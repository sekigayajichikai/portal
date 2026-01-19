import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { MemberManagement } from './components/MemberManagement';
import { CircularBoard } from './components/CircularBoard';
import { FeeManagement } from './components/FeeManagement';
import { LifestyleManager } from './components/LifestyleManager';
import { RadioGenerator } from './components/RadioGenerator';
import { PublicContent } from './components/PublicContent';
import { AppView, PublicEvent } from '../../../packages/shared/types';

function App() {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  // Shared state for extracted events (simulating backend persistence)
  const [extractedEvents, setExtractedEvents] = useState<PublicEvent[]>([]);

  const handleEventsExtracted = (events: PublicEvent[]) => {
    // Add new unique events
    setExtractedEvents(prev => [...prev, ...events]);
  };

  const renderView = () => {
    switch (currentView) {
      case AppView.DASHBOARD:
        return <Dashboard />;
      case AppView.MEMBERS:
        return <MemberManagement />;
      case AppView.CIRCULAR_BOARD:
        return <CircularBoard onEventsExtracted={handleEventsExtracted} />;
      case AppView.FEES:
        return <FeeManagement />;
      case AppView.LIFESTYLE:
        return <LifestyleManager />;
      case AppView.RADIO_STATION:
        return <RadioGenerator />;
      case AppView.PUBLIC_CONTENT:
        return <PublicContent events={extractedEvents} />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout currentView={currentView} onChangeView={setCurrentView}>
      <div className="animate-in fade-in duration-300">
        {renderView()}
      </div>
    </Layout>
  );
}

export default App;
