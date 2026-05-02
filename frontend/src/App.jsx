import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import {
  AndroidBiometryStrength,
  BiometricAuth,
  BiometryError,
  BiometryErrorType
} from "@aparajita/capacitor-biometric-auth";
import {
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword
} from "firebase/auth";
import { getToken, onMessage } from "firebase/messaging";

import { apiRequest } from "./api";
import { QRCodeCard } from "./components/QRCodeCard";
import { QRScanner } from "./components/QRScanner";
import { auth, getMessagingIfSupported } from "./firebase";
import { formatDate, formatDateOnly, getStatusTone, maskToken } from "./utils";

const emptyMemberForm = {
  name: "",
  email: "",
  password: "",
  membership_plan: "Standard",
  membership_start_date: "",
  membership_end_date: "",
  payment_status: "paid"
};

const BIOMETRIC_PREF_KEY = "gym_biometric_enabled";
const BIOMETRIC_REMEMBER_KEY = "gym_biometric_remember";
const BIOMETRIC_EMAIL_KEY = "gym_bio_email";
const BIOMETRIC_PASSWORD_KEY = "gym_bio_password";

function isBiometricEnabled() {
  return localStorage.getItem(BIOMETRIC_PREF_KEY) === "true";
}

function getBiometricCredentials() {
  const email = localStorage.getItem(BIOMETRIC_EMAIL_KEY) || "";
  const password = localStorage.getItem(BIOMETRIC_PASSWORD_KEY) || "";
  return { email, password };
}

function saveBiometricCredentials(email, password) {
  localStorage.setItem(BIOMETRIC_EMAIL_KEY, email);
  localStorage.setItem(BIOMETRIC_PASSWORD_KEY, password);
}

function clearBiometricCredentials() {
  localStorage.removeItem(BIOMETRIC_EMAIL_KEY);
  localStorage.removeItem(BIOMETRIC_PASSWORD_KEY);
}

function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [idToken, setIdToken] = useState("");
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState("signin");
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    name: ""
  });
  const [members, setMembers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [stats, setStats] = useState(null);
  const [occupancy, setOccupancy] = useState(null);
  const [memberForm, setMemberForm] = useState(emptyMemberForm);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [announcement, setAnnouncement] = useState({
    title: "",
    body: ""
  });
  const [memberAttendance, setMemberAttendance] = useState([]);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loginTarget, setLoginTarget] = useState(null); // 'admin' or 'member'
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState("asc");
  const [modal, setModal] = useState({ type: null, data: null });
  const [plans, setPlans] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState("dashboard");
  const [memberActiveView, setMemberActiveView] = useState("dashboard");
  const [attendanceFilterName, setAttendanceFilterName] = useState("");
  const [attendanceFilterDate, setAttendanceFilterDate] = useState("");
  const [attendanceFilterStatus, setAttendanceFilterStatus] = useState("all");
  const [theme, setTheme] = useState(localStorage.getItem("gym_theme") || "light");
  const [rememberBiometric, setRememberBiometric] = useState(
    localStorage.getItem(BIOMETRIC_REMEMBER_KEY) === "true"
  );
  const biometricUnlockedUidRef = useRef("");
  const pushListenersReadyRef = useRef(false);
  const biometricSignInVerifiedRef = useRef(false);

  useEffect(() => {
    if (theme === "dark") {
      document.body.classList.add("dark-theme");
    } else {
      document.body.classList.remove("dark-theme");
    }
    localStorage.setItem("gym_theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(BIOMETRIC_REMEMBER_KEY, rememberBiometric ? "true" : "false");
  }, [rememberBiometric]);

  const isAdmin = session?.user?.role === "admin";
  const isMember = session?.user?.role === "member";

  useEffect(() => {
    let unsubscribe = () => {};
    let canceled = false;

    async function initAuth() {
      try {
        if (Capacitor.isNativePlatform()) {
          await setPersistence(auth, inMemoryPersistence);
        }
      } catch (persistenceError) {
        console.error("Failed to set auth persistence", persistenceError);
      }

      if (canceled) {
        return;
      }

      unsubscribe = onAuthStateChanged(auth, async (user) => {
        setFirebaseUser(user);

        if (!user) {
          setIdToken("");
          setSession(null);
          setMembers([]);
          setAttendance([]);
          setStats(null);
          setMemberAttendance([]);
          biometricUnlockedUidRef.current = "";
          setLoading(false);
          return;
        }

        const freshToken = await user.getIdToken();
        setIdToken(freshToken);
      });
    }

    initAuth();

    return () => {
      canceled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!idToken || !loginTarget) {
      return;
    }

    async function loadSession() {
      setLoading(true);
      setError("");

      try {
        const currentUid = auth.currentUser?.uid;
        if (currentUid && shouldRequireBiometricUnlock() && !biometricSignInVerifiedRef.current) {
          try {
            await ensureBiometricUnlock(currentUid);
          } catch (unlockError) {
            await signOut(auth).catch(() => {});
            throw unlockError;
          }
        }

        const data = await apiRequest("/auth/me", { token: idToken });
        if (currentUid && shouldRequireBiometricUnlock()) {
          biometricUnlockedUidRef.current = currentUid;
        }
        biometricSignInVerifiedRef.current = false;
        
        // Role-based portal guard without breaking valid sessions.
        if (loginTarget && data.user.role !== loginTarget) {
          if (loginTarget === "admin" && data.user.role === "member") {
            window.history.replaceState({}, "", "/member");
            setLoginTarget("member");
            setSession(data);
            setError("Admin access is restricted to admin accounts.");
            return;
          }

          if (loginTarget === "member" && data.user.role === "admin") {
            window.history.replaceState({}, "", "/admin");
            setLoginTarget("admin");
            setSession(data);
            return;
          }

          await signOut(auth);
          setError(`This account is not registered as a ${loginTarget}. Please use the correct portal.`);
          setSession(null);
          return;
        }

        setSession(data);
      } catch (sessionError) {
        biometricSignInVerifiedRef.current = false;
        setError(sessionError.message);
      } finally {
        setLoading(false);
      }
    }

    loadSession();
  }, [idToken, loginTarget]);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith("/admin")) {
      setLoginTarget("admin");
    } else {
      setLoginTarget("member");
      // Optionally redirect root to /member for clarity
      if (path === "/" || path === "") {
        window.history.replaceState({}, "", "/member");
      }
    }
  }, []);

  useEffect(() => {
    if (!session?.user?.role) {
      return;
    }

    const path = window.location.pathname;
    if (session.user.role === "member" && path.startsWith("/admin")) {
      window.history.replaceState({}, "", "/member");
      setLoginTarget("member");
      setError("Admin access is restricted to admin accounts.");
      return;
    }

    if (session.user.role === "admin" && path.startsWith("/member")) {
      window.history.replaceState({}, "", "/admin");
      setLoginTarget("admin");
    }
  }, [session]);

  useEffect(() => {
    if (!idToken || !session) {
      return;
    }

    if (session.user.role === "admin") {
      loadAdminData();
    } else if (session.user.role === "member") {
      loadMemberData(session.user.uid);
    }

    registerForNotifications({ forceNative: Capacitor.isNativePlatform() });
  }, [idToken, session?.user?.uid, session?.user?.role]);

  useEffect(() => {
    if (!selectedMemberId && members.length) {
      setSelectedMemberId(members[0].id);
    }
  }, [members, selectedMemberId]);

  useEffect(() => {
    let unsubscribe = () => {};

    async function subscribeForegroundNotifications() {
      const messaging = await getMessagingIfSupported();
      if (!messaging) {
        return;
      }

      unsubscribe = onMessage(messaging, (payload) => {
        const title = payload.notification?.title || "Gym Notification";
        const body = payload.notification?.body || "";
        setFeedback(`${title}: ${body}`);
      });
    }

    subscribeForegroundNotifications();

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  function shouldRequireBiometricUnlock() {
    return Capacitor.isNativePlatform() && isBiometricEnabled();
  }

  async function ensureBiometricUnlock(uid) {
    if (biometricUnlockedUidRef.current === uid) {
      return;
    }

    const biometry = await BiometricAuth.checkBiometry();
    if (!biometry.isAvailable && !biometry.deviceIsSecure) {
      throw new Error(
        "Biometric unlock is enabled but unavailable on this device. Disable it in Settings."
      );
    }

    try {
      await BiometricAuth.authenticate({
        reason: "Verify your identity to continue",
        androidTitle: "Gym App Unlock",
        androidSubtitle: "Use biometrics or device PIN",
        androidBiometryStrength: AndroidBiometryStrength.weak,
        allowDeviceCredential: true
      });
      biometricUnlockedUidRef.current = uid;
    } catch (unlockError) {
      if (
        unlockError instanceof BiometryError &&
        unlockError.code === BiometryErrorType.userCancel
      ) {
        throw new Error("Biometric unlock was cancelled.");
      }

      throw new Error(unlockError?.message || "Biometric unlock failed.");
    }
  }

  async function registerForNotifications(options = {}) {
    const { forceNative = false } = options;

    try {
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("PushNotifications")) {
        let permission = await PushNotifications.checkPermissions();
        if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
          permission = await PushNotifications.requestPermissions();
        }
        if (permission.receive !== "granted") {
          throw new Error("Notification permission was denied.");
        }

        if (!forceNative) {
          return;
        }

        if (!pushListenersReadyRef.current) {
          await PushNotifications.addListener("registration", async (registrationToken) => {
            try {
              await apiRequest("/notifications/register-token", {
                token: auth.currentUser ? await auth.currentUser.getIdToken() : idToken,
                method: "POST",
                body: { token: registrationToken.value }
              });
            } catch (registrationError) {
              console.error("Failed to register native push token", registrationError);
            }
          });

          await PushNotifications.addListener("registrationError", (registrationError) => {
            console.error("Native push registration error", registrationError);
          });

          pushListenersReadyRef.current = true;
        }

        await PushNotifications.register();
        return;
      }

      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        return;
      }

      const messaging = await getMessagingIfSupported();
      if (!messaging) {
        return;
      }

      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js"
        )
      });

      if (token) {
        await apiRequest("/notifications/register-token", {
          token: idToken,
          method: "POST",
          body: { token }
        });
      }
    } catch (notificationError) {
      console.error("Notification registration failed", notificationError);
    }
  }

  async function loadAdminData() {
    setLoading(true);
    
    // Helper to run a request safely
    const safeRequest = async (path, setter, key) => {
      try {
        const data = await apiRequest(path, { token: idToken });
        setter(key ? data[key] : data);
      } catch (err) {
        console.error(`Failed to load ${path}:`, err);
        setError(`Error loading ${path}: ${err.message}`);
      }
    };

    await Promise.allSettled([
      safeRequest("/members", setMembers, "members"),
      safeRequest("/attendance", setAttendance, "attendance"),
      safeRequest("/dashboard/stats", setStats),
      safeRequest("/plans", setPlans, "plans"),
      safeRequest("/admins", setAdmins, "admins"),
      safeRequest("/dashboard/activity?limit=100", setActivityLogs, "activity")
    ]);

    setLoading(false);
  }

  async function loadMemberData(memberId) {
    try {
      const [memberData, attendanceData, occupancyData] = await Promise.all([
        apiRequest("/members/me", { token: idToken }),
        apiRequest(`/attendance/${memberId}`, { token: idToken }),
        apiRequest("/dashboard/occupancy", { token: idToken })
      ]);

      setSession((current) => {
        if (!current) return null;
        return {
          ...current,
          user: {
            ...current.user,
            profile: memberData.member
          }
        };
      });
      setMemberAttendance(attendanceData.attendance);
      setOccupancy(occupancyData.active_members);
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setError("");
    setFeedback("");

    try {
      if (authMode === "signin") {
        await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
        if (rememberBiometric && isBiometricEnabled()) {
          saveBiometricCredentials(authForm.email, authForm.password);
        } else {
          clearBiometricCredentials();
        }
        setFeedback("Signed in successfully.");
      } else {
        await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
        setFeedback(
          "Firebase account created. Assign a matching Firestore role document before continuing."
        );
      }
    } catch (authError) {
      setError(authError.message);
    }
  }

  async function handleBiometricSignIn() {
    setError("");
    setFeedback("");

    try {
      if (!Capacitor.isNativePlatform()) {
        throw new Error("Biometric sign-in is available only on mobile app.");
      }

      if (!isBiometricEnabled()) {
        throw new Error("Enable biometrics in Settings first.");
      }

      const credentials = getBiometricCredentials();
      if (!credentials.email || !credentials.password) {
        throw new Error("No biometric login credentials found. Sign in once and enable Remember me.");
      }

      await BiometricAuth.authenticate({
        reason: "Sign in to Gym App",
        androidTitle: "Biometric Sign In",
        androidSubtitle: "Use biometrics or device PIN",
        androidBiometryStrength: AndroidBiometryStrength.weak,
        allowDeviceCredential: true
      });

      biometricSignInVerifiedRef.current = true;
      await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
      setFeedback("Signed in with biometrics.");
    } catch (loginError) {
      biometricSignInVerifiedRef.current = false;
      if (loginError instanceof BiometryError && loginError.code === BiometryErrorType.userCancel) {
        setError("Biometric sign-in was cancelled.");
      } else {
        setError(loginError.message || "Biometric sign-in failed.");
      }
    }
  }

  async function handleLogout() {
    await signOut(auth);
    biometricUnlockedUidRef.current = "";
    setFeedback("Signed out.");
  }

  async function handleManualAttendance(memberId) {
    setError("");
    setFeedback("");
    try {
      await apiRequest(`/attendance/check-in`, {
        token: idToken,
        method: "POST",
        body: { member_id: memberId, qr_token: "MANUAL_BY_ADMIN" }
      });
      setFeedback("Member checked in manually.");
      await loadAdminData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateMember(event) {
    event.preventDefault();
    setError("");
    setFeedback("");

    try {
      const response = await apiRequest("/members", {
        token: idToken,
        method: "POST",
        body: memberForm
      });

      setMembers((current) => [...current, response.member].sort(sortMembersByExpiry));
      setMemberForm(emptyMemberForm);
      setFeedback("Member created successfully.");
      await loadAdminData();
    } catch (memberError) {
      setError(memberError.message);
    }
  }

  async function handleDeleteMember(memberId) {
    setError("");
    setFeedback("");

    try {
      await apiRequest(`/members/${memberId}`, {
        token: idToken,
        method: "DELETE"
      });
      setFeedback("Member archived successfully.");
      await loadAdminData();
    } catch (memberError) {
      setError(memberError.message);
    }
  }

  async function handleCreateAdmin(event) {
    event.preventDefault();
    setError("");
    setFeedback("");

    const form = event.target;
    const payload = {
      name: form.name.value,
      email: form.email.value,
      password: form.password.value
    };

    try {
      const response = await apiRequest("/admins", {
        token: idToken,
        method: "POST",
        body: payload
      });

      setAdmins((current) => [...current, response.admin]);
      form.reset();
      setFeedback("Admin created successfully.");
    } catch (adminError) {
      setError(adminError.message);
    }
  }

  async function handleScan(scannedToken) {
    setError("");
    setFeedback("");

    try {
      const result = await apiRequest("/attendance/scan", {
        token: idToken,
        method: "POST",
        body: {
          scanned_qr_token: scannedToken
        }
      });

      setFeedback(`Attendance ${result.action.replace("_", " ")} successfully.`);
      setMemberActiveView("dashboard");
      await loadMemberData(session.user.uid);
    } catch (scanError) {
      setError(scanError.message);
    }
  }

  async function handleSendAnnouncement(event) {
    event.preventDefault();
    setError("");
    setFeedback("");

    try {
      await apiRequest("/notifications/announcements", {
        token: idToken,
        method: "POST",
        body: announcement
      });
      setAnnouncement({ title: "", body: "" });
      setFeedback("Announcement sent.");
    } catch (announcementError) {
      setError(announcementError.message);
    }
  }

  async function handleDispatchExpiryAlerts() {
    setError("");
    setFeedback("");

    try {
      await apiRequest("/notifications/expiry-alerts/dispatch", {
        token: idToken,
        method: "POST"
      });
      setFeedback("Expiry alerts dispatched.");
    } catch (notificationError) {
      setError(notificationError.message);
    }
  }

  const activeSessions = useMemo(
    () => attendance.filter((entry) => entry.status === "active"),
    [attendance]
  );

  const filteredMembers = useMemo(() => {
    return [...members]
      .filter(m => 
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        m.email.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => {
        const compare = a.name.localeCompare(b.name);
        return sortOrder === "asc" ? compare : -compare;
      });
  }, [members, searchTerm, sortOrder]);

  if (loading) {
    return <div className="shell centered">Loading application...</div>;
  }

  return (
    <div className={`shell ${!session ? 'centered' : ''}`}>
      {session && (
        <aside className={`hero-panel ${loginTarget} ${sidebarOpen ? 'open' : ''}`}>
        <div className="hero-content">
          <div className="sidebar-header">
            <h3>{isAdmin ? "Admin Summary" : "My Overview"}</h3>
            <button className="close-sidebar" onClick={() => setSidebarOpen(false)}>✕</button>
          </div>
        </div>

        {isAdmin && stats ? (
          <div className="metrics-grid">
            <MetricCard label="Total Members" value={stats.totals.members} />
            <MetricCard label="Active Now" value={stats.totals.active_members} />
            <MetricCard label="Revenue" value={`Rs. ${stats.totals.estimated_monthly_revenue}`} />
            <MetricCard label="Expiring" value={stats.totals.expiring_members} />
          </div>
        ) : null}

        {isMember && session?.user?.profile ? (
          <div className="metrics-grid">
            <MetricCard label="My Status" value={session.user.profile.payment_status} />
            <MetricCard label="Plan" value={session.user.profile.membership_plan} />
          </div>
        ) : null}

        {isAdmin && (
          <nav className="sidebar-nav">
            <button className={`nav-item ${activeView === 'dashboard' ? 'active' : ''}`} onClick={() => { setActiveView('dashboard'); setSidebarOpen(false); }}>🏠 Dashboard</button>
            <button className={`nav-item ${activeView === 'live' ? 'active' : ''}`} onClick={() => { setActiveView('live'); setSidebarOpen(false); }}>🟢 Live</button>
            <button className={`nav-item ${activeView === 'members' ? 'active' : ''}`} onClick={() => { setActiveView('members'); setSidebarOpen(false); }}>👥 Members</button>
            <button className={`nav-item ${activeView === 'plans' ? 'active' : ''}`} onClick={() => { setActiveView('plans'); setSidebarOpen(false); }}>📋 Plans</button>
            <button className={`nav-item ${activeView === 'admins' ? 'active' : ''}`} onClick={() => { setActiveView('admins'); setSidebarOpen(false); }}>🔑 Admins</button>
            <button className={`nav-item ${activeView === 'activity' ? 'active' : ''}`} onClick={() => { setActiveView('activity'); setSidebarOpen(false); }}>🧾 Activity</button>
            <button className={`nav-item ${activeView === 'broadcast' ? 'active' : ''}`} onClick={() => { setActiveView('broadcast'); setSidebarOpen(false); }}>📢 Broadcast</button>
          </nav>
        )}

        {isMember && (
          <nav className="sidebar-nav">
            <button className={`nav-item ${memberActiveView === 'dashboard' ? 'active' : ''}`} onClick={() => { setMemberActiveView('dashboard'); setSidebarOpen(false); }}>🏠 Dashboard</button>
            <button className={`nav-item ${memberActiveView === 'settings' ? 'active' : ''}`} onClick={() => { setMemberActiveView('settings'); setSidebarOpen(false); }}>⚙️ Settings</button>
          </nav>
        )}
        </aside>
      )}

      <main className="workspace">
        {session && (
          <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
            <h2>{session ? `Welcome, ${session.user.profile?.name || session.user.role}` : `${loginTarget?.toUpperCase()} ACCESS`}</h2>
          </div>
          {firebaseUser && (
            <button className="secondary-button" onClick={handleLogout}>Sign Out</button>
          )}
          </header>
        )}

        {feedback && <div className="message success">{feedback}</div>}
        {error && <div className="message error">{error}</div>}

        {!firebaseUser && loginTarget && (
          <AuthPanel
            authForm={authForm}
            authMode={authMode}
            setAuthForm={setAuthForm}
            setAuthMode={setAuthMode}
            onSubmit={handleAuthSubmit}
            onBiometricSignIn={handleBiometricSignIn}
            loginTarget={loginTarget}
            rememberBiometric={rememberBiometric}
            setRememberBiometric={setRememberBiometric}
          />
        )}

        {isAdmin && (
          <AdminDashboard
            announcement={announcement}
            attendance={attendance}
            activeSessions={activeSessions}
            memberForm={memberForm}
            members={filteredMembers}
            onAnnouncementChange={setAnnouncement}
            onCreateMember={handleCreateMember}
            onDeleteMember={handleDeleteMember}
            onDispatchExpiryAlerts={handleDispatchExpiryAlerts}
            onMemberFormChange={setMemberForm}
            onSendAnnouncement={handleSendAnnouncement}
            selectedMemberId={selectedMemberId}
            setSelectedMemberId={setSelectedMemberId}
            stats={stats}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            setModal={setModal}
            plans={plans}
            onManualCheckIn={handleManualAttendance}
            activeView={activeView}
            setActiveView={setActiveView}
            activityLogs={activityLogs}
            attendanceFilterName={attendanceFilterName}
            setAttendanceFilterName={setAttendanceFilterName}
            attendanceFilterDate={attendanceFilterDate}
            setAttendanceFilterDate={setAttendanceFilterDate}
            attendanceFilterStatus={attendanceFilterStatus}
            setAttendanceFilterStatus={setAttendanceFilterStatus}
            admins={admins}
            onCreateAdmin={handleCreateAdmin}
          />
        )}

        {isMember && memberActiveView === 'dashboard' && (
          <MemberDashboard
            attendance={memberAttendance}
            member={session.user.profile}
            onScan={handleScan}
            token={idToken}
            occupancy={occupancy}
          />
        )}

        {isMember && memberActiveView === 'settings' && (
          <MemberSettings
            theme={theme}
            setTheme={setTheme}
            setFeedback={setFeedback}
            setError={setError}
            onEnableNotifications={() => registerForNotifications({ forceNative: true })}
          />
        )}
      </main>

      {/* Modal Overlay Component */}
      {modal.type && (
        <Modal 
          type={modal.type} 
          data={modal.data} 
          onClose={() => setModal({ type: null, data: null })}
          token={idToken}
          onSuccess={isAdmin ? loadAdminData : () => loadMemberData(session.user.uid)}
        />
      )}
    </div>
  );
}

function AuthPanel({
  authForm,
  authMode,
  onSubmit,
  setAuthForm,
  setAuthMode,
  loginTarget,
  rememberBiometric,
  setRememberBiometric,
  onBiometricSignIn
}) {
  const portalName = loginTarget.charAt(0).toUpperCase() + loginTarget.slice(1);
  const biometricEnabled = isBiometricEnabled();

  return (
    <section className="panel auth-panel">
      <div className="section-head">
        <h3>{authMode === "signin" ? `${portalName} Sign In` : `Create ${portalName} Account`}</h3>
        {loginTarget !== "admin" && (
          <button
            className="link-button"
            type="button"
            onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}
          >
            {authMode === "signin" ? "Need an account?" : "Already have an account?"}
          </button>
        )}
      </div>
      <form className="stack-form" onSubmit={onSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={authForm.email}
          autoComplete="username"
          onChange={(event) =>
            setAuthForm((current) => ({ ...current, email: event.target.value }))
          }
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={authForm.password}
          autoComplete={authMode === "signin" ? "current-password" : "new-password"}
          onChange={(event) =>
            setAuthForm((current) => ({ ...current, password: event.target.value }))
          }
          required
          minLength="6"
        />
        
        {authMode === "signin" && (
          <div className="list-row small no-border" style={{ border: 'none', padding: 0 }}>
             <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: '#5d6e63' }}>
                <input
                  type="checkbox"
                  checked={rememberBiometric}
                  onChange={(event) => setRememberBiometric(event.target.checked)}
                /> Remember me for biometric sign-in
             </label>
          </div>
        )}

        <button className="primary-button" type="submit">
          {authMode === "signin" ? `Sign In to ${portalName} Portal` : "Create Account"}
        </button>
        {authMode === "signin" && biometricEnabled && (
          <button className="secondary-button" type="button" onClick={onBiometricSignIn}>
            Sign In with Biometrics
          </button>
        )}
      </form>
    </section>
  );
}

function AdminDashboard({
  announcement,
  attendance,
  activeSessions,
  memberForm,
  members,
  onAnnouncementChange,
  onCreateMember,
  onDeleteMember,
  onDispatchExpiryAlerts,
  onMemberFormChange,
  onSendAnnouncement,
  selectedMemberId,
  setSelectedMemberId,
  stats,
  searchTerm,
  setSearchTerm,
  sortOrder,
  setSortOrder,
  setModal,
  plans,
  onManualCheckIn,
  activeView,
  setActiveView,
  activityLogs,
  attendanceFilterName,
  setAttendanceFilterName,
  attendanceFilterDate,
  setAttendanceFilterDate,
  attendanceFilterStatus,
  setAttendanceFilterStatus,
  admins = [],
  onCreateAdmin
}) {
  const selectedMember = members.find((member) => member.id === selectedMemberId) || members[0];
  const totalCapacity = 50; // Mock capacity
  const occupancyPercentage = Math.min(100, Math.round(((stats?.totals?.active_members || 0) / totalCapacity) * 100));
  const filteredAttendance = attendance.filter((entry) => {
    const nameMatches = attendanceFilterName
      ? (entry.member_name || "").toLowerCase().includes(attendanceFilterName.toLowerCase())
      : true;
    const dateMatches = attendanceFilterDate ? entry.date === attendanceFilterDate : true;
    const statusMatches = attendanceFilterStatus === "all" ? true : entry.status === attendanceFilterStatus;

    return nameMatches && dateMatches && statusMatches;
  });

  if (activeView === 'dashboard') {
    return (
      <div className="dashboard-grid">
        <section className="panel wide-panel">
          <div className="section-head">
            <h3>Live Occupancy</h3>
            <div className="occupancy-meter">
              <span>{occupancyPercentage}% Full</span>
              <div className="meter-bar">
                <div className="meter-fill" style={{ width: `${occupancyPercentage}%` }}></div>
              </div>
            </div>
          </div>
          <div className="table-wrapper" style={{ marginTop: "1rem" }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Entry</th>
                  <th>Exit</th>
                </tr>
              </thead>
              <tbody>
                {activeSessions.length ? (
                  activeSessions.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.member_name || "N/A"}</td>
                      <td>{formatDate(entry.check_in_time)}</td>
                      <td>{entry.check_out_time ? formatDate(entry.check_out_time) : "Inside"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" className="muted">No active members right now</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel wide-panel">
          <div className="section-head">
            <h3>Quick Tasks</h3>
          </div>
          <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', width: '100%' }}>
            <div className="metric-card clickable" onClick={() => setActiveView('members')}>
              <strong>👥 Manage Members</strong>
              <span>Directory & Profiles</span>
            </div>
            <div className="metric-card clickable" onClick={() => setActiveView('plans')}>
              <strong>📋 Billing Plans</strong>
              <span>Prices & Packages</span>
            </div>
            <div className="metric-card clickable" onClick={() => setActiveView('broadcast')}>
              <strong>📢 Send Broadcast</strong>
              <span>News & Alerts</span>
            </div>
          </div>
        </section>

        <section className="panel wide-panel">
          <div className="section-head">
            <h3>Hourly Attendance (Today)</h3>
          </div>
          <div className="chart-container">
            {stats?.analytics?.hourly_distribution ? (
              <div className="bar-chart">
                {stats.analytics.hourly_distribution.map((count, index) => (
                  <div key={index} className="bar-wrapper">
                    <div 
                      className="bar" 
                      style={{ height: `${(count / Math.max(...stats.analytics.hourly_distribution, 1)) * 100}%` }}
                      title={`${count} check-ins`}
                    ></div>
                    <span className="bar-label">{index}:00</span>
                  </div>
                ))}
              </div>
            ) : <p className="muted">No data for today</p>}
          </div>
        </section>
      </div>
    );
  }

  if (activeView === 'live') {
    return (
      <div className="dashboard-grid">
        <section className="panel wide-panel">
          <div className="section-head">
            <h3>Active Members Now</h3>
            <div className="occupancy-meter">
              <span>{activeSessions.length} Inside</span>
            </div>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {activeSessions.length ? (
                  activeSessions.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.member_name || "N/A"}</td>
                      <td>{formatDate(entry.check_in_time)}</td>
                      <td>{entry.check_out_time ? formatDate(entry.check_out_time) : "Inside"}</td>
                      <td>
                        <button className="secondary-button" onClick={() => onManualCheckIn(entry.member_id)}>
                          Quick Checkout
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="muted">No active members right now</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel wide-panel">
          <div className="section-head">
            <h3>Attendance Log</h3>
            <div className="directory-controls">
              <input
                type="text"
                placeholder="Filter by name..."
                value={attendanceFilterName}
                onChange={(event) => setAttendanceFilterName(event.target.value)}
                className="search-input"
              />
              <input
                type="date"
                value={attendanceFilterDate}
                onChange={(event) => setAttendanceFilterDate(event.target.value)}
                className="search-input"
              />
              <select
                value={attendanceFilterStatus}
                onChange={(event) => setAttendanceFilterStatus(event.target.value)}
                className="sort-select"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Date</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttendance.length ? (
                  filteredAttendance.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.member_name || "N/A"}</td>
                      <td>{formatDateOnly(entry.date)}</td>
                      <td>{formatDate(entry.check_in_time)}</td>
                      <td>{formatDate(entry.check_out_time)}</td>
                      <td>{entry.status}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="muted">No attendance records match the selected filters</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  if (activeView === 'activity') {
    return (
      <div className="dashboard-grid">
        <section className="panel wide-panel">
          <div className="section-head">
            <h3>Activity Logs</h3>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {activityLogs.length ? (
                  activityLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatDate(log.created_at)}</td>
                      <td>{String(log.action || "").replaceAll("_", " ")}</td>
                      <td>{log.actor_email || log.actor_uid || "N/A"}</td>
                      <td>{log.target_name || log.target_uid || "N/A"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="muted">No activity logs yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="dashboard-grid">
      {activeView === 'plans' && (
         <section className="panel wide-panel">
           <div className="section-head">
             <h3>Membership Plans</h3>
             <button className="primary-button" onClick={() => setModal({ type: 'create_plan', data: {} })}>
               + New Plan
             </button>
           </div>
           <div className="stack-list">
             {plans.map(p => (
               <div key={p.id} className="list-row small">
                 <span>{p.name}</span>
                 <strong>Rs. {p.price}</strong>
               </div>
             ))}
           </div>
         </section>
      )}

      {activeView === 'members' && (
        <>
          <section className="panel">
            <div className="section-head">
              <h3>Create Member</h3>
            </div>
            <form className="stack-form" onSubmit={onCreateMember}>
              <input
                placeholder="Full name"
                value={memberForm.name}
                onChange={(event) =>
                  onMemberFormChange((current) => ({ ...current, name: event.target.value }))
                }
                required
              />
              <div className="inline-form">
                <input
                  type="email"
                  placeholder="Email"
                  value={memberForm.email}
                  onChange={(event) =>
                    onMemberFormChange((current) => ({ ...current, email: event.target.value }))
                  }
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={memberForm.password}
                  onChange={(event) =>
                    onMemberFormChange((current) => ({ ...current, password: event.target.value }))
                  }
                  required
                  minLength="6"
                />
                <select
                  value={memberForm.membership_plan}
                  onChange={(event) =>
                    onMemberFormChange((current) => ({
                      ...current,
                      membership_plan: event.target.value
                    }))
                  }
                  required
                >
                  <option value="">Select Plan</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
              <button className="primary-button" type="submit">
                Create Member
              </button>
            </form>
          </section>

          <section className="panel wide-panel">
            <div className="section-head">
              <h3>Member Directory</h3>
              <div className="directory-controls">
                <input 
                  type="text" 
                  placeholder="Search..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="sort-select">
                  <option value="asc">A-Z</option>
                  <option value="desc">Z-A</option>
                </select>
              </div>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Status</th>
                    <th>Ends</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td>
                        <strong>{member.name}</strong>
                        <div className="muted">{member.email}</div>
                      </td>
                      <td>
                        <span className={`badge ${member.payment_status === 'paid' ? 'good' : 'warn'}`}>
                          {member.payment_status}
                        </span>
                      </td>
                      <td>{formatDateOnly(member.membership_end_date)}</td>
                      <td>
                        <div className="action-row">
                          <button className="quick-action-btn" onClick={() => onManualCheckIn(member.id)}>✅</button>
                          <button className="quick-action-btn" onClick={() => setModal({ type: 'extend', data: member })}>📅</button>
                          <button className="quick-action-btn" onClick={() => setModal({ type: 'notify', data: member })}>🔔</button>
                          <button className="quick-action-btn danger" onClick={() => onDeleteMember(member.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {activeView === 'admins' && (
        <>
          <section className="panel">
            <div className="section-head">
              <h3>Create Admin</h3>
            </div>
            <form className="stack-form" onSubmit={onCreateAdmin}>
              <input name="name" placeholder="Full name" required />
              <input name="email" type="email" placeholder="Email" required />
              <input name="password" type="password" placeholder="Password" required minLength="6" />
              <button className="primary-button" type="submit">Create Admin</button>
            </form>
          </section>

          <section className="panel wide-panel">
            <div className="section-head">
              <h3>Admin Directory</h3>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Admin</th>
                    <th>Email</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((admin) => (
                    <tr key={admin.id}>
                      <td><strong>{admin.name}</strong></td>
                      <td>{admin.email}</td>
                      <td>{formatDateOnly(admin.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {activeView === 'broadcast' && (
        <section className="panel wide-panel">
          <div className="section-head">
            <h3>Broadcast Center</h3>
            <button className="secondary-button" onClick={onDispatchExpiryAlerts}>⚡ Expiry Alerts</button>
          </div>
          <form className="stack-form" onSubmit={onSendAnnouncement}>
            <input
              placeholder="Broadast Title"
              value={announcement.title}
              onChange={(e) => onAnnouncementChange({ ...announcement, title: e.target.value })}
              required
            />
            <textarea
              placeholder="Message content..."
              value={announcement.body}
              onChange={(e) => onAnnouncementChange({ ...announcement, body: e.target.value })}
              required
            ></textarea>
            <button className="primary-button" type="submit">Push Notification</button>
          </form>
        </section>
      )}
    </div>
  );
}

function MemberDashboard({ attendance, member, onScan, token, occupancy }) {
  const [showScanner, setShowScanner] = useState(false);
  const [scanInProgress, setScanInProgress] = useState(false);
  const [fitnessLogs, setFitnessLogs] = useState([]);
  const [fitnessForm, setFitnessForm] = useState({ 
    weight: "", 
    height: "", 
    date: new Date().toISOString().slice(0, 10) 
  });

  useEffect(() => {
    async function loadFitness() {
      try {
        const data = await apiRequest("/members/me/fitness", { token });
        const sorted = data.logs.sort((a, b) => b.created_at.localeCompare(a.created_at));
        setFitnessLogs(sorted);
      } catch (err) {
        console.error("Failed to load fitness logs", err);
      }
    }
    loadFitness();
  }, [token]);

  async function handleFitnessSubmit(e) {
    e.preventDefault();
    const w = parseFloat(fitnessForm.weight);
    const h = parseFloat(fitnessForm.height) / 100; // to meters
    if (!w || !h) return;

    const bmi = (w / (h * h)).toFixed(1);

    try {
      const data = await apiRequest("/members/me/fitness", {
        token,
        method: "POST",
        body: { 
          weight: w, 
          height: parseFloat(fitnessForm.height), 
          bmi,
          date: fitnessForm.date 
        }
      });
      const newLogs = [data.log, ...fitnessLogs].sort((a, b) => b.created_at.localeCompare(a.created_at));
      setFitnessLogs(newLogs);
      setFitnessForm({ 
        weight: "", 
        height: "", 
        date: new Date().toISOString().slice(0, 10) 
      });
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="dashboard-grid">
      <section className="panel">
        <div className="section-head">
          <h3>Member Profile</h3>
        </div>
        <div className="profile-grid">
          <InfoItem label="Name" value={member?.name} />
          <InfoItem label="Email" value={member?.email} />
          <InfoItem label="Plan" value={member?.membership_plan} />
          <InfoItem label="Status" value={member?.payment_status} />
          <InfoItem label="Ends" value={formatDateOnly(member?.membership_end_date)} />
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h3>Track Your Progress</h3>
        </div>
        <form className="stack-form" onSubmit={handleFitnessSubmit}>
          <div className="inline-form">
            <input 
              type="date"
              value={fitnessForm.date}
              onChange={e => setFitnessForm({ ...fitnessForm, date: e.target.value })}
              required
            />
            <input 
              type="number" 
              placeholder="Weight (kg)" 
              value={fitnessForm.weight}
              onChange={e => setFitnessForm({ ...fitnessForm, weight: e.target.value })}
              required
            />
            <input 
              type="number" 
              placeholder="Height (cm)" 
              value={fitnessForm.height}
              onChange={e => setFitnessForm({ ...fitnessForm, height: e.target.value })}
              required
            />
          </div>
          <button className="primary-button" type="submit">Update & Calculate</button>
        </form>
        <div className="stack-list fitness-list">
          {fitnessLogs.slice(0, 3).map(log => (
            <div className="list-row small" key={log.id}>
              <span>{formatDateOnly(log.created_at)}</span>
              <strong>{log.weight}kg | BMI {log.bmi}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-muted)' }}>Live Occupancy</h3>
        <div style={{ fontSize: '3.5rem', fontWeight: 'bold', margin: '1rem 0', color: 'var(--message-success-text)' }}>
          {occupancy !== null ? occupancy : '...'}
        </div>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          members currently inside
        </p>
      </section>

      <button className="fab-scanner" onClick={() => setShowScanner(true)} disabled={scanInProgress}>
        📷
      </button>

      {showScanner && (
        <div className="scanner-overlay">
          <div className="scanner-overlay-header">
            <h3>Scan Wall QR</h3>
            <button className="link-button" onClick={() => setShowScanner(false)} style={{ color: '#fff' }} disabled={scanInProgress}>✕ Close</button>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
             <QRScanner
               autoStart
               onScan={async (val) => {
                 if (scanInProgress) {
                   return;
                 }

                 setScanInProgress(true);
                 setShowScanner(false);
                 try {
                   await onScan(val);
                 } finally {
                   setScanInProgress(false);
                 }
               }}
             />
          </div>
          <div style={{ padding: '2rem', textAlign: 'center', color: '#fff', background: 'rgba(0,0,0,0.5)' }}>
             <p>Point your camera at the gym's wall QR code</p>
          </div>
        </div>
      )}

      <section className="panel wide-panel">
        <div className="section-head">
          <h3>Attendance History</h3>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Check In</th>
                <th>Check Out</th>
              </tr>
            </thead>
            <tbody>
              {attendance.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDateOnly(entry.date)}</td>
                  <td>{formatDate(entry.check_in_time)}</td>
                  <td>{formatDate(entry.check_out_time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div className="info-item">
      <span>{label}</span>
      <strong>{value || "N/A"}</strong>
    </div>
  );
}

function sortMembersByExpiry(left, right) {
  return left.membership_end_date.localeCompare(right.membership_end_date);
}

export function Modal({ type, data, onClose, token, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState(type === 'extend' ? "30" : "");

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      let endpoint = '';
      let body = {};

      if (type === 'extend') {
        endpoint = `/members/${data.id}/extend`;
        body = { days: parseInt(value) };
      } else if (type === 'notify') {
        endpoint = `/notifications/send-personal`;
        body = { uid: data.id, title: "Personal Message", body: value };
      } else if (type === 'create_plan') {
        endpoint = `/plans`;
        body = { name: value, price: parseFloat(data.price || 0) };
      }

      await apiRequest(endpoint, {
        token,
        method: "POST",
        body
      });
      onSuccess();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="panel modal-content">
        <div className="section-head">
          <h3>
            {type === 'extend' && `Extend Membership: ${data.name}`}
            {type === 'notify' && `Message to ${data.name}`}
            {type === 'create_plan' && "Create Membership Plan"}
          </h3>
          <button className="link-button" onClick={onClose}>✕</button>
        </div>
        <form className="stack-form" onSubmit={handleSubmit}>
          {type === 'extend' && (
            <>
              <label>Number of days to add:</label>
              <input type="number" value={value} onChange={e => setValue(e.target.value)} required />
            </>
          )}
          {type === 'notify' && (
            <>
              <label>Message Content:</label>
              <textarea value={value} onChange={e => setValue(e.target.value)} required></textarea>
            </>
          )}
          {type === 'create_plan' && (
            <>
              <label>Plan Name:</label>
              <input type="text" value={value} onChange={e => setValue(e.target.value)} required />
              <label>Price (Rs.):</label>
              <input type="number" onChange={e => data.price = e.target.value} required />
            </>
          )}
          <div className="button-row">
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Processing..." : "Confirm Action"}
            </button>
            <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MemberSettings({ theme, setTheme, setFeedback, setError, onEnableNotifications }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(isBiometricEnabled());
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadBiometricAvailability() {
      try {
        const biometry = await BiometricAuth.checkBiometry();
        if (active) {
          setBiometricAvailable(biometry.isAvailable || biometry.deviceIsSecure);
        }
      } catch {
        if (active) {
          setBiometricAvailable(false);
        }
      }
    }

    loadBiometricAvailability();
    return () => {
      active = false;
    };
  }, []);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setFeedback("");
    try {
      await updatePassword(auth.currentUser, password);
      setFeedback("Password updated successfully.");
      setPassword("");
    } catch (err) {
      if (err.code === "auth/requires-recent-login") {
        setError("Security rule: Please sign out and sign back in to change your password.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  async function requestCameraPermission() {
    setPermissionBusy(true);
    setError("");
    setFeedback("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera is not supported on this device.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track) => track.stop());
      setFeedback("Camera access granted.");
    } catch (permissionError) {
      setError(permissionError?.message || "Camera permission denied.");
    } finally {
      setPermissionBusy(false);
    }
  }

  async function requestNotificationPermission() {
    setPermissionBusy(true);
    setError("");
    setFeedback("");
    try {
      if (Capacitor.isNativePlatform()) {
        await onEnableNotifications?.();
        setFeedback("Notification access granted.");
        return;
      }

      if (!("Notification" in window)) {
        throw new Error("Notifications are not supported on this device.");
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Notification permission was denied.");
      }

      setFeedback("Notification access granted.");
    } catch (permissionError) {
      setError(permissionError?.message || "Failed to request notification permission.");
    } finally {
      setPermissionBusy(false);
    }
  }

  async function toggleBiometric() {
    setBiometricBusy(true);
    setError("");
    setFeedback("");
    try {
      if (biometricEnabled) {
        localStorage.setItem(BIOMETRIC_PREF_KEY, "false");
        clearBiometricCredentials();
        setBiometricEnabled(false);
        setFeedback("Biometric unlock disabled.");
        return;
      }

      const biometry = await BiometricAuth.checkBiometry();
      if (!biometry.isAvailable && !biometry.deviceIsSecure) {
        throw new Error("Biometric or device credential unlock is not available.");
      }

      await BiometricAuth.authenticate({
        reason: "Enable biometric unlock for Gym App",
        androidTitle: "Enable Biometric Unlock",
        androidSubtitle: "Use biometrics or device PIN",
        androidBiometryStrength: AndroidBiometryStrength.weak,
        allowDeviceCredential: true
      });

      localStorage.setItem(BIOMETRIC_PREF_KEY, "true");
      setBiometricEnabled(true);
      setBiometricAvailable(true);
      setFeedback("Biometric unlock enabled.");
    } catch (biometricError) {
      if (
        biometricError instanceof BiometryError &&
        biometricError.code === BiometryErrorType.userCancel
      ) {
        setError("Biometric setup was cancelled.");
      } else {
        setError(biometricError?.message || "Could not enable biometric unlock.");
      }
    } finally {
      setBiometricBusy(false);
    }
  }

  return (
    <div className="dashboard-grid">
      <section className="panel wide-panel">
        <div className="section-head">
          <h3>Settings</h3>
        </div>

        <div className="stack-list" style={{ marginBottom: "2rem" }}>
          <h4>Appearance</h4>
          <div className="list-row">
            <span>Dark Mode</span>
            <button
              className={theme === "dark" ? "primary-button" : "secondary-button"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? "Enabled 🌙" : "Disabled ☀️"}
            </button>
          </div>
        </div>

        <div className="stack-list" style={{ marginBottom: "2rem" }}>
          <h4>Permissions</h4>
          <div className="list-row">
            <span>Camera Access</span>
            <button
              className="secondary-button"
              type="button"
              onClick={requestCameraPermission}
              disabled={permissionBusy}
            >
              {permissionBusy ? "Requesting..." : "Grant Camera"}
            </button>
          </div>
          <div className="list-row">
            <span>Notification Access</span>
            <button
              className="secondary-button"
              type="button"
              onClick={requestNotificationPermission}
              disabled={permissionBusy}
            >
              {permissionBusy ? "Requesting..." : "Grant Notifications"}
            </button>
          </div>
        </div>

        <div className="stack-list" style={{ marginBottom: "2rem" }}>
          <h4>Security</h4>
          <div className="list-row">
            <span>Enable Biometrics</span>
            <button
              className={biometricEnabled ? "primary-button" : "secondary-button"}
              type="button"
              onClick={toggleBiometric}
              disabled={biometricBusy || (!biometricEnabled && !biometricAvailable)}
            >
              {biometricBusy
                ? "Verifying..."
                : biometricEnabled
                ? "Enabled"
                : biometricAvailable
                ? "Enable"
                : "Unavailable"}
            </button>
          </div>
          <form className="stack-form" onSubmit={handlePasswordChange}>
            <label>Change Password</label>
            <input
              type="password"
              placeholder="New Password (min 6 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength="6"
            />
            <button
              className="primary-button"
              type="submit"
              disabled={loading || password.length < 6}
            >
              {loading ? "Updating..." : "Update Password"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

export default App;
