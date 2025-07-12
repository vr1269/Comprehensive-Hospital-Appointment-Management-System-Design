// src/App.js
import React, { useContext } from 'react';
import AppProvider from './AppProvider'; // Import AppProvider
import { AppContext } from './AppContext'; // Import AppContext
import AuthScreen from './components/AuthScreen';
import HospitalAdminDashboard from './components/HospitalAdminDashboard';
import DoctorDashboard from './components/DoctorDashboard';
import PatientDashboard from './components/PatientDashboard';

// New component to hold the actual application logic that consumes context
const AppContent = () => {
  const { userRole } = useContext(AppContext);

  let content;
  switch (userRole) {
    case 'HospitalAdmin':
      content = <HospitalAdminDashboard />;
      break;
    case 'Doctor':
      content = <DoctorDashboard />;
      break;
    case 'Patient':
      content = <PatientDashboard />;
      break;
    default:
      content = <AuthScreen />;
  }

  return (
    <div className="font-sans antialiased">
      {/* Tailwind CSS CDN */}
      <script src="https://cdn.tailwindcss.com"></script>
      {content}
    </div>
  );
};

// --- Main App Component ---
const App = () => {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
};

export default App;
