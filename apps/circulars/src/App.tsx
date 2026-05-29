import React from 'react';
import AdminPage from '@/pages/AdminPage';
import PublicPage from '@/pages/PublicPage';

function App() {
  const isAdmin = window.location.pathname.startsWith('/admin');

  if (isAdmin) {
    return <AdminPage />;
  }

  return <PublicPage />;
}

export default App;
