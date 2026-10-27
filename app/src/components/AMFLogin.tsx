import { useState, useEffect, type FormEvent } from "react";
import {
  authenticateUser,
  getAllUsers,
  getLoginLogs,
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_PASSWORD,
  type AuthUser,
  type LoginLog,
} from "../lib/auth-storage";
import { loginServerFn } from "../lib/api/auth.functions";

type Language = "en" | "kh";

const translations = {
  en: {
    hero1: "Smart Tools Management",
    hero2: "Supercharge Your Workflow",
    description:
      "Manage premium access, automated vouchers, and license keys for Gemini Pro, Canva Pro, CapCut Pro, and creative AI suites — all in one centralized hub.",
    tool1_name: "Gemini Pro",
    tool1_sub: "18-Mo AI Suite",
    tool2_name: "Canva Pro",
    tool2_sub: "Design & Brand",
    tool3_name: "CapCut Pro",
    tool3_sub: "Video Studio",
    tool4_name: "ChatGPT Plus",
    tool4_sub: "Smart Automation",
    signIn: "Sign In",
    accessPrompt: "Access your Tools Hub account",
    emailPlaceholder: "amf.express99@gmail.com",
    rememberMe: "Remember me",
    noAccount: "Don't have an account?",
    contactAdmin: "Contact your administrator",
    copyright: "© 2026 Sopha Store. All rights reserved.",
    successMsg: "Successfully signed in! Credentials saved.",
    adminModalTitle: "Contact Administrator",
    adminModalDesc:
      "For account creation, license assignments, or tool access requests, please contact your administrator:",
    dbModalTitle: "Database & Local Storage Accounts",
    dbModalDesc:
      "All login credentials (emails & passwords) are automatically stored and synced in Database/Local:",
    close: "Close",
  },
  kh: {
    hero1: "ប្រព័ន្ធគ្រប់គ្រង Smart Tools",
    hero2: "បង្កើនប្រសិទ្ធភាពការងារ",
    description:
      "គ្រប់គ្រងគណនី តាមដានអាជ្ញាប័ណ្ណ និងដំណើរការការងារជាមួយ Gemini Pro, Canva Pro, CapCut Pro និងឧបករណ៍ AI ឈានមុខគេទាំងអស់នៅកន្លែងតែមួយ។",
    tool1_name: "Gemini Pro",
    tool1_sub: "AI ឆ្លាតវៃ 18-ខែ",
    tool2_name: "Canva Pro",
    tool2_sub: "ស្ទូឌីយោ Design",
    tool3_name: "CapCut Pro",
    tool3_sub: "កាត់តវីដេអូ Pro",
    tool4_name: "ChatGPT Plus",
    tool4_sub: "ស្វ័យប្រវត្តិកម្ម AI",
    signIn: "ចូលប្រើប្រាស់",
    accessPrompt: "ចូលទៅកាន់គណនី Tools Hub របស់អ្នក",
    emailPlaceholder: "amf.express99@gmail.com",
    rememberMe: "ចងចាំគណនីខ្ញុំ",
    noAccount: "មិនទាន់មានគណនីមែនទេ?",
    contactAdmin: "ទាក់ទងអ្នកគ្រប់គ្រងប្រព័ន្ធ",
    copyright: "រក្សាសិទ្ធិគ្រប់យ៉ាង © 2026 Sopha Store",
    successMsg: "បានចូលប្រើប្រាស់ដោយជោគជ័យ និងរក្សាទុកក្នុង Database!",
    adminModalTitle: "ទាក់ទងអ្នកគ្រប់គ្រងប្រព័ន្ធ",
    adminModalDesc:
      "សម្រាប់ការស្នើសុំអាជ្ញាប័ណ្ណ Tools ថ្មី ឬសិទ្ធិប្រើប្រាស់ សូមទាក់ទងអ្នកគ្រប់គ្រងប្រព័ន្ធ៖",
    dbModalTitle: "បញ្ជីគណនីក្នុង Database & Local Storage",
    dbModalDesc:
      "រាល់ Email និង Password ដែលបាន Login ត្រូវបានរក្សាទុកក្នុង Database/Local ជាស្វ័យប្រវត្តិ៖",
    close: "បិទ",
  },
};

export function AMFLogin({ onLoginSuccess }: { onLoginSuccess?: () => void }) {
  const [lang, setLang] = useState<Language>("en");
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [email, setEmail] = useState(DEFAULT_ADMIN_EMAIL);
  const [password, setPassword] = useState(DEFAULT_ADMIN_PASSWORD);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signedInAlert, setSignedInAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorField, setErrorField] = useState<"email" | "password" | null>(null);
  const [usersList, setUsersList] = useState<AuthUser[]>([]);
  const [logsList, setLogsList] = useState<LoginLog[]>([]);

  const t = translations[lang];

  useEffect(() => {
    setUsersList(getAllUsers());
    setLogsList(getLoginLogs());
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setIsSubmitting(true);
    setErrorMessage("");
    setErrorField(null);

    try {
      // 1. Strict Authenticate with database/storage
      const authResult = authenticateUser(email, password, rememberMe);

      // If credentials do NOT match, reject login
      if (!authResult.success) {
        setIsSubmitting(false);
        setErrorMessage(authResult.message);
        setErrorField(authResult.errorType || "password");
        setUsersList(getAllUsers());
        setLogsList(getLoginLogs());
        return;
      }

      // 2. Persist to server if available
      try {
        await loginServerFn({
          data: { email, password, rememberMe },
        });
      } catch (serverErr) {
        console.warn("Backend server function sync note:", serverErr);
      }

      setUsersList(getAllUsers());
      setLogsList(getLoginLogs());

      setIsSubmitting(false);
      setAlertMessage(authResult.message || t.successMsg);
      setSignedInAlert(true);

      setTimeout(() => {
        setSignedInAlert(false);
        if (onLoginSuccess) {
          onLoginSuccess();
        }
      }, 900);
    } catch (err) {
      console.error("Login submission error:", err);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-x-hidden font-sans select-none">
      {/* 
        BACKGROUND IMAGE LAYER
      */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <img
          src="/background.png"
          alt="AMF Express Background"
          className="w-full h-full object-cover object-bottom sm:object-center"
        />

        {/* Theme Overlay */}
        {isDarkMode ? (
          <div className="absolute inset-0 bg-[#090d16]/75 backdrop-blur-[1px] transition-colors duration-300" />
        ) : (
          <div className="absolute inset-0 bg-white/[0.04] transition-colors duration-300" />
        )}
      </div>

      {/* TOP HEADER */}
      <header className="relative z-10 w-full px-5 sm:px-10 lg:px-16 pt-5 sm:pt-7 flex items-center justify-end">
        {/* Right: Language selector & Theme toggle */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Language Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setLangMenuOpen(!langMenuOpen)}
              className={`backdrop-blur-md rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-sm flex items-center gap-1.5 transition cursor-pointer active:scale-95 ${
                isDarkMode
                  ? "bg-slate-900/80 border border-slate-700 text-slate-200 hover:bg-slate-800"
                  : "bg-white/90 border border-slate-200/90 text-slate-700 hover:bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
              }`}
              aria-label="Select language"
            >
              <svg
                className="w-3.5 h-3.5 opacity-80"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
              <span>{lang.toUpperCase()}</span>
              <svg
                className={`w-3 h-3 opacity-60 transition-transform ${langMenuOpen ? "rotate-180" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {langMenuOpen && (
              <div
                className={`absolute right-0 mt-1.5 w-32 rounded-xl shadow-xl py-1 z-30 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md border ${
                  isDarkMode
                    ? "bg-slate-900/95 border-slate-700 text-slate-200"
                    : "bg-white/95 border-slate-100 text-slate-700 shadow-[0_10px_25px_rgba(0,0,0,0.1)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setLang("en");
                    setLangMenuOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between cursor-pointer transition ${
                    isDarkMode ? "hover:bg-slate-800" : "hover:bg-slate-50"
                  } ${lang === "en" ? "font-bold text-blue-600" : ""}`}
                >
                  <span>English (EN)</span>
                  {lang === "en" && <span className="text-blue-600">✓</span>}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLang("kh");
                    setLangMenuOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between cursor-pointer transition ${
                    isDarkMode ? "hover:bg-slate-800" : "hover:bg-slate-50"
                  } ${lang === "kh" ? "font-bold text-blue-600" : ""}`}
                >
                  <span>ភាសាខ្មែរ (KH)</span>
                  {lang === "kh" && <span className="text-blue-600">✓</span>}
                </button>
              </div>
            )}
          </div>

          {/* Light / Dark Mode Toggle */}
          <button
            type="button"
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center shadow-sm transition cursor-pointer active:scale-95 ${
              isDarkMode
                ? "bg-slate-900/80 border border-slate-700 text-amber-400 hover:bg-slate-800"
                : "bg-white/90 border border-slate-200/90 text-slate-700 hover:bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
            }`}
            aria-label="Toggle theme"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? (
              <svg
                className="w-4 h-4 text-amber-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2" />
                <path d="M12 20v2" />
                <path d="m4.93 4.93 1.41 1.41" />
                <path d="m17.66 17.66 1.41 1.41" />
                <path d="M2 12h2" />
                <path d="M20 12h2" />
                <path d="m6.34 17.66-1.41 1.41" />
                <path d="m19.07 4.93-1.41 1.41" />
              </svg>
            ) : (
              <svg
                className="w-4 h-4 text-slate-700"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-10 lg:px-16 py-6 sm:py-8 lg:py-10 my-auto flex flex-col lg:flex-row items-center justify-between gap-10 lg:gap-14">
        {/* LEFT COLUMN: HERO HEADLINE & 3D SYSTEM TOOLS MANAGEMENT CARDS */}
        <div className="w-full lg:max-w-[55%] flex flex-col items-start text-left">
          {/* Main Hero Headline */}
          <h2
            className={`text-3xl sm:text-4xl md:text-5xl lg:text-[48px] font-extrabold tracking-tight leading-[1.12] transition-colors ${
              isDarkMode ? "text-white" : "text-[#0f284e]"
            }`}
          >
            {t.hero1}
          </h2>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-[48px] font-extrabold tracking-tight text-[#ba1818] leading-[1.12] mt-1 sm:mt-2">
            {t.hero2}
          </h2>

          {/* Accent Bar */}
          <div className="flex items-center gap-0.5 mt-4 sm:mt-5 mb-4">
            <div
              className={`h-1.5 w-10 rounded-l-full ${
                isDarkMode ? "bg-blue-500" : "bg-[#0f284e]"
              }`}
            />
            <div className="h-1.5 w-8 bg-[#ba1818] rounded-r-full" />
          </div>

          {/* Subtext description */}
          <p
            className={`font-normal text-sm sm:text-base max-w-lg leading-relaxed transition-colors ${
              isDarkMode ? "text-slate-300" : "text-slate-700 font-medium"
            }`}
          >
            {t.description}
          </p>

          {/* 4 3D SYSTEM TOOLS MANAGEMENT CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-7 sm:mt-9 w-full max-w-xl">
            {/* 1. GEMINI PRO (3D AI STAR) */}
            <div
              className={`group backdrop-blur-xl rounded-2xl p-3 sm:p-4 transition-all duration-300 flex flex-col items-center text-center cursor-pointer hover:-translate-y-1.5 ${
                isDarkMode
                  ? "bg-slate-900/80 hover:bg-slate-900/95 border border-slate-700/80 shadow-[0_8px_25px_rgba(0,0,0,0.5)] text-slate-100"
                  : "bg-white/90 hover:bg-white border border-white/90 shadow-[0_8px_25px_rgba(15,36,74,0.06)] hover:shadow-[0_16px_35px_rgba(15,36,74,0.12)] text-slate-900"
              }`}
            >
              {/* 3D Icon Container with Glow */}
              <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center mb-2 transition-transform duration-300 group-hover:scale-110">
                <svg className="w-11 h-11" viewBox="0 0 64 64" fill="none">
                  <defs>
                    <radialGradient id="gemini3dGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.5"/>
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0"/>
                    </radialGradient>
                    <linearGradient id="geminiFacetTop" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#93c5fd"/>
                      <stop offset="50%" stopColor="#3b82f6"/>
                      <stop offset="100%" stopColor="#1d4ed8"/>
                    </linearGradient>
                    <linearGradient id="geminiFacetRight" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#c084fc"/>
                      <stop offset="100%" stopColor="#6366f1"/>
                    </linearGradient>
                    <linearGradient id="geminiFacetBottom" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#1e40af"/>
                      <stop offset="100%" stopColor="#0f172a"/>
                    </linearGradient>
                    <linearGradient id="geminiFacetLeft" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#38bdf8"/>
                      <stop offset="100%" stopColor="#2563eb"/>
                    </linearGradient>
                    <filter id="shadowGemini" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#1e3a8a" floodOpacity="0.35"/>
                    </filter>
                  </defs>
                  <circle cx="32" cy="32" r="30" fill="url(#gemini3dGlow)"/>
                  <g filter="url(#shadowGemini)">
                    <path d="M32 7 C32 20 20 32 7 32 C20 32 32 32 32 32 Z" fill="url(#geminiFacetLeft)"/>
                    <path d="M32 7 C32 20 44 32 57 32 C44 32 32 32 32 32 Z" fill="url(#geminiFacetTop)"/>
                    <path d="M57 32 C44 32 32 44 32 57 C32 44 32 32 32 32 Z" fill="url(#geminiFacetRight)"/>
                    <path d="M7 32 C20 32 32 44 32 57 C32 44 32 32 32 32 Z" fill="url(#geminiFacetBottom)"/>
                    {/* 3D Specular Highlight Diamond */}
                    <path d="M32 23 L37 32 L32 41 L27 32 Z" fill="#ffffff" opacity="0.9"/>
                  </g>
                </svg>
              </div>
              <span className="text-xs sm:text-[13px] font-extrabold tracking-tight leading-tight">
                {t.tool1_name}
              </span>
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wider mt-0.5">
                {t.tool1_sub}
              </span>
            </div>

            {/* 2. CANVA PRO (3D SPHERE & GOLDEN CROWN) */}
            <div
              className={`group backdrop-blur-xl rounded-2xl p-3 sm:p-4 transition-all duration-300 flex flex-col items-center text-center cursor-pointer hover:-translate-y-1.5 ${
                isDarkMode
                  ? "bg-slate-900/80 hover:bg-slate-900/95 border border-slate-700/80 shadow-[0_8px_25px_rgba(0,0,0,0.5)] text-slate-100"
                  : "bg-white/90 hover:bg-white border border-white/90 shadow-[0_8px_25px_rgba(15,36,74,0.06)] hover:shadow-[0_16px_35px_rgba(15,36,74,0.12)] text-slate-900"
              }`}
            >
              {/* 3D Icon Container with Glow */}
              <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center mb-2 transition-transform duration-300 group-hover:scale-110">
                <svg className="w-11 h-11" viewBox="0 0 64 64" fill="none">
                  <defs>
                    <radialGradient id="canvaGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#00c4cc" stopOpacity="0.4"/>
                      <stop offset="100%" stopColor="#7d2ae8" stopOpacity="0"/>
                    </radialGradient>
                    <linearGradient id="canvaSphereGrad" x1="15%" y1="15%" x2="85%" y2="85%">
                      <stop offset="0%" stopColor="#00c4cc"/>
                      <stop offset="45%" stopColor="#7d2ae8"/>
                      <stop offset="100%" stopColor="#e11d48"/>
                    </linearGradient>
                    <linearGradient id="crown3dGold" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#fef08a"/>
                      <stop offset="50%" stopColor="#eab308"/>
                      <stop offset="100%" stopColor="#ca8a04"/>
                    </linearGradient>
                    <filter id="shadowCanva" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="4" stdDeviation="3.5" floodColor="#7d2ae8" floodOpacity="0.35"/>
                    </filter>
                  </defs>
                  <circle cx="32" cy="32" r="30" fill="url(#canvaGlow)"/>
                  {/* 3D Glossy Sphere */}
                  <circle cx="32" cy="34" r="21" fill="url(#canvaSphereGrad)" filter="url(#shadowCanva)"/>
                  {/* Specular 3D Highlight curve */}
                  <path d="M21 23 C26 17 38 17 43 23 C38 20 26 20 21 23 Z" fill="#ffffff" opacity="0.65"/>
                  {/* 3D Golden Crown on top */}
                  <g transform="translate(0, -2)">
                    <path
                      d="M21 28 L19 18 L26 23 L32 15 L38 23 L45 18 L43 28 Z"
                      fill="url(#crown3dGold)"
                      stroke="#a16207"
                      strokeWidth="0.8"
                    />
                    <circle cx="19" cy="17" r="1.5" fill="#ffffff"/>
                    <circle cx="32" cy="14" r="2" fill="#ffffff"/>
                    <circle cx="45" cy="17" r="1.5" fill="#ffffff"/>
                    <rect x="20" y="27" width="24" height="2.5" rx="1.2" fill="#a16207"/>
                  </g>
                </svg>
              </div>
              <span className="text-xs sm:text-[13px] font-extrabold tracking-tight leading-tight">
                {t.tool2_name}
              </span>
              <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold uppercase tracking-wider mt-0.5">
                {t.tool2_sub}
              </span>
            </div>

            {/* 3. CAPCUT PRO (3D CLAPPER & NEON CUT) */}
            <div
              className={`group backdrop-blur-xl rounded-2xl p-3 sm:p-4 transition-all duration-300 flex flex-col items-center text-center cursor-pointer hover:-translate-y-1.5 ${
                isDarkMode
                  ? "bg-slate-900/80 hover:bg-slate-900/95 border border-slate-700/80 shadow-[0_8px_25px_rgba(0,0,0,0.5)] text-slate-100"
                  : "bg-white/90 hover:bg-white border border-white/90 shadow-[0_8px_25px_rgba(15,36,74,0.06)] hover:shadow-[0_16px_35px_rgba(15,36,74,0.12)] text-slate-900"
              }`}
            >
              {/* 3D Icon Container with Glow */}
              <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center mb-2 transition-transform duration-300 group-hover:scale-110">
                <svg className="w-11 h-11" viewBox="0 0 64 64" fill="none">
                  <defs>
                    <radialGradient id="capcutGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4"/>
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity="0"/>
                    </radialGradient>
                    <linearGradient id="capcutBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#1e293b"/>
                      <stop offset="100%" stopColor="#090d16"/>
                    </linearGradient>
                    <linearGradient id="capcutNeonCyan" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#22d3ee"/>
                      <stop offset="100%" stopColor="#06b6d4"/>
                    </linearGradient>
                    <linearGradient id="capcutNeonRed" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#fb7185"/>
                      <stop offset="100%" stopColor="#e11d48"/>
                    </linearGradient>
                    <filter id="shadowCapcut" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#090d16" floodOpacity="0.45"/>
                    </filter>
                  </defs>
                  <circle cx="32" cy="32" r="30" fill="url(#capcutGlow)"/>
                  {/* 3D Clapper Base Box */}
                  <rect x="12" y="16" width="40" height="36" rx="8" fill="url(#capcutBodyGrad)" filter="url(#shadowCapcut)" stroke="#334155" strokeWidth="1"/>
                  {/* Clapper Top Divider */}
                  <path d="M12 25 L52 25" stroke="#475569" strokeWidth="1.5"/>
                  {/* Angled Neon Stripes */}
                  <path d="M16 16 L22 25" stroke="#ffffff" strokeWidth="3" strokeLinecap="round"/>
                  <path d="M26 16 L32 25" stroke="url(#capcutNeonCyan)" strokeWidth="3" strokeLinecap="round"/>
                  <path d="M36 16 L42 25" stroke="url(#capcutNeonRed)" strokeWidth="3" strokeLinecap="round"/>
                  <path d="M46 16 L49 25" stroke="#ffffff" strokeWidth="3" strokeLinecap="round"/>
                  {/* 3D Center Play Button */}
                  <polygon points="27,31 27,45 40,38" fill="url(#capcutNeonCyan)"/>
                  <polygon points="27,38 27,45 40,38" fill="#0891b2" opacity="0.6"/>
                  <line x1="27" y1="31" x2="40" y2="38" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.9"/>
                </svg>
              </div>
              <span className="text-xs sm:text-[13px] font-extrabold tracking-tight leading-tight">
                {t.tool3_name}
              </span>
              <span className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold uppercase tracking-wider mt-0.5">
                {t.tool3_sub}
              </span>
            </div>

            {/* 4. CHATGPT PLUS (3D EMERALD AI VORTEX) */}
            <div
              className={`group backdrop-blur-xl rounded-2xl p-3 sm:p-4 transition-all duration-300 flex flex-col items-center text-center cursor-pointer hover:-translate-y-1.5 ${
                isDarkMode
                  ? "bg-slate-900/80 hover:bg-slate-900/95 border border-slate-700/80 shadow-[0_8px_25px_rgba(0,0,0,0.5)] text-slate-100"
                  : "bg-white/90 hover:bg-white border border-white/90 shadow-[0_8px_25px_rgba(15,36,74,0.06)] hover:shadow-[0_16px_35px_rgba(15,36,74,0.12)] text-slate-900"
              }`}
            >
              {/* 3D Icon Container with Glow */}
              <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center mb-2 transition-transform duration-300 group-hover:scale-110">
                <svg className="w-11 h-11" viewBox="0 0 64 64" fill="none">
                  <defs>
                    <radialGradient id="gpt3dGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.45"/>
                      <stop offset="100%" stopColor="#047857" stopOpacity="0"/>
                    </radialGradient>
                    <linearGradient id="gptEmeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#34d399"/>
                      <stop offset="50%" stopColor="#10b981"/>
                      <stop offset="100%" stopColor="#047857"/>
                    </linearGradient>
                    <filter id="shadowGpt" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="4" stdDeviation="3.5" floodColor="#047857" floodOpacity="0.4"/>
                    </filter>
                  </defs>
                  <circle cx="32" cy="32" r="30" fill="url(#gpt3dGlow)"/>
                  {/* 3D Rounded Hexagon Badge */}
                  <path
                    d="M32 12 L48 21 L48 41 L32 50 L16 41 L16 21 Z"
                    fill="url(#gptEmeraldGrad)"
                    filter="url(#shadowGpt)"
                    stroke="#a7f3d0"
                    strokeWidth="1.2"
                  />
                  {/* 3D Core Spiral Motif */}
                  <path
                    d="M32 20 C36 20 40 24 40 28 C40 33 34 35 32 39"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    opacity="0.9"
                  />
                  <circle cx="32" cy="31" r="3.5" fill="#fef08a"/>
                  {/* 3D Bevel Top Specular Shine */}
                  <path d="M20 22 L32 15 L44 22" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.8"/>
                </svg>
              </div>
              <span className="text-xs sm:text-[13px] font-extrabold tracking-tight leading-tight">
                {t.tool4_name}
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider mt-0.5">
                {t.tool4_sub}
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: FLOATING SIGN IN CARD */}
        <div className="w-full lg:max-w-[410px] xl:max-w-[430px] flex justify-center lg:justify-end">
          <div
            className={`relative w-full rounded-[28px] p-7 sm:p-9 overflow-hidden transition-all duration-300 ${
              isDarkMode
                ? "bg-slate-900/92 backdrop-blur-xl border border-slate-700/80 shadow-[0_25px_60px_rgba(0,0,0,0.5)] text-white"
                : "bg-white/95 backdrop-blur-2xl border border-white/95 shadow-[0_20px_60px_rgba(15,36,74,0.16)] text-slate-900"
            }`}
          >
            {/* Top decorative gradient strip */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#ba1818] via-[#e11d48] to-[#1565c0]" />

            {/* Avatar Multi-User Icon Header */}
            <div
              className={`w-13 h-13 rounded-2xl flex items-center justify-center mb-4 p-2.5 shadow-sm ${
                isDarkMode
                  ? "bg-slate-800 border border-slate-700"
                  : "bg-gradient-to-b from-slate-50 to-slate-100 border border-slate-200/80"
              }`}
            >
              <svg className="w-8 h-8" viewBox="0 0 36 36" fill="none">
                <circle cx="18" cy="13" r="5" fill="#1565c0" />
                <path
                  d="M10 27c0-4.418 3.582-8 8-8s8 3.582 8 8"
                  stroke="#1565c0"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
                <circle cx="10" cy="16" r="3.5" fill="#dc2626" />
                <path
                  d="M4 27c0-3.314 2.686-6 6-6"
                  stroke="#dc2626"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle cx="26" cy="16" r="3.5" fill="#0284c7" />
                <path
                  d="M26 21c3.314 0 6 2.686 6 6"
                  stroke="#0284c7"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            {/* Title & Subtitle */}
            <h3
              className={`text-2xl font-bold tracking-tight ${
                isDarkMode ? "text-white" : "text-slate-900"
              }`}
            >
              {t.signIn}
            </h3>
            <p
              className={`text-xs sm:text-sm mt-0.5 mb-5 ${
                isDarkMode ? "text-slate-400" : "text-slate-500 font-medium"
              }`}
            >
              {t.accessPrompt}
            </p>

            {/* Success Alert Message */}
            {signedInAlert && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                <svg
                  className="w-4 h-4 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>{alertMessage || t.successMsg}</span>
              </div>
            )}

            {/* Error Alert Message (Strict Verification) */}
            {errorMessage && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in">
                <svg
                  className="w-4 h-4 text-rose-600 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email Field */}
              <div
                style={{ backgroundColor: isDarkMode ? "#1e293b" : "#edf2f8" }}
                className={`relative flex items-center rounded-2xl transition-all px-4 py-3.5 border ${
                  errorField === "email"
                    ? "border-rose-500 ring-2 ring-rose-200/60"
                    : isDarkMode
                      ? "border-slate-700 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20"
                      : "border-slate-200/90 focus-within:bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100"
                }`}
              >
                <svg
                  className={`w-5 h-5 shrink-0 ${
                    errorField === "email"
                      ? "text-rose-500"
                      : isDarkMode
                        ? "text-slate-400"
                        : "text-slate-500"
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMessage) {
                      setErrorMessage("");
                      setErrorField(null);
                    }
                  }}
                  placeholder={t.emailPlaceholder}
                  className={`w-full bg-transparent border-none outline-none text-sm pl-3 font-medium ${
                    isDarkMode
                      ? "text-white placeholder-slate-500"
                      : "text-slate-900 placeholder-slate-400"
                  }`}
                />
              </div>

              {/* Password Field */}
              <div
                style={{ backgroundColor: isDarkMode ? "#1e293b" : "#edf2f8" }}
                className={`relative flex items-center rounded-2xl transition-all px-4 py-3.5 border ${
                  errorField === "password"
                    ? "border-rose-500 ring-2 ring-rose-200/60"
                    : isDarkMode
                      ? "border-slate-700 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20"
                      : "border-slate-200/90 focus-within:bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100"
                }`}
              >
                <svg
                  className={`w-5 h-5 shrink-0 ${
                    errorField === "password"
                      ? "text-rose-500"
                      : isDarkMode
                        ? "text-slate-400"
                        : "text-slate-500"
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) {
                      setErrorMessage("");
                      setErrorField(null);
                    }
                  }}
                  className={`w-full bg-transparent border-none outline-none text-sm pl-3 font-medium tracking-wide ${
                    isDarkMode
                      ? "text-white placeholder-slate-500"
                      : "text-slate-900 placeholder-slate-400"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`focus:outline-none p-1 cursor-pointer transition ${
                    isDarkMode
                      ? "text-slate-400 hover:text-slate-200"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                      <line x1="2" y1="2" x2="22" y2="22" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Remember Me Checkbox */}
              <div className="flex items-center pt-0.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div
                    onClick={() => setRememberMe(!rememberMe)}
                    style={{
                      backgroundColor: rememberMe
                        ? "#0d47a1"
                        : isDarkMode
                          ? "#1e293b"
                          : "#ffffff",
                    }}
                    className={`w-4 h-4 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                      rememberMe
                        ? "text-white"
                        : isDarkMode
                          ? "border border-slate-600"
                          : "border border-slate-300"
                    }`}
                  >
                    {rememberMe && (
                      <svg
                        className="w-3 h-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3.5"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span
                    className={`text-xs sm:text-sm font-medium ${
                      isDarkMode ? "text-slate-300" : "text-slate-700"
                    }`}
                  >
                    {t.rememberMe}
                  </span>
                </label>
              </div>

              {/* Primary Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  backgroundColor: "#0d47a1",
                  color: "#ffffff",
                }}
                className="w-full mt-3 py-3.5 px-6 rounded-2xl bg-[#0d47a1] hover:bg-[#0b3c82] active:scale-[0.99] text-white font-bold text-sm shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2 transition duration-200 cursor-pointer disabled:opacity-70"
              >
                {isSubmitting ? (
                  <span className="inline-block animate-spin mr-2">⟳</span>
                ) : null}
                <span className="text-white font-bold text-sm tracking-wide">
                  {t.signIn}
                </span>
                <svg
                  className="w-4 h-4 text-white shrink-0 transition-transform group-hover:translate-x-1"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Database / Local Accounts Viewer Modal */}
      {dbModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-100 text-left max-h-[85vh] flex flex-col text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <h4 className="text-base font-bold text-slate-900">
                  {t.dbModalTitle}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setDbModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 mt-3 leading-relaxed">
              {t.dbModalDesc}
            </p>

            {/* Accounts List */}
            <div className="mt-4 overflow-y-auto flex-1 space-y-2 pr-1">
              <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Saved User Accounts ({usersList.length})
              </h5>
              {usersList.map((u) => (
                <div
                  key={u.id}
                  className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col gap-1 text-xs hover:bg-blue-50/40 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{u.email}</span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      {u.role}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500 text-[11px]">
                    <span>
                      Password: <strong className="text-slate-800 font-mono">{u.password}</strong>
                    </span>
                    <span>
                      {u.lastLogin
                        ? `Last: ${new Date(u.lastLogin).toLocaleTimeString()}`
                        : "Never logged in"}
                    </span>
                  </div>
                </div>
              ))}

              {/* Recent Login Logs */}
              {logsList.length > 0 && (
                <div className="pt-3">
                  <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Recent Login Audit Logs ({logsList.length})
                  </h5>
                  <div className="space-y-1.5">
                    {logsList.slice(0, 5).map((l) => (
                      <div
                        key={l.id}
                        className="px-3 py-2 rounded-xl bg-slate-100/70 text-[11px] flex items-center justify-between text-slate-600"
                      >
                        <span className="font-medium text-slate-800">{l.email}</span>
                        <span className="text-emerald-600 font-semibold text-[10px]">
                          ✓ {l.status} · {new Date(l.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setDbModalOpen(false)}
              className="mt-5 w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer transition"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}

      {/* Contact Admin Modal */}
      {adminModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-100 text-left text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="text-base font-bold text-slate-900">
                {t.adminModalTitle}
              </h4>
              <button
                type="button"
                onClick={() => setAdminModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-4 leading-relaxed">
              {t.adminModalDesc}
            </p>
            <div className="mt-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2 text-xs text-slate-700">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">Email:</span>
                <span className="text-blue-700 font-medium">hr@amf-express.com</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">Support Desk:</span>
                <span>+855 (0) 23 888 999</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">Office Hours:</span>
                <span>Mon - Sat (8:00 AM - 5:30 PM)</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAdminModalOpen(false)}
              className="mt-6 w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer transition"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
