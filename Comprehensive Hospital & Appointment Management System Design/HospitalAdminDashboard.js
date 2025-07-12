// src/components/HospitalAdminDashboard.js
import React, { useState, useEffect, useContext } from 'react';
import { doc, addDoc, collection, query, where, getDocs, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { AppContext } from '../AppContext';
import Modal from './Modal';

const HospitalAdminDashboard = () => {
  const { db, appId, isAuthReady } = useContext(AppContext);
  const [hospitalName, setHospitalName] = useState('');
  const [hospitalLocation, setHospitalLocation] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [selectedHospitalForDept, setSelectedHospitalForDept] = useState('');
  const [hospitals, setHospitals] = useState([]);
  const [associatedDoctors, setAssociatedDoctors] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [modal, setModal] = useState({ show: false, title: '', message: '', type: 'alert' });

  useEffect(() => {
    if (!isAuthReady || !db) return;

    // Fetch hospitals
    const hospitalsRef = collection(db, `artifacts/${appId}/public/data/hospitals`);
    const unsubscribeHospitals = onSnapshot(hospitalsRef, (snapshot) => {
      const hospitalList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHospitals(hospitalList);
      if (hospitalList.length > 0 && !selectedHospitalForDept) {
        setSelectedHospitalForDept(hospitalList[0].id);
      }
    }, (error) => console.error("Error fetching hospitals:", error));

    // Fetch dashboard stats for the first hospital (for simplicity, assuming one admin per hospital or selecting one)
    // In a real app, admin would select their hospital
    const fetchDashboardStats = async () => {
      if (hospitals.length === 0) return;
      const hospitalId = hospitals[0].id; // Assuming first hospital for demo stats

      // Fetch associated doctors
      const affiliationsQuery = query(
        collection(db, `artifacts/${appId}/public/data/hospitalDoctorAffiliations`),
        where('hospital_id', '==', hospitalId)
      );
      const affiliationsSnap = await getDocs(affiliationsQuery);
      const doctorIds = affiliationsSnap.docs.map(d => d.data().doctor_id);

      const doctorsData = [];
      for (const docId of doctorIds) {
        const doctorProfileRef = doc(db, `artifacts/${appId}/users/${docId}/profile/data`);
        const doctorSnap = await getDoc(doctorProfileRef);
        if (doctorSnap.exists()) {
          doctorsData.push({ id: docId, ...doctorSnap.data() });
        }
      }
      setAssociatedDoctors(doctorsData);

      // Fetch consultations and calculate revenue
      const appointmentsQuery = query(
        collection(db, `artifacts/${appId}/public/data/appointments`),
        where('hospital_id', '==', hospitalId),
        where('status', '==', 'Completed') // Only completed consultations for revenue
      );
      const appointmentsSnap = await getDocs(appointmentsQuery);

      let totalConsultations = 0;
      let totalHospitalRevenue = 0;
      const doctorRevenueMap = {};
      const departmentRevenueMap = {};

      appointmentsSnap.docs.forEach(appointmentDoc => {
        const data = appointmentDoc.data();
        totalConsultations++;
        totalHospitalRevenue += data.hospital_revenue;

        // Aggregate doctor revenue
        doctorRevenueMap[data.doctor_id] = (doctorRevenueMap[data.doctor_id] || 0) + data.doctor_revenue;

        // Aggregate department revenue (requires joining with affiliations or storing department in appointment)
        // For simplicity, we'll assume department is stored with doctor's affiliation for now
        const affiliation = affiliationsSnap.docs.find(aff => aff.data().doctor_id === data.doctor_id && aff.data().hospital_id === hospitalId);
        if (affiliation && affiliation.data().department_id) {
          departmentRevenueMap[affiliation.data().department_id] = (departmentRevenueMap[affiliation.data().department_id] || 0) + data.hospital_revenue;
        }
      });

      // Fetch department names for display
      const departmentsRef = collection(db, `artifacts/${appId}/public/data/departments`);
      const departmentsSnap = await getDocs(query(departmentsRef, where('hospital_id', '==', hospitalId)));
      const departmentNames = departmentsSnap.docs.reduce((acc, d) => {
        acc[d.id] = d.data().name;
        return acc;
      }, {});

      // Map doctor IDs to names
      const doctorNames = doctorsData.reduce((acc, d) => {
        acc[d.id] = d.name;
        return acc;
      }, {});


      setDashboardStats({
        totalConsultations,
        totalHospitalRevenue: totalHospitalRevenue.toFixed(2),
        doctorRevenues: Object.entries(doctorRevenueMap).map(([id, revenue]) => ({
          id,
          name: doctorNames[id] || 'Unknown Doctor',
          revenue: revenue.toFixed(2)
        })),
        departmentRevenues: Object.entries(departmentRevenueMap).map(([id, revenue]) => ({
          id,
          name: departmentNames[id] || 'Unknown Department',
          revenue: revenue.toFixed(2)
        }))
      });
    };

    if (hospitals.length > 0) {
      fetchDashboardStats();
    }

    return () => unsubscribeHospitals();
  }, [isAuthReady, db, appId, hospitals.length]); // Rerun when hospitals list changes to update stats

  const handleRegisterHospital = async (e) => {
    e.preventDefault();
    if (!hospitalName || !hospitalLocation) {
      setModal({ show: true, title: 'Input Error', message: 'Please fill all hospital fields.', type: 'alert' });
      return;
    }
    try {
      await addDoc(collection(db, `artifacts/${appId}/public/data/hospitals`), {
        name: hospitalName,
        location: hospitalLocation,
        created_at: serverTimestamp(),
      });
      setModal({ show: true, title: 'Success', message: 'Hospital registered successfully!', type: 'alert' });
      setHospitalName('');
      setHospitalLocation('');
    } catch (e) {
      console.error("Error adding hospital: ", e);
      setModal({ show: true, title: 'Error', message: 'Failed to register hospital.', type: 'alert' });
    }
  };

  const handleRegisterDepartment = async (e) => {
    e.preventDefault();
    if (!departmentName || !selectedHospitalForDept) {
      setModal({ show: true, title: 'Input Error', message: 'Please select a hospital and enter department name.', type: 'alert' });
      return;
    }
    try {
      await addDoc(collection(db, `artifacts/${appId}/public/data/departments`), {
        hospital_id: selectedHospitalForDept,
        name: departmentName,
        created_at: serverTimestamp(),
      });
      setModal({ show: true, title: 'Success', message: 'Department registered successfully!', type: 'alert' });
      setDepartmentName('');
    } catch (e) {
      console.error("Error adding department: ", e);
      setModal({ show: true, title: 'Error', message: 'Failed to register department.', type: 'alert' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-4xl font-extrabold text-gray-900 mb-10 text-center">Hospital Admin Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
        {/* Register Hospital */}
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Register New Hospital</h2>
          <form onSubmit={handleRegisterHospital} className="space-y-4">
            <div>
              <label htmlFor="hospitalName" className="block text-sm font-medium text-gray-700 mb-1">Hospital Name</label>
              <input
                type="text"
                id="hospitalName"
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="e.g., City General Hospital"
              />
            </div>
            <div>
              <label htmlFor="hospitalLocation" className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input
                type="text"
                id="hospitalLocation"
                value={hospitalLocation}
                onChange={(e) => setHospitalLocation(e.target.value)}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="e.g., New York, NY"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-200"
            >
              Register Hospital
            </button>
          </form>
        </div>

        {/* Register Department */}
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Register New Department</h2>
          <form onSubmit={handleRegisterDepartment} className="space-y-4">
            <div>
              <label htmlFor="selectHospitalDept" className="block text-sm font-medium text-gray-700 mb-1">Select Hospital</label>
              <select
                id="selectHospitalDept"
                value={selectedHospitalForDept}
                onChange={(e) => setSelectedHospitalForDept(e.target.value)}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
              >
                {hospitals.length === 0 && <option value="">No hospitals registered</option>}
                {hospitals.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="departmentName" className="block text-sm font-medium text-gray-700 mb-1">Department Name</label>
              <input
                type="text"
                id="departmentName"
                value={departmentName}
                onChange={(e) => setDepartmentName(e.target.value)}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="e.g., Cardiology"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-200"
              disabled={hospitals.length === 0}
            >
              Register Department
            </button>
          </form>
        </div>
      </div>

      {/* Admin Dashboard Stats */}
      <div className="mt-10 max-w-6xl mx-auto bg-white p-6 rounded-xl shadow-lg">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Hospital Dashboard Overview</h2>
        {dashboardStats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg shadow-sm">
              <h3 className="text-lg font-semibold text-blue-800">Total Consultations</h3>
              <p className="text-3xl font-bold text-blue-600">{dashboardStats.totalConsultations}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg shadow-sm">
              <h3 className="text-lg font-semibold text-green-800">Total Hospital Revenue</h3>
              <p className="text-3xl font-bold text-green-600">${dashboardStats.totalHospitalRevenue}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg shadow-sm col-span-full">
              <h3 className="text-lg font-semibold text-purple-800 mb-2">Revenue Per Doctor (Hospital Share)</h3>
              {dashboardStats.doctorRevenues.length > 0 ? (
                <ul className="list-disc list-inside text-gray-700">
                  {dashboardStats.doctorRevenues.map((dr, index) => (
                    <li key={index}>{dr.name}: ${dr.revenue}</li>
                  ))}
                </ul>
              ) : <p className="text-gray-500">No doctor revenue data.</p>}
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg shadow-sm col-span-full">
              <h3 className="text-lg font-semibold text-yellow-800 mb-2">Revenue Per Department (Hospital Share)</h3>
              {dashboardStats.departmentRevenues.length > 0 ? (
                <ul className="list-disc list-inside text-gray-700">
                  {dashboardStats.departmentRevenues.map((depR, index) => (
                    <li key={index}>{depR.name}: ${depR.revenue}</li>
                  ))}
                </ul>
              ) : <p className="text-gray-500">No department revenue data.</p>}
            </div>
          </div>
        ) : (
          <p className="text-center text-gray-600">Loading dashboard data or no data available for the first hospital.</p>
        )}
      </div>

      {/* Associated Doctors List */}
      <div className="mt-10 max-w-6xl mx-auto bg-white p-6 rounded-xl shadow-lg">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Associated Doctors</h2>
        {associatedDoctors.length > 0 ? (
          <ul className="space-y-3">
            {associatedDoctors.map(doctor => (
              <li key={doctor.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="font-semibold text-gray-900">{doctor.name}</p>
                <p className="text-sm text-gray-600">Specializations: {doctor.specializations?.join(', ')}</p>
                <p className="text-sm text-gray-600">Experience: {doctor.years_of_experience} years</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-center text-gray-600">No doctors currently associated with this hospital.</p>
        )}
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

export default HospitalAdminDashboard;
