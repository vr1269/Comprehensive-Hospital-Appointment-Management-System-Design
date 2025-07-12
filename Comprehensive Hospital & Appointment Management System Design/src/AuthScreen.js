import React, { useState, useContext } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { AppContext } from '../AppContext';
import Modal from './Modal';

const AuthScreen = () => {
  const { db, userId, setUserRole, isAuthReady, appId } = useContext(AppContext);
  const [selectedRole, setSelectedRole] = useState('');
  const [modal, setModal] = useState({ show: false, title: '', message: '', type: 'alert' });

  const handleRoleSelection = async () => {
    if (!selectedRole || !isAuthReady || !userId) {
      setModal({ show: true, title: 'Error', message: 'Please select a role and ensure app is ready.', type: 'alert' });
      return;
    }

    try {
      // Store user role in Firestore
      const userProfileRef = doc(db, `artifacts/${appId}/users/${userId}/profile/data`);
      await setDoc(userProfileRef, { role: selectedRole, userId: userId }, { merge: true });
      setUserRole(selectedRole); // Update context state
    } catch (e) {
      console.error("Error setting user role:", e);
      setModal({ show: true, title: 'Error', message: 'Failed to set role. Please try again.', type: 'alert' });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-4">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md text-center">
        <h2 className="text-3xl font-extrabold text-gray-900 mb-6">Welcome to HealthSync</h2>
        <p className="text-gray-600 mb-8">Please select your role to continue:</p>

        <div className="flex flex-col space-y-4 mb-8">
          {['HospitalAdmin', 'Doctor', 'Patient'].map((role) => (
            <label
              key={role}
              className={`flex items-center justify-center p-4 rounded-lg cursor-pointer transition-all duration-300
                ${selectedRole === role ? 'bg-indigo-100 border-2 border-indigo-600 shadow-md' : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'}`}
            >
              <input
                type="radio"
                name="role"
                value={role}
                checked={selectedRole === role}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="hidden"
              />
              <span className="text-lg font-medium text-gray-800">{role.replace(/([A-Z])/g, ' $1').trim()}</span>
            </label>
          ))}
        </div>

        <button
          onClick={handleRoleSelection}
          disabled={!selectedRole}
          className={`w-full py-3 rounded-lg text-white font-semibold text-lg transition-all duration-300
            ${selectedRole ? 'bg-indigo-600 hover:bg-indigo-700 shadow-lg' : 'bg-gray-400 cursor-not-allowed'}`}
        >
          Continue as {selectedRole || '...'}
        </button>
        <p className="mt-4 text-sm text-gray-500">Your User ID: <span className="font-mono text-gray-700">{userId}</span></p>
      </div>
      <Modal
        show={modal.show}
        title={modal.title}
        message={modal.message}
        onConfirm={() => setModal({ ...modal, show: false })}
        type={modal.type}
      />
    </div>
  );
};

export default AuthScreen;
