// src/AppProvider.js
import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { AppContext } from './AppContext';

// Global variables provided by the Canvas environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

const AppProvider = ({ children }) => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initFirebase = async () => {
      try {
        const app = initializeApp(firebaseConfig);
        const firestoreDb = getFirestore(app);
        const firebaseAuth = getAuth(app);

        setDb(firestoreDb);
        setAuth(firebaseAuth);

        // Listen for auth state changes
        const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
          if (user) {
            setUserId(user.uid);
            // Fetch user role from Firestore or assume based on registration flow
            const userDocRef = doc(firestoreDb, `artifacts/${appId}/users/${user.uid}/profile/data`);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
              setUserRole(userDocSnap.data().role);
            }
          } else {
            setUserId(null);
            setUserRole(null);
          }
          setIsAuthReady(true);
          setLoading(false);
        });

        // Sign in with custom token or anonymously
        if (initialAuthToken) {
          await signInWithCustomToken(firebaseAuth, initialAuthToken);
        } else {
          await signInAnonymously(firebaseAuth);
        }

        return () => unsubscribe(); // Cleanup listener
      } catch (err) {
        console.error("Failed to initialize Firebase or authenticate:", err);
        if (err.code === 'auth/network-request-failed') {
          setError("Network error: Could not connect to Firebase. Please check your internet connection or try again later.");
        } else {
          setError("Failed to initialize application. Please try again. Error: " + err.message);
        }
        setLoading(false);
      }
    };

    initFirebase();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-xl font-semibold text-gray-700">Loading application...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-100 text-red-700">
        <div className="text-xl font-semibold">{error}</div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ db, auth, userId, userRole, setUserRole, isAuthReady, appId }}>
      {children}
    </AppContext.Provider>
  );
};

export default AppProvider;
