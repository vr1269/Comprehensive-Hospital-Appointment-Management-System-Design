// src/components/PatientDashboard.js
import React, { useState, useEffect, useContext } from 'react';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { AppContext } from '../AppContext';
import Modal from './Modal';

const PatientDashboard = () => {
  const { db, userId, appId, isAuthReady } = useContext(AppContext);
  const [patientName, setPatientName] = useState('');
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('');
  const [uniqueIdType, setUniqueIdType] = useState('');
  const [uniqueIdNumber, setUniqueIdNumber] = useState('');
  const [patientProfile, setPatientProfile] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSpecialization, setFilterSpecialization] = useState('');
  const [filterHospital, setFilterHospital] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [availableDoctors, setAvailableDoctors] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [allSpecializations, setAllSpecializations] = useState([]);
  const [modal, setModal] = useState({ show: false, title: '', message: '', type: 'alert', onConfirm: () => {}, onCancel: () => {} });
  const [patientAppointments, setPatientAppointments] = useState([]);

  useEffect(() => {
    if (!isAuthReady || !db || !userId) return;

    // Fetch patient profile
    const profileRef = doc(db, `artifacts/${appId}/users/${userId}/profile/data`);
    const unsubscribeProfile = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) {
        setPatientProfile(docSnap.data());
        setPatientName(docSnap.data().name || '');
        setGender(docSnap.data().gender || '');
        setDob(docSnap.data().date_of_birth || '');
        setUniqueIdType(docSnap.data().unique_id_type || '');
        setUniqueIdNumber(docSnap.data().unique_id_number || '');
      }
    }, (error) => console.error("Error fetching patient profile:", error));

    // Fetch hospitals
    const hospitalsRef = collection(db, `artifacts/${appId}/public/data/hospitals`);
    const unsubscribeHospitals = onSnapshot(hospitalsRef, (snapshot) => {
      setHospitals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => console.error("Error fetching hospitals:", error));

    // Fetch all specializations from doctors
    const fetchAllSpecializations = async () => {
      const doctorsCol = collection(db, `artifacts/${appId}/users`);
      const doctorProfilesQuery = query(doctorsCol, where('profile.data.role', '==', 'Doctor'));
      const querySnapshot = await getDocs(doctorProfilesQuery);
      const specs = new Set();
      querySnapshot.docs.forEach(docSnap => {
        const profileData = docSnap.data().profile?.data;
        if (profileData && profileData.specializations) {
          profileData.specializations.forEach(s => specs.add(s));
        }
      });
      setAllSpecializations(Array.from(specs).sort());
    };
    fetchAllSpecializations();

    // Fetch patient appointments
    const appointmentsQuery = query(
      collection(db, `artifacts/${appId}/public/data/appointments`),
      where('patient_id', '==', userId)
    );
    const unsubscribeAppointments = onSnapshot(appointmentsQuery, async (snapshot) => {
      const fetchedAppointments = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const appointmentsWithDetails = await Promise.all(fetchedAppointments.map(async (appt) => {
        const doctorProfileRef = doc(db, `artifacts/${appId}/users/${appt.doctor_id}/profile/data`);
        const doctorSnap = await getDoc(doctorProfileRef);
        const hospitalSnap = await getDoc(doc(db, `artifacts/${appId}/public/data/hospitals`, appt.hospital_id));
        return {
          ...appt,
          doctor_name: doctorSnap.exists() ? doctorSnap.data().name : 'Unknown Doctor',
          hospital_name: hospitalSnap.exists() ? hospitalSnap.data().name : 'Unknown Hospital',
        };
      }));
      setPatientAppointments(appointmentsWithDetails.sort((a, b) => b.appointment_date_time.toDate() - a.appointment_date_time.toDate()));
    }, (error) => console.error("Error fetching patient appointments:", error));


    return () => {
      unsubscribeProfile();
      unsubscribeHospitals();
      unsubscribeAppointments();
    };
  }, [isAuthReady, db, userId, appId]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!patientName || !gender || !dob || !uniqueIdType || !uniqueIdNumber) {
      setModal({ show: true, title: 'Input Error', message: 'Please fill all patient profile fields.', type: 'alert' });
      return;
    }
    try {
      const profileRef = doc(db, `artifacts/${appId}/users/${userId}/profile/data`);
      await setDoc(profileRef, {
        name: patientName,
        gender,
        date_of_birth: dob,
        unique_id_type: uniqueIdType,
        unique_id_number: uniqueIdNumber,
        role: 'Patient', // Ensure role is set
        updated_at: serverTimestamp(),
      }, { merge: true });
      setModal({ show: true, title: 'Success', message: 'Profile updated successfully!', type: 'alert' });
    } catch (e) {
      console.error("Error updating patient profile: ", e);
      setModal({ show: true, title: 'Error', message: 'Failed to update profile.', type: 'alert' });
    }
  };

  const handleSearchDoctors = async () => {
    if (!isAuthReady || !db) return;

    let q = collection(db, `artifacts/${appId}/public/data/hospitalDoctorAffiliations`);

    // Fetch all affiliations first
    const affiliationsSnap = await getDocs(q);
    let filteredAffiliations = affiliationsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Filter by hospital if selected
    if (filterHospital) {
      filteredAffiliations = filteredAffiliations.filter(aff => aff.hospital_id === filterHospital);
    }

    const doctorIds = filteredAffiliations.map(aff => aff.doctor_id);
    if (doctorIds.length === 0) {
      setAvailableDoctors([]);
      return;
    }

    // Fetch doctor profiles for the filtered affiliations
    const doctorProfiles = {};
    for (const docId of [...new Set(doctorIds)]) { // Use Set to avoid duplicate fetches
      const profileRef = doc(db, `artifacts/${appId}/users/${docId}/profile/data`);
      const profileSnap = await getDoc(profileRef);
      if (profileSnap.exists()) {
        doctorProfiles[docId] = { id: docId, ...profileSnap.data() };
      }
    }

    // Filter by specialization and search term
    let doctorsWithSpecializations = Object.values(doctorProfiles).filter(doctor => {
      const matchesSpecialization = filterSpecialization ? doctor.specializations?.includes(filterSpecialization) : true;
      const matchesSearchTerm = searchTerm ? doctor.name.toLowerCase().includes(searchTerm.toLowerCase()) || doctor.specializations?.some(s => s.toLowerCase().includes(searchTerm.toLowerCase())) : true;
      return matchesSpecialization && matchesSearchTerm;
    });

    const results = [];
    for (const doctor of doctorsWithSpecializations) {
      const doctorAffiliations = filteredAffiliations.filter(aff => aff.doctor_id === doctor.id);

      for (const aff of doctorAffiliations) {
        const hospitalSnap = await getDoc(doc(db, `artifacts/${appId}/public/data/hospitals`, aff.hospital_id));
        const hospitalName = hospitalSnap.exists() ? hospitalSnap.data().name : 'Unknown Hospital';

        // Fetch available slots for this doctor at this hospital
        let availabilityQuery = query(
          collection(db, `artifacts/${appId}/public/data/doctorAvailability`),
          where('doctor_id', '==', doctor.id),
          where('hospital_id', '==', aff.hospital_id),
          where('is_booked', '==', false)
        );

        if (filterDate) {
          const startOfDay = new Date(filterDate);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(filterDate);
          endOfDay.setHours(23, 59, 59, 999);
          availabilityQuery = query(
            availabilityQuery,
            where('start_time', '>=', startOfDay),
            where('start_time', '<=', endOfDay)
          );
        }

        const availabilitySnap = await getDocs(availabilityQuery);
        const availableSlots = availabilitySnap.docs.map(s => ({ id: s.id, ...s.data() }));

        if (availableSlots.length > 0) {
          results.push({
            doctor_id: doctor.id,
            doctor_name: doctor.name,
            qualifications: doctor.qualifications,
            specializations: doctor.specializations,
            years_of_experience: doctor.years_of_experience,
            hospital_id: aff.hospital_id,
            hospital_name: hospitalName,
            consultation_fee: aff.consultation_fee,
            available_slots: availableSlots.sort((a, b) => a.start_time.toDate() - b.start_time.toDate())
          });
        }
      }
    }
    setAvailableDoctors(results);
  };

  const handleBookAppointment = (doctor, slot, consultationAmount) => {
    setModal({
      show: true,
      title: 'Confirm Appointment',
      message: `Book ${doctor.doctor_name} at ${doctor.hospital_name} on ${new Date(slot.start_time.toDate()).toLocaleString()} for $${consultationAmount}?`,
      type: 'confirm',
      onConfirm: async () => {
        setModal({ show: false, title: '', message: '' }); // Close modal first
        try {
          // Check if slot is still available (optimistic locking)
          const slotRef = doc(db, `artifacts/${appId}/public/data/doctorAvailability`, slot.id);
          const slotSnap = await getDoc(slotRef);

          if (!slotSnap.exists() || slotSnap.data().is_booked) {
            setModal({ show: true, title: 'Booking Failed', message: 'This slot is no longer available. Please refresh and try again.', type: 'alert' });
            return;
          }

          // Update availability to booked
          await updateDoc(slotRef, {
            is_booked: true,
            booked_by_patient_id: userId,
            updated_at: serverTimestamp(),
          });

          const doctorRevenue = consultationAmount * 0.6;
          const hospitalRevenue = consultationAmount * 0.4;

          // Create appointment record
          await addDoc(collection(db, `artifacts/${appId}/public/data/appointments`), {
            patient_id: userId,
            doctor_id: doctor.doctor_id,
            hospital_id: doctor.hospital_id,
            availability_id: slot.id,
            appointment_date_time: slot.start_time,
            consultation_fee_paid: consultationAmount,
            doctor_revenue: doctorRevenue,
            hospital_revenue: hospitalRevenue,
            status: 'Booked',
            booked_at: serverTimestamp(),
          });
          setModal({ show: true, title: 'Success', message: 'Appointment booked successfully!', type: 'alert' });
          handleSearchDoctors(); // Refresh search results
        } catch (e) {
          console.error("Error booking appointment:", e);
          setModal({ show: true, title: 'Error', message: 'Failed to book appointment. Please try again.', type: 'alert' });
        }
      },
      onCancel: () => setModal({ show: false, title: '', message: '' })
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-4xl font-extrabold text-gray-900 mb-10 text-center">Patient Dashboard</h1>

      {/* Update Patient Profile */}
      <div className="bg-white p-6 rounded-xl shadow-lg max-w-6xl mx-auto mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Your Profile</h2>
        <form onSubmit={handleUpdateProfile} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="patientName" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              id="patientName"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Your Name"
            />
          </div>
          <div>
            <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
            <select
              id="gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
            >
              <option value="">Select Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label htmlFor="dob" className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
            <input
              type="date"
              id="dob"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="uniqueIdType" className="block text-sm font-medium text-gray-700 mb-1">Unique ID Type</label>
            <select
              id="uniqueIdType"
              value={uniqueIdType}
              onChange={(e) => setUniqueIdType(e.target.value)}
              className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
            >
              <option value="">Select ID Type</option>
              <option value="Aadhar">Aadhar</option>
              <option value="Passport">Passport</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="uniqueIdNumber" className="block text-sm font-medium text-gray-700 mb-1">Unique ID Number</label>
            <input
              type="text"
              id="uniqueIdNumber"
              value={uniqueIdNumber}
              onChange={(e) => setUniqueIdNumber(e.target.value)}
              className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Your unique identification number"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-200"
            >
              Update Profile
            </button>
          </div>
        </form>
      </div>

      {/* Search Doctors */}
      <div className="bg-white p-6 rounded-xl shadow-lg max-w-6xl mx-auto mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Find a Doctor</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <label htmlFor="searchTerm" className="block text-sm font-medium text-gray-700 mb-1">Search by Name/Specialization</label>
            <input
              type="text"
              id="searchTerm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="e.g., John Doe, Cardiology"
            />
          </div>
          <div>
            <label htmlFor="filterSpecialization" className="block text-sm font-medium text-gray-700 mb-1">Filter by Specialization</label>
            <select
              id="filterSpecialization"
              value={filterSpecialization}
              onChange={(e) => setFilterSpecialization(e.target.value)}
              className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
            >
              <option value="">All Specializations</option>
              {allSpecializations.map(spec => (
                <option key={spec} value={spec}>{spec}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filterHospital" className="block text-sm font-medium text-gray-700 mb-1">Filter by Hospital</label>
            <select
              id="filterHospital"
              value={filterHospital}
              onChange={(e) => setFilterHospital(e.target.value)}
              className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
            >
              <option value="">All Hospitals</option>
              {hospitals.map(h => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filterDate" className="block text-sm font-medium text-gray-700 mb-1">Filter by Date</label>
            <input
              type="date"
              id="filterDate"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
        </div>
        <button
          onClick={handleSearchDoctors}
          className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-200"
          disabled={!patientProfile}
        >
          Search Doctors
        </button>

        <div className="mt-8">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Available Doctors</h3>
          {availableDoctors.length > 0 ? (
            <div className="space-y-6">
              {availableDoctors.map(doctor => (
                <div key={`${doctor.doctor_id}-${doctor.hospital_id}`} className="bg-gray-50 p-5 rounded-lg shadow-sm border border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900">{doctor.doctor_name}</h4>
                  <p className="text-sm text-gray-600">Specializations: {doctor.specializations?.join(', ')}</p>
                  <p className="text-sm text-gray-600">Qualifications: {doctor.qualifications}</p>
                  <p className="text-sm text-gray-600">Experience: {doctor.years_of_experience} years</p>
                  <p className="text-sm text-gray-600">Hospital: {doctor.hospital_name}</p>
                  <p className="text-base font-medium text-indigo-700 mt-2">Consultation Fee: ${doctor.consultation_fee.toFixed(2)}</p>

                  <div className="mt-4">
                    <h5 className="text-md font-semibold text-gray-800 mb-2">Available Slots:</h5>
                    {doctor.available_slots.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {doctor.available_slots.map(slot => (
                          <div key={slot.id} className={`p-3 rounded-md border ${slot.is_booked ? 'bg-red-100 border-red-300 text-red-700' : 'bg-green-100 border-green-300 text-green-700'}`}>
                            <p className="text-sm font-medium">
                              {new Date(slot.start_time.toDate()).toLocaleString()} - {new Date(slot.end_time.toDate()).toLocaleTimeString()}
                            </p>
                            {!slot.is_booked && (
                              <button
                                onClick={() => handleBookAppointment(doctor, slot, doctor.consultation_fee)}
                                className="mt-2 w-full py-1 px-3 bg-indigo-500 text-white text-xs rounded-md hover:bg-indigo-600 transition duration-200"
                              >
                                Book Now
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">No available slots for this doctor at this hospital.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-600">No doctors found matching your criteria.</p>
          )}
        </div>
      </div>

      {/* Patient History */}
      <div className="mt-10 max-w-6xl mx-auto bg-white p-6 rounded-xl shadow-lg">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Your Consultation History</h2>
        {patientAppointments.length > 0 ? (
          <div className="space-y-4">
            {patientAppointments.map(appt => (
              <div key={appt.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="font-semibold text-gray-900">Doctor: {appt.doctor_name}</p>
                <p className="text-sm text-gray-600">Hospital: {appt.hospital_name}</p>
                <p className="text-sm text-gray-600">Date & Time: {new Date(appt.appointment_date_time.toDate()).toLocaleString()}</p>
                <p className="text-sm text-gray-600">Fee Paid: ${appt.consultation_fee_paid.toFixed(2)}</p>
                <p className="text-sm text-gray-600">Status: <span className={`font-medium ${appt.status === 'Booked' ? 'text-blue-600' : appt.status === 'Completed' ? 'text-green-600' : 'text-red-600'}`}>{appt.status}</span></p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-600">You have no past consultations.</p>
        )}
      </div>

      <Modal
        show={modal.show}
        title={modal.title}
        message={modal.message}
        onConfirm={modal.onConfirm}
        onCancel={modal.onCancel}
        type={modal.type}
      />
    </div>
  );
};

export default PatientDashboard;
