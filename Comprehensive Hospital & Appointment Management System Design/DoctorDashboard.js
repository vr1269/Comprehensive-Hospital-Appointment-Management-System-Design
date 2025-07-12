// src/components/DoctorDashboard.js
import React, { useState, useEffect, useContext } from 'react';
import { doc, getDoc, addDoc, setDoc, updateDoc, collection, query, where, getDocs, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { AppContext } from '../AppContext';
import Modal from './Modal';

const DoctorDashboard = () => {
  const { db, userId, appId, isAuthReady } = useContext(AppContext);
  const [name, setName] = useState('');
  const [qualifications, setQualifications] = useState('');
  const [specializations, setSpecializations] = useState('');
  const [experience, setExperience] = useState('');
  const [consultationFee, setConsultationFee] = useState('');
  const [selectedHospitalForAffiliation, setSelectedHospitalForAffiliation] = useState('');
  const [selectedHospitalForAvailability, setSelectedHospitalForAvailability] = useState('');
  const [availabilityDate, setAvailabilityDate] = useState('');
  const [availabilityStartTime, setAvailabilityStartTime] = useState('');
  const [availabilityEndTime, setAvailabilityEndTime] = useState('');
  const [hospitals, setHospitals] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedDepartmentForAffiliation, setSelectedDepartmentForAffiliation] = useState('');
  const [doctorProfile, setDoctorProfile] = useState(null);
  const [affiliations, setAffiliations] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [modal, setModal] = useState({ show: false, title: '', message: '', type: 'alert' });
  const [doctorAvailabilities, setDoctorAvailabilities] = useState([]);

  useEffect(() => {
    if (!isAuthReady || !db || !userId) return;

    // Fetch doctor profile
    const profileRef = doc(db, `artifacts/${appId}/users/${userId}/profile/data`);
    const unsubscribeProfile = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) {
        setDoctorProfile(docSnap.data());
        setName(docSnap.data().name || '');
        setQualifications(docSnap.data().qualifications || '');
        setSpecializations(docSnap.data().specializations?.join(', ') || '');
        setExperience(docSnap.data().years_of_experience || '');
      }
    }, (error) => console.error("Error fetching doctor profile:", error));

    // Fetch hospitals
    const hospitalsRef = collection(db, `artifacts/${appId}/public/data/hospitals`);
    const unsubscribeHospitals = onSnapshot(hospitalsRef, (snapshot) => {
      const hospitalList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHospitals(hospitalList);
      if (hospitalList.length > 0) {
        if (!selectedHospitalForAffiliation) setSelectedHospitalForAffiliation(hospitalList[0].id);
        if (!selectedHospitalForAvailability) setSelectedHospitalForAvailability(hospitalList[0].id);
      }
    }, (error) => console.error("Error fetching hospitals:", error));

    // Fetch departments based on selected hospital for affiliation
    const unsubscribeDepartments = onSnapshot(
      query(collection(db, `artifacts/${appId}/public/data/departments`), where('hospital_id', '==', selectedHospitalForAffiliation)),
      (snapshot) => {
        const deptList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setDepartments(deptList);
        if (deptList.length > 0 && !selectedDepartmentForAffiliation) {
          setSelectedDepartmentForAffiliation(deptList[0].id);
        }
      },
      (error) => console.error("Error fetching departments:", error)
    );

    // Fetch doctor affiliations
    const affiliationsQuery = query(
      collection(db, `artifacts/${appId}/public/data/hospitalDoctorAffiliations`),
      where('doctor_id', '==', userId)
    );
    const unsubscribeAffiliations = onSnapshot(affiliationsQuery, async (snapshot) => {
      const fetchedAffiliations = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const affiliationsWithNames = await Promise.all(fetchedAffiliations.map(async (aff) => {
        const hospitalSnap = await getDoc(doc(db, `artifacts/${appId}/public/data/hospitals`, aff.hospital_id));
        const departmentSnap = aff.department_id ? await getDoc(doc(db, `artifacts/${appId}/public/data/departments`, aff.department_id)) : null;
        return {
          ...aff,
          hospital_name: hospitalSnap.exists() ? hospitalSnap.data().name : 'Unknown Hospital',
          department_name: departmentSnap?.exists() ? departmentSnap.data().name : 'N/A'
        };
      }));
      setAffiliations(affiliationsWithNames);
    }, (error) => console.error("Error fetching affiliations:", error));

    // Fetch doctor availability
    const availabilityQuery = query(
      collection(db, `artifacts/${appId}/public/data/doctorAvailability`),
      where('doctor_id', '==', userId)
    );
    const unsubscribeAvailability = onSnapshot(availabilityQuery, async (snapshot) => {
      const fetchedAvailabilities = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const availabilitiesWithNames = await Promise.all(fetchedAvailabilities.map(async (avail) => {
        const hospitalSnap = await getDoc(doc(db, `artifacts/${appId}/public/data/hospitals`, avail.hospital_id));
        return {
          ...avail,
          hospital_name: hospitalSnap.exists() ? hospitalSnap.data().name : 'Unknown Hospital',
        };
      }));
      setDoctorAvailabilities(availabilitiesWithNames.sort((a, b) => a.start_time.toDate() - b.start_time.toDate()));
    }, (error) => console.error("Error fetching availabilities:", error));


    // Fetch doctor dashboard stats
    const fetchDashboardStats = async () => {
      const appointmentsQuery = query(
        collection(db, `artifacts/${appId}/public/data/appointments`),
        where('doctor_id', '==', userId),
        where('status', '==', 'Completed')
      );
      const appointmentsSnap = await getDocs(appointmentsQuery);

      let totalEarnings = 0;
      let totalConsultations = 0;
      const earningsByHospital = {};

      for (const appointmentDoc of appointmentsSnap.docs) {
        const data = appointmentDoc.data();
        totalConsultations++;
        totalEarnings += data.doctor_revenue;

        const hospitalSnap = await getDoc(doc(db, `artifacts/${appId}/public/data/hospitals`, data.hospital_id));
        const hospitalName = hospitalSnap.exists() ? hospitalSnap.data().name : 'Unknown Hospital';

        earningsByHospital[hospitalName] = (earningsByHospital[hospitalName] || 0) + data.doctor_revenue;
      }

      setDashboardStats({
        totalEarnings: totalEarnings.toFixed(2),
        totalConsultations,
        earningsByHospital: Object.entries(earningsByHospital).map(([name, revenue]) => ({
          name,
          revenue: revenue.toFixed(2)
        }))
      });
    };
    fetchDashboardStats();

    return () => {
      unsubscribeProfile();
      unsubscribeHospitals();
      unsubscribeDepartments();
      unsubscribeAffiliations();
      unsubscribeAvailability();
    };
  }, [isAuthReady, db, userId, appId, selectedHospitalForAffiliation]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!name || !qualifications || !specializations || !experience) {
      setModal({ show: true, title: 'Input Error', message: 'Please fill all profile fields.', type: 'alert' });
      return;
    }
    try {
      const specializationsArray = specializations.split(',').map(s => s.trim()).filter(s => s);
      const profileRef = doc(db, `artifacts/${appId}/users/${userId}/profile/data`);
      await setDoc(profileRef, {
        name,
        qualifications,
        specializations: specializationsArray,
        years_of_experience: parseInt(experience, 10),
        role: 'Doctor', // Ensure role is set
        updated_at: serverTimestamp(),
      }, { merge: true });
      setModal({ show: true, title: 'Success', message: 'Profile updated successfully!', type: 'alert' });
    } catch (e) {
      console.error("Error updating profile: ", e);
      setModal({ show: true, title: 'Error', message: 'Failed to update profile.', type: 'alert' });
    }
  };

  const handleAffiliateHospital = async (e) => {
    e.preventDefault();
    if (!selectedHospitalForAffiliation || !selectedDepartmentForAffiliation || !consultationFee) {
      setModal({ show: true, title: 'Input Error', message: 'Please select hospital, department and enter consultation fee.', type: 'alert' });
      return;
    }
    const fee = parseFloat(consultationFee);
    if (isNaN(fee) || fee <= 0) {
      setModal({ show: true, title: 'Input Error', message: 'Consultation fee must be a positive number.', type: 'alert' });
      return;
    }

    // Check if doctor's specializations match department
    const doctorSpecs = doctorProfile?.specializations || [];
    const selectedDept = departments.find(d => d.id === selectedDepartmentForAffiliation);
    if (!selectedDept || !doctorSpecs.includes(selectedDept.name)) {
      setModal({ show: true, title: 'Validation Error', message: `Doctor's specializations (${doctorSpecs.join(', ')}) must match the selected department (${selectedDept?.name || 'N/A'}).`, type: 'alert' });
      return;
    }

    try {
      await addDoc(collection(db, `artifacts/${appId}/public/data/hospitalDoctorAffiliations`), {
        doctor_id: userId,
        hospital_id: selectedHospitalForAffiliation,
        department_id: selectedDepartmentForAffiliation,
        consultation_fee: fee,
        created_at: serverTimestamp(),
      });
      setModal({ show: true, title: 'Success', message: 'Affiliation added successfully!', type: 'alert' });
      setConsultationFee('');
    } catch (e) {
      console.error("Error adding affiliation: ", e);
      setModal({ show: true, title: 'Error', message: 'Failed to add affiliation.', type: 'alert' });
    }
  };

  const handleRegisterAvailability = async (e) => {
    e.preventDefault();
    if (!selectedHospitalForAvailability || !availabilityDate || !availabilityStartTime || !availabilityEndTime) {
      setModal({ show: true, title: 'Input Error', message: 'Please fill all availability fields.', type: 'alert' });
      return;
    }

    const startDateTime = new Date(`${availabilityDate}T${availabilityStartTime}:00`);
    const endDateTime = new Date(`${availabilityDate}T${availabilityEndTime}:00`);

    if (startDateTime >= endDateTime) {
      setModal({ show: true, title: 'Validation Error', message: 'End time must be after start time.', type: 'alert' });
      return;
    }

    // Check for overlapping time slots across ALL hospitals for this doctor
    const isOverlapping = doctorAvailabilities.some(slot => {
      const existingStart = slot.start_time.toDate();
      const existingEnd = slot.end_time.toDate();
      return (
        (startDateTime < existingEnd && endDateTime > existingStart) && // Overlap condition
        !slot.is_booked // Only check unbooked slots for new overlaps
      );
    });

    if (isOverlapping) {
      setModal({ show: true, title: 'Validation Error', message: 'This time slot conflicts with an existing availability.', type: 'alert' });
      return;
    }

    try {
      await addDoc(collection(db, `artifacts/${appId}/public/data/doctorAvailability`), {
        doctor_id: userId,
        hospital_id: selectedHospitalForAvailability,
        start_time: startDateTime,
        end_time: endDateTime,
        is_booked: false,
        created_at: serverTimestamp(),
      });
      setModal({ show: true, title: 'Success', message: 'Availability registered successfully!', type: 'alert' });
      setAvailabilityDate('');
      setAvailabilityStartTime('');
      setAvailabilityEndTime('');
    } catch (e) {
      console.error("Error adding availability: ", e);
      setModal({ show: true, title: 'Error', message: 'Failed to register availability.', type: 'alert' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-4xl font-extrabold text-gray-900 mb-10 text-center">Doctor Dashboard</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
        {/* Update Profile */}
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Update Your Profile</h2>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label htmlFor="doctorName" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input
                type="text"
                id="doctorName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Your Name"
              />
            </div>
            <div>
              <label htmlFor="qualifications" className="block text-sm font-medium text-gray-700 mb-1">Qualifications</label>
              <input
                type="text"
                id="qualifications"
                value={qualifications}
                onChange={(e) => setQualifications(e.target.value)}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="e.g., MBBS, MD"
              />
            </div>
            <div>
              <label htmlFor="specializations" className="block text-sm font-medium text-gray-700 mb-1">Specializations (comma-separated)</label>
              <input
                type="text"
                id="specializations"
                value={specializations}
                onChange={(e) => setSpecializations(e.target.value)}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="e.g., Cardiology, Pediatrics"
              />
            </div>
            <div>
              <label htmlFor="experience" className="block text-sm font-medium text-gray-700 mb-1">Years of Experience</label>
              <input
                type="number"
                id="experience"
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="e.g., 10"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-200"
            >
              Update Profile
            </button>
          </form>
        </div>

        {/* Affiliate with Hospital */}
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Affiliate with Hospital</h2>
          <form onSubmit={handleAffiliateHospital} className="space-y-4">
            <div>
              <label htmlFor="selectHospitalAffiliation" className="block text-sm font-medium text-gray-700 mb-1">Select Hospital</label>
              <select
                id="selectHospitalAffiliation"
                value={selectedHospitalForAffiliation}
                onChange={(e) => setSelectedHospitalForAffiliation(e.target.value)}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
              >
                {hospitals.length === 0 && <option value="">No hospitals available</option>}
                {hospitals.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="selectDepartmentAffiliation" className="block text-sm font-medium text-gray-700 mb-1">Select Department</label>
              <select
                id="selectDepartmentAffiliation"
                value={selectedDepartmentForAffiliation}
                onChange={(e) => setSelectedDepartmentForAffiliation(e.target.value)}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
              >
                {departments.length === 0 && <option value="">No departments available</option>}
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="consultationFee" className="block text-sm font-medium text-gray-700 mb-1">Consultation Fee ($)</label>
              <input
                type="number"
                id="consultationFee"
                value={consultationFee}
                onChange={(e) => setConsultationFee(e.target.value)}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="e.g., 50.00"
                step="0.01"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-200"
              disabled={!doctorProfile || hospitals.length === 0 || departments.length === 0}
            >
              Affiliate Hospital
            </button>
          </form>
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Your Affiliations:</h3>
            {affiliations.length > 0 ? (
              <ul className="space-y-2">
                {affiliations.map(aff => (
                  <li key={aff.id} className="p-3 bg-gray-50 rounded-md border border-gray-200 text-sm">
                    {aff.hospital_name} ({aff.department_name}) - Fee: ${aff.consultation_fee.toFixed(2)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 text-sm">No affiliations yet.</p>
            )}
          </div>
        </div>

        {/* Register Availability */}
        <div className="bg-white p-6 rounded-xl shadow-lg lg:col-span-2">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Register Availability Time Slots</h2>
          <form onSubmit={handleRegisterAvailability} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="selectHospitalAvailability" className="block text-sm font-medium text-gray-700 mb-1">Select Hospital</label>
              <select
                id="selectHospitalAvailability"
                value={selectedHospitalForAvailability}
                onChange={(e) => setSelectedHospitalForAvailability(e.target.value)}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
              >
                {hospitals.length === 0 && <option value="">No hospitals available</option>}
                {hospitals.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="availabilityDate" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                id="availabilityDate"
                value={availabilityDate}
                onChange={(e) => setAvailabilityDate(e.target.value)}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            <div className="flex space-x-2">
              <div className="flex-1">
                <label htmlFor="availabilityStartTime" className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                <input
                  type="time"
                  id="availabilityStartTime"
                  value={availabilityStartTime}
                  onChange={(e) => setAvailabilityStartTime(e.target.value)}
                  className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="availabilityEndTime" className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                <input
                  type="time"
                  id="availabilityEndTime"
                  value={availabilityEndTime}
                  onChange={(e) => setAvailabilityEndTime(e.target.value)}
                  className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
            </div>
            <div className="md:col-span-3">
              <button
                type="submit"
                className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-200"
                disabled={affiliations.length === 0}
              >
                Register Availability
              </button>
            </div>
          </form>
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Your Upcoming Availabilities:</h3>
            {doctorAvailabilities.length > 0 ? (
              <ul className="space-y-2">
                {doctorAvailabilities.map(avail => (
                  <li key={avail.id} className={`p-3 rounded-md border text-sm ${avail.is_booked ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                    {avail.hospital_name} - {new Date(avail.start_time.toDate()).toLocaleString()} to {new Date(avail.end_time.toDate()).toLocaleTimeString()} ({avail.is_booked ? 'Booked' : 'Available'})
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 text-sm">No availabilities registered yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Doctor Dashboard Stats */}
      <div className="mt-10 max-w-6xl mx-auto bg-white p-6 rounded-xl shadow-lg">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Your Dashboard Overview</h2>
        {dashboardStats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg shadow-sm">
              <h3 className="text-lg font-semibold text-blue-800">Total Earnings</h3>
              <p className="text-3xl font-bold text-blue-600">${dashboardStats.totalEarnings}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg shadow-sm">
              <h3 className="text-lg font-semibold text-green-800">Total Consultations</h3>
              <p className="text-3xl font-bold text-green-600">{dashboardStats.totalConsultations}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg shadow-sm col-span-full">
              <h3 className="text-lg font-semibold text-purple-800 mb-2">Earnings By Hospital</h3>
              {dashboardStats.earningsByHospital.length > 0 ? (
                <ul className="list-disc list-inside text-gray-700">
                  {dashboardStats.earningsByHospital.map((eh, index) => (
                    <li key={index}>{eh.name}: ${eh.revenue}</li>
                  ))}
                </ul>
              ) : <p className="text-gray-500">No earnings data yet.</p>}
            </div>
          </div>
        ) : (
          <p className="text-center text-gray-600">Loading dashboard data...</p>
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

export default DoctorDashboard;
