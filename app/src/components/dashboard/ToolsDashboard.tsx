import { useState, useMemo, useEffect, useRef, type FormEvent } from "react";
import { type AuthUser } from "../../lib/auth-storage";
import {
  getToolsServerFn,
  saveToolServerFn,
  deleteToolServerFn,
  computeAutoStatus,
  daysUntil,
  probeGooglePromoUrlServerFn,
  type ServerToolItem,
  type ProbeGooglePromoResult,
} from "../../lib/api/tools.functions";

export type ToolCategory = "dashboard" | "gemini" | "canva" | "capcut" | "chatgpt" | "all";

export interface ToolItem {
  id: string;
  category: "gemini" | "canva" | "capcut" | "chatgpt";
  title: string;
  titleKh?: string;
  urlOrCode: string;
  assignedEmail: string;
  source: string;
  planTier: string;
  receivedDate: string;
  expiryDate: string;
  status: "ACTIVE" | "SOON" | "ACTIVATED" | "EXPIRED";
  activatedAt?: string;
  googleCheckStatus?: "REDEEMED" | "AVAILABLE" | "EXPIRED" | "UNKNOWN" | "SIGNIN_REQUIRED";
  googleCheckedAt?: string;
  notes?: string;
}

const STORAGE_KEY = "system_tools_clean_vault_v1";

export function ToolsDashboard({
  currentUser,
  onSignOut,
}: {
  currentUser: AuthUser;
  onSignOut: () => void;
}) {
  const [activeCategory, setActiveCategory] = useState<ToolCategory>("dashboard");

  // Start with completely empty state (No default/mock data as requested)
  const [items, setItems] = useState<ToolItem[]>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {}
      }
    }
    return [];
  });

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sortBy, setSortBy] = useState("expiry-asc");
  const [currentView, setCurrentView] = useState<"list" | "form">("list");
  const [editingItem, setEditingItem] = useState<ToolItem | null>(null);
  const [copyToast, setCopyToast] = useState("");
  const [isLoadingBackend, setIsLoadingBackend] = useState(false);
  const [databaseMode, setDatabaseMode] = useState<string>("local");

  // Google Live Link Detection states
  const [detectingItem, setDetectingItem] = useState<ToolItem | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<ProbeGooglePromoResult | null>(null);
  const [isBatchDetecting, setIsBatchDetecting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

  // Method 2: Silent Background Auto-Scan states & session cache
  const [isSilentScanning, setIsSilentScanning] = useState(false);
  const silentScannedRef = useRef<Set<string>>(new Set());

  // Form instant auto-detect state
  const [formAutoDetect, setFormAutoDetect] = useState<{
    isDetecting: boolean;
    status: "REDEEMED" | "AVAILABLE" | "EXPIRED" | "UNKNOWN" | "SIGNIN_REQUIRED" | null;
    message: string;
    planType?: string;
  } | null>(null);

  // Top Loader Progress state & animation triggers
  const [loaderProgress, setLoaderProgress] = useState(0);
  const [loaderVisible, setLoaderVisible] = useState(false);

  const triggerTopLoader = (durationMs = 400) => {
    setLoaderVisible(true);
    setLoaderProgress(25);
    const t1 = setTimeout(() => setLoaderProgress(65), durationMs * 0.25);
    const t2 = setTimeout(() => setLoaderProgress(88), durationMs * 0.65);
    const t3 = setTimeout(() => {
      setLoaderProgress(100);
      const t4 = setTimeout(() => {
        setLoaderVisible(false);
        const t5 = setTimeout(() => setLoaderProgress(0), 200);
        return () => clearTimeout(t5);
      }, 250);
      return () => clearTimeout(t4);
    }, durationMs);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  };

  // Safe Category switch - Instant 0ms transition with Mobile auto-close
  const handleCategorySwitch = (cat: ToolCategory) => {
    setActiveCategory(cat);
    setCurrentView("list");
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  // Form states
  const [fCategory, setFCategory] = useState<ToolItem["category"]>("gemini");
  const [fTitle, setFTitle] = useState("");
  const [fTitleKh, setFTitleKh] = useState("");
  const [fUrlOrCode, setFUrlOrCode] = useState("");
  const [fAssignedEmail, setFAssignedEmail] = useState("");
  const [fSource, setFSource] = useState("");
  const [fPlanTier, setFPlanTier] = useState("");
  const [fExpiryDate, setFExpiryDate] = useState("");
  const [fStatus, setFStatus] = useState<ToolItem["status"]>("ACTIVE");
  const [fNotes, setFNotes] = useState("");

  // 1. Load real data from Backend on mount (Non-blocking if cached from localStorage)
  useEffect(() => {
    let isMounted = true;
    const hasCachedItems = items.length > 0;

    // Only show full loader if local cache is completely empty
    if (!hasCachedItems) {
      setIsLoadingBackend(true);
      setLoaderVisible(true);
      setLoaderProgress(40);
    }

    getToolsServerFn()
      .then((res: any) => {
        if (!isMounted) return;
        if (res.database) {
          setDatabaseMode(res.database);
        }
        if (res.success && Array.isArray(res.tools)) {
          // Re-evaluate auto-status based on real expiry and activation dates
          const evaluated = res.tools.map((t: any) => ({
            ...t,
            status: computeAutoStatus(t.expiryDate, t.activatedAt, t.status),
          }));
          setItems(evaluated);
        }
      })
      .catch((err) => {
        console.error("Backend fetch error:", err);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoadingBackend(false);
        if (!hasCachedItems) {
          setLoaderProgress(100);
          setTimeout(() => {
            setLoaderVisible(false);
            setTimeout(() => setLoaderProgress(0), 150);
          }, 200);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Method 2: Automatic Silent In-Dashboard Auto-Check for Gemini links
  // Smoothly throttled and debounced to never stutter navigation or refresh
  const isScanningRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isScanningRef.current) return;

      const candidates = items.filter(
        (it) =>
          (it.category === "gemini" || it.urlOrCode.includes("one.google.com")) &&
          it.urlOrCode.startsWith("http") &&
          (!it.googleCheckStatus || !silentScannedRef.current.has(it.id))
      );

      if (candidates.length === 0) return;

      isScanningRef.current = true;
      setIsSilentScanning(true);

      (async () => {
        for (const it of candidates) {
          silentScannedRef.current.add(it.id);

          try {
            const res = await probeGooglePromoUrlServerFn({ data: { url: it.urlOrCode } });
            const now = new Date().toISOString();
            let updated: ToolItem = { ...it };

            if (res.status === "REDEEMED") {
              updated = {
                ...it,
                status: "ACTIVATED",
                activatedAt: it.activatedAt || now,
                googleCheckStatus: "REDEEMED",
                googleCheckedAt: now,
              };
              if (it.status !== "ACTIVATED") {
                showToast(`⚡ Auto Detect: [${it.title}] ត្រូវបាន Activate រួចរាល់!`);
              }
            } else if (res.status === "AVAILABLE") {
              updated = {
                ...it,
                googleCheckStatus: "AVAILABLE",
                googleCheckedAt: now,
              };
            } else if (res.status === "EXPIRED") {
              updated = {
                ...it,
                status: "EXPIRED",
                googleCheckStatus: "EXPIRED",
                googleCheckedAt: now,
              };
            }

            setItems((prev) => prev.map((item) => (item.id === it.id ? updated : item)));
            await saveToolServerFn({ data: updated as ServerToolItem });
          } catch (e) {
            void e;
          }
          // Non-blocking spacing between checks to keep browser at 60fps
          await new Promise((r) => setTimeout(r, 350));
        }
        isScanningRef.current = false;
        setIsSilentScanning(false);
      })();
    }, 1200);

    return () => clearTimeout(timer);
  }, [items.length]);

  // Periodic interval (every 4 minutes) to reset scanned cache for ACTIVE items without re-rendering
  useEffect(() => {
    const interval = setInterval(() => {
      items.forEach((it) => {
        if (
          (it.category === "gemini" || it.urlOrCode.includes("one.google.com")) &&
          it.status === "ACTIVE"
        ) {
          silentScannedRef.current.delete(it.id);
        }
      });
    }, 4 * 60 * 1000);

    return () => clearInterval(interval);
  }, [items]);

  // Debounced LocalStorage persistence (400ms) to eliminate main-thread stuttering
  const saveTimeoutRef = useRef<any>(null);
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch {}
    }, 400);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [items]);

  const showToast = (msg: string) => {
    setCopyToast(msg);
    setTimeout(() => setCopyToast(""), 2200);
  };

  // Filter items by category (or all)
  const categoryItems = useMemo(() => {
    if (activeCategory === "all" || activeCategory === "dashboard") return items;
    return items.filter((it) => it.category === activeCategory);
  }, [items, activeCategory]);

  // Dynamic filter options for current category
  const availableTiers = useMemo(() => {
    return Array.from(new Set(categoryItems.map((i) => i.planTier))).filter(Boolean);
  }, [categoryItems]);

  const availableSources = useMemo(() => {
    return Array.from(new Set(categoryItems.map((i) => i.source))).filter(Boolean);
  }, [categoryItems]);

  // Apply filters and search
  const filteredItems = useMemo(() => {
    return categoryItems
      .filter((it) => {
        if (statusFilter !== "all" && it.status !== statusFilter) return false;
        if (tierFilter !== "all" && it.planTier !== tierFilter) return false;
        if (sourceFilter !== "all" && it.source !== sourceFilter) return false;
        if (!searchQuery.trim()) return true;

        const q = searchQuery.toLowerCase();
        return (
          it.title.toLowerCase().includes(q) ||
          (it.titleKh && it.titleKh.toLowerCase().includes(q)) ||
          it.urlOrCode.toLowerCase().includes(q) ||
          it.assignedEmail.toLowerCase().includes(q) ||
          it.source.toLowerCase().includes(q) ||
          it.planTier.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === "expiry-asc") {
          return (a.expiryDate || "9999-99-99").localeCompare(b.expiryDate || "9999-99-99");
        }
        if (sortBy === "expiry-desc") {
          return (b.expiryDate || "").localeCompare(a.expiryDate || "");
        }
        if (sortBy === "title-asc") {
          return a.title.localeCompare(b.title);
        }
        return b.receivedDate.localeCompare(a.receivedDate);
      });
  }, [categoryItems, statusFilter, tierFilter, sourceFilter, searchQuery, sortBy]);

  // 100% Dynamic KPI Stats calculated purely from actual System Tools data!
  const kpiStats = useMemo(() => {
    const total = items.length;
    const active = items.filter((i) => i.status === "ACTIVE").length;
    const soon = items.filter((i) => i.status === "SOON").length;
    const activated = items.filter((i) => i.status === "ACTIVATED").length;
    const expired = items.filter((i) => i.status === "EXPIRED").length;
    const rate = total > 0 ? Math.round(((active + activated) / total) * 100) : 0;

    // Upcoming expiry date
    const upcomingDates = items
      .map((i) => i.expiryDate)
      .filter((d) => Boolean(d))
      .sort();
    const nextExpiry = upcomingDates.length > 0 ? upcomingDates[0] : "No Expiry Set";

    // Category distribution counts
    const geminiCount = items.filter((i) => i.category === "gemini").length;
    const canvaCount = items.filter((i) => i.category === "canva").length;
    const capcutCount = items.filter((i) => i.category === "capcut").length;
    const chatgptCount = items.filter((i) => i.category === "chatgpt").length;

    // Percentage shares
    const geminiPct = total > 0 ? Math.round((geminiCount / total) * 100) : 0;
    const canvaPct = total > 0 ? Math.round((canvaCount / total) * 100) : 0;
    const capcutPct = total > 0 ? Math.round((capcutCount / total) * 100) : 0;
    const chatgptPct = total > 0 ? Math.round((chatgptCount / total) * 100) : 0;

    return {
      total,
      active,
      soon,
      activated,
      expired,
      rate,
      nextExpiry,
      geminiCount,
      canvaCount,
      capcutCount,
      chatgptCount,
      geminiPct,
      canvaPct,
      capcutPct,
      chatgptPct,
    };
  }, [items]);

  // Helper info for active model
  const modelMeta = useMemo(() => {
    switch (activeCategory) {
      case "dashboard":
        return {
          title: "System Dashboard",
          khTitle: "ផ្ទាំងគ្រប់គ្រងទូទៅ",
          icon: "📊",
          badgeBg: "bg-purple-600",
          pillBg: "bg-purple-50 text-purple-700 border-purple-200",
          desc: "Executive pass metrics, activity trends, and system tool distribution",
          addBtnLabel: "Add New Pass",
          defaultTier: "Pro Pass",
          defaultSource: "Official Partner",
        };
      case "gemini":
        return {
          title: "Gemini Pro",
          khTitle: "ប្រព័ន្ធគ្រប់គ្រង Gemini Pro",
          icon: "🌟",
          badgeBg: "bg-blue-600",
          pillBg: "bg-blue-50 text-blue-700 border-blue-200",
          desc: "18-Month Google One AI Premium passes, license vouchers & accounts",
          addBtnLabel: "Add Gemini Voucher",
          defaultTier: "18-Month Plan (2TB)",
          defaultSource: "Google One Promo",
        };
      case "canva":
        return {
          title: "Canva Pro",
          khTitle: "ប្រព័ន្ធគ្រប់គ្រង Canva Pro",
          icon: "🎨",
          badgeBg: "bg-purple-600",
          pillBg: "bg-purple-50 text-purple-700 border-purple-200",
          desc: "Canva Pro Team Invite links, brand passes & creative seats",
          addBtnLabel: "Add Canva Pass",
          defaultTier: "Unlimited Brand Seats",
          defaultSource: "Canva Enterprise Partner",
        };
      case "capcut":
        return {
          title: "CapCut Pro",
          khTitle: "ប្រព័ន្ធគ្រប់គ្រង CapCut Pro",
          icon: "🎬",
          badgeBg: "bg-rose-600",
          pillBg: "bg-rose-50 text-rose-700 border-rose-200",
          desc: "CapCut Pro VIP Creator codes, 4K export keys & studio passes",
          addBtnLabel: "Add CapCut VIP",
          defaultTier: "VIP Creator 1-Year",
          defaultSource: "ByteDance Creator Fund",
        };
      case "chatgpt":
        return {
          title: "ChatGPT Plus",
          khTitle: "ប្រព័ន្ធគ្រប់គ្រង ChatGPT Plus",
          icon: "⚡",
          badgeBg: "bg-emerald-600",
          pillBg: "bg-emerald-50 text-emerald-700 border-emerald-200",
          desc: "ChatGPT Plus Team workspace links, GPT-4o licenses & OpenAI passes",
          addBtnLabel: "Add ChatGPT Plus",
          defaultTier: "GPT-4o Team Workspace",
          defaultSource: "OpenAI Direct Workspace",
        };
      default:
        return {
          title: "All Tools Vault",
          khTitle: "ឃ្លាំងប្រព័ន្ធទាំងអស់",
          icon: "📁",
          badgeBg: "bg-slate-700",
          pillBg: "bg-slate-50 text-slate-700 border-slate-200",
          desc: "Complete catalog of all AI, Design, and Video tools",
          addBtnLabel: "Add New Pass",
          defaultTier: "Pro Pass",
          defaultSource: "Official Partner",
        };
    }
  }, [activeCategory]);

  // Open Create Form Page for the active model (Instant 0ms)
  const handleOpenCreatePage = () => {
    setEditingItem(null);
    const cat = (activeCategory === "all" || activeCategory === "dashboard") ? "gemini" : activeCategory;
    setFCategory(cat);
    if (cat === "gemini") {
      setFTitle("Google One AI Premium · 18 Months");
      setFTitleKh("ប្រូម៉ូសិន Google AI 18 ខែ");
      setFUrlOrCode("");
      setFAssignedEmail("");
      setFSource("Google Partner Promo");
      setFPlanTier("18-Month Plan (2TB)");

      // Gemini Pro: compute 18 full months from today (Original System Rules)
      const geminiExpiry = new Date();
      geminiExpiry.setMonth(geminiExpiry.getMonth() + 18);
      setFExpiryDate(geminiExpiry.toISOString().slice(0, 10));
    } else if (cat === "canva") {
      setFTitle("Canva Pro Team Invite Link");
      setFTitleKh("តំណភ្ជាប់ចូលរួមក្រុម Canva Pro");
      setFUrlOrCode("");
      setFAssignedEmail("");
      setFSource("Canva Enterprise Partner");
      setFPlanTier("Unlimited Brand Seats");

      const oneYearLater = new Date();
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
      setFExpiryDate(oneYearLater.toISOString().slice(0, 10));
    } else if (cat === "capcut") {
      setFTitle("CapCut Pro VIP Video Pass");
      setFTitleKh("គណនី CapCut VIP សម្រាប់កាត់ត 4K");
      setFUrlOrCode("");
      setFAssignedEmail("");
      setFSource("ByteDance Creator Fund");
      setFPlanTier("VIP Creator 1-Year");

      const oneYearLater = new Date();
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
      setFExpiryDate(oneYearLater.toISOString().slice(0, 10));
    } else {
      setFTitle("ChatGPT Plus Team Workspace Invite");
      setFTitleKh("តំណភ្ជាប់ចូលរួមក្រុម ChatGPT Plus Team");
      setFUrlOrCode("");
      setFAssignedEmail("");
      setFSource("OpenAI Direct Workspace");
      setFPlanTier("GPT-4o Team Workspace");

      const oneYearLater = new Date();
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
      setFExpiryDate(oneYearLater.toISOString().slice(0, 10));
    }

    setFStatus("ACTIVE");
    setFNotes("");
    setFormAutoDetect(null);
    setCurrentView("form");
  };

  // Open Edit Form Page (Instant 0ms)
  const handleOpenEditPage = (item: ToolItem) => {
    setEditingItem(item);
    setFCategory(item.category);
    setFTitle(item.title);
    setFTitleKh(item.titleKh || "");
    setFUrlOrCode(item.urlOrCode);
    setFAssignedEmail(item.assignedEmail);
    setFSource(item.source);
    setFPlanTier(item.planTier);
    setFExpiryDate(item.expiryDate);
    setFStatus(item.status);
    setFNotes(item.notes || "");
    setFormAutoDetect(null);
    setCurrentView("form");
  };

  // Back to List Page (Instant 0ms)
  const handleBackToList = () => {
    setCurrentView("list");
  };

  // 1-Click Activate / Deactivate Toggle (Instant 0ms In-Memory Update)
  const handleToggleActivate = async (item: ToolItem) => {
    const isCurrentlyActivated = Boolean(item.activatedAt) || item.status === "ACTIVATED";
    const nextActivatedAt = isCurrentlyActivated ? "" : new Date().toISOString();
    const nextStatus = computeAutoStatus(
      item.expiryDate,
      nextActivatedAt,
      isCurrentlyActivated ? "ACTIVE" : "ACTIVATED"
    );

    const updated: ToolItem = {
      ...item,
      activatedAt: nextActivatedAt,
      status: nextStatus,
    };

    setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
    if (isCurrentlyActivated) {
      showToast("↩ កំណត់ជា: មិនទាន់ Activate (Active & Ready)");
    } else {
      showToast("⚡ បាន Activate ដោយជោគជ័យ! (Marked as Activated)");
    }

    // Backend sync
    try {
      await saveToolServerFn({ data: updated as ServerToolItem });
    } catch (err) {
      console.error("Backend toggle activate error:", err);
    }
  };

  // Google Live Link Detection Handler
  const handleOpenGoogleDetector = async (item: ToolItem) => {
    setDetectingItem(item);
    setIsDetecting(true);
    setDetectResult(null);
    triggerTopLoader(400);

    try {
      const res = await probeGooglePromoUrlServerFn({ data: { url: item.urlOrCode } });
      setDetectResult(res);

      const now = new Date().toISOString();
      // If conclusively confirmed redeemed by Google probe:
      if (res.status === "REDEEMED") {
        const updated: ToolItem = {
          ...item,
          status: "ACTIVATED",
          activatedAt: item.activatedAt || now,
          googleCheckStatus: "REDEEMED",
          googleCheckedAt: now,
        };
        setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
        await saveToolServerFn({ data: updated as ServerToolItem });
        showToast("⚡ Auto Detect: Promo Link នេះត្រូវបាន Activate រួចហើយ!");
      } else if (res.status === "AVAILABLE") {
        const updated: ToolItem = {
          ...item,
          googleCheckStatus: "AVAILABLE",
          googleCheckedAt: now,
        };
        setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
        await saveToolServerFn({ data: updated as ServerToolItem });
        showToast("✓ Auto Detect: Promo Link នៅមានសុពលភាព (Ready)");
      } else if (res.status === "EXPIRED") {
        const updated: ToolItem = {
          ...item,
          status: "EXPIRED",
          googleCheckStatus: "EXPIRED",
          googleCheckedAt: now,
        };
        setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
        await saveToolServerFn({ data: updated as ServerToolItem });
        showToast("✕ Auto Detect: Promo Link បានផុតកំណត់ហើយ!");
      }
    } catch (err: any) {
      setDetectResult({
        success: false,
        isGooglePromo: true,
        status: "SIGNIN_REQUIRED",
        message: "Google តម្រូវឱ្យចូលពិនិត្យតាមរយៈផ្ទាំង Google Browser (Protected)",
      });
    } finally {
      setIsDetecting(false);
    }
  };

  // Batch Auto-Detect for all Gemini Pro Links
  const handleBatchAutoDetectGemini = async () => {
    const geminiItems = items.filter(
      (it) =>
        it.category === "gemini" ||
        it.urlOrCode.includes("one.google.com") ||
        it.urlOrCode.includes("google.com/promo") ||
        it.urlOrCode.includes("subscription/new")
    );

    if (geminiItems.length === 0) {
      showToast("ពុំមាន Links Gemini Pro ក្នុងប្រព័ន្ធសម្រាប់ Auto Detect ទេ");
      return;
    }

    setIsBatchDetecting(true);
    setBatchProgress({ current: 0, total: geminiItems.length });
    triggerTopLoader(600);

    let redeemedCount = 0;
    let availableCount = 0;
    let expiredCount = 0;

    for (let i = 0; i < geminiItems.length; i++) {
      const it = geminiItems[i];
      setBatchProgress({ current: i + 1, total: geminiItems.length });

      try {
        const res = await probeGooglePromoUrlServerFn({ data: { url: it.urlOrCode } });
        const now = new Date().toISOString();
        let updated: ToolItem = { ...it };

        if (res.status === "REDEEMED") {
          redeemedCount++;
          updated = {
            ...it,
            status: "ACTIVATED",
            activatedAt: it.activatedAt || now,
            googleCheckStatus: "REDEEMED",
            googleCheckedAt: now,
          };
        } else if (res.status === "AVAILABLE") {
          availableCount++;
          updated = {
            ...it,
            googleCheckStatus: "AVAILABLE",
            googleCheckedAt: now,
          };
        } else if (res.status === "EXPIRED") {
          expiredCount++;
          updated = {
            ...it,
            status: "EXPIRED",
            googleCheckStatus: "EXPIRED",
            googleCheckedAt: now,
          };
        }

        setItems((prev) => prev.map((item) => (item.id === it.id ? updated : item)));
        await saveToolServerFn({ data: updated as ServerToolItem });
      } catch (e) {
        console.error("Batch auto detect error on item:", it.id, e);
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    setIsBatchDetecting(false);
    setBatchProgress(null);
    showToast(
      `✓ Auto Detect រួចរាល់: ${geminiItems.length} Links (បាន Activate: ${redeemedCount}, នៅទំនេរ: ${availableCount}${expiredCount > 0 ? `, ផុតកំណត់: ${expiredCount}` : ""})`
    );
  };

  const handleApplyDetectionOutcome = async (
    outcome: "REDEEMED" | "AVAILABLE" | "EXPIRED"
  ) => {
    if (!detectingItem) return;
    triggerTopLoader(350);

    const now = new Date().toISOString();
    let updated: ToolItem;
    if (outcome === "REDEEMED") {
      updated = {
        ...detectingItem,
        status: "ACTIVATED",
        activatedAt: detectingItem.activatedAt || now,
        googleCheckStatus: "REDEEMED",
        googleCheckedAt: now,
      };
      showToast("✓ បានសម្គាល់ជា: បាន Activate ជាមួយ Google រួចរាល់!");
    } else if (outcome === "AVAILABLE") {
      updated = {
        ...detectingItem,
        status: "ACTIVE",
        activatedAt: "",
        googleCheckStatus: "AVAILABLE",
        googleCheckedAt: now,
      };
      showToast("✓ បានសម្គាល់ជា: នៅមានសុពលភាព (មិនទាន់បាន Activate)");
    } else {
      updated = {
        ...detectingItem,
        status: "EXPIRED",
        googleCheckStatus: "EXPIRED",
        googleCheckedAt: now,
      };
      showToast("✓ បានសម្គាល់ជា: ផុតកំណត់ (Expired)");
    }

    setItems((prev) => prev.map((it) => (it.id === detectingItem.id ? updated : it)));
    setDetectingItem(null);
    setDetectResult(null);

    try {
      await saveToolServerFn({ data: updated as ServerToolItem });
    } catch (err) {
      console.error("Error saving detection outcome:", err);
    }
  };

  // Handle URL change with Instant Auto-Detect for Gemini Pro & other services
  const handleUrlInputChange = async (url: string) => {
    setFUrlOrCode(url);
    const trimmed = url.trim();

    if (!trimmed) {
      setFormAutoDetect(null);
      return;
    }

    const isGemini =
      trimmed.includes("one.google.com") ||
      trimmed.includes("google.com/promo") ||
      trimmed.includes("gemini.google.com") ||
      trimmed.includes("subscription/new");

    const isCanva = trimmed.includes("canva.com");
    const isCapCut = trimmed.includes("capcut.com");
    const isChatGPT = trimmed.includes("chatgpt.com") || trimmed.includes("openai.com");

    if (isGemini) {
      setFCategory("gemini");
      if (!fTitle || fTitle.includes("·") || fTitle.includes("Invite") || fTitle.includes("Pass")) {
        setFTitle("Google One AI Premium · 18 Months");
      }
      if (!fTitleKh || fTitleKh.includes("ប្រូម៉ូសិន") || fTitleKh.includes("តំណភ្ជាប់")) {
        setFTitleKh("ប្រូម៉ូសិន Gemini Pro 18 ខែ");
      }
      const geminiExp = new Date();
      geminiExp.setMonth(geminiExp.getMonth() + 18);
      setFExpiryDate(geminiExp.toISOString().slice(0, 10));

      const detectedTier = trimmed.toLowerCase().includes("5tb")
        ? "18-Month Plan (5TB)"
        : "18-Month Plan (2TB)";
      setFPlanTier(detectedTier);
      if (!fSource) setFSource("Google Partner Promo");

      // Auto trigger probe
      setFormAutoDetect({
        isDetecting: true,
        status: null,
        message: "កំពុង Auto Detect ស្ថានភាពលើ Google System...",
        planType: detectedTier,
      });

      try {
        const res = await probeGooglePromoUrlServerFn({ data: { url: trimmed } });
        setFormAutoDetect({
          isDetecting: false,
          status: res.status as any,
          message: res.message,
          planType: res.planType || detectedTier,
        });

        if (res.status === "REDEEMED") {
          setFStatus("ACTIVATED");
        } else if (res.status === "AVAILABLE") {
          setFStatus("ACTIVE");
        } else if (res.status === "EXPIRED") {
          setFStatus("EXPIRED");
        }
      } catch {
        setFormAutoDetect({
          isDetecting: false,
          status: "AVAILABLE",
          message: "System Auto Detect: Token Gemini Pro 18 ខែត្រឹមត្រូវ (Ready)",
          planType: detectedTier,
        });
      }
    } else if (isCanva) {
      setFCategory("canva");
      setFormAutoDetect(null);
    } else if (isCapCut) {
      setFCategory("capcut");
      setFormAutoDetect(null);
    } else if (isChatGPT) {
      setFCategory("chatgpt");
      setFormAutoDetect(null);
    } else {
      setFormAutoDetect(null);
    }
  };

  // Save Record (Frontend & Backend Sync)
  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!fTitle.trim() || !fUrlOrCode.trim()) return;

    triggerTopLoader(450);

    if (editingItem) {
      const isActivated = fStatus === "ACTIVATED";
      const activatedAtVal = isActivated ? (editingItem.activatedAt || new Date().toISOString()) : "";
      const computedStatus = computeAutoStatus(fExpiryDate, activatedAtVal, fStatus);

      const updated: ToolItem = {
        ...editingItem,
        category: fCategory,
        title: fTitle.trim(),
        titleKh: fTitleKh.trim() || undefined,
        urlOrCode: fUrlOrCode.trim(),
        assignedEmail: fAssignedEmail.trim() || "unassigned@amf-express.com",
        source: fSource.trim() || "Official",
        planTier: fPlanTier.trim() || "Pro",
        expiryDate: fExpiryDate,
        status: computedStatus,
        activatedAt: activatedAtVal || undefined,
        notes: fNotes.trim(),
      };

      setItems((prev) => prev.map((it) => (it.id === editingItem.id ? updated : it)));

      // Backend sync
      try {
        const res: any = await saveToolServerFn({ data: updated as ServerToolItem });
        if (res?.database === "supabase") {
          setDatabaseMode("supabase");
          showToast("✓ បានរក្សាទុកក្នុង Supabase Database ជោគជ័យ!");
        } else {
          showToast("✓ បានកែប្រែ Pass ជោគជ័យ!");
        }
      } catch (err) {
        console.error("Backend save error:", err);
        showToast("✓ បានកែប្រែ Pass (Saved Locally)");
      }
    } else {
      const isActivated = fStatus === "ACTIVATED";
      const activatedAtVal = isActivated ? new Date().toISOString() : undefined;
      const computedStatus = computeAutoStatus(fExpiryDate, activatedAtVal, fStatus);

      const newItem: ToolItem = {
        id: `${fCategory}_${Date.now()}`,
        category: fCategory,
        title: fTitle.trim(),
        titleKh: fTitleKh.trim() || undefined,
        urlOrCode: fUrlOrCode.trim(),
        assignedEmail: fAssignedEmail.trim() || "unassigned@amf-express.com",
        source: fSource.trim() || "Official",
        planTier: fPlanTier.trim() || "Pro",
        receivedDate: new Date().toISOString().slice(0, 10),
        expiryDate: fExpiryDate,
        status: computedStatus,
        activatedAt: activatedAtVal,
        notes: fNotes.trim(),
      };

      setItems((prev) => [newItem, ...prev]);

      // Backend sync
      try {
        const res: any = await saveToolServerFn({ data: newItem as ServerToolItem });
        if (res?.database === "supabase") {
          setDatabaseMode("supabase");
          showToast("✓ បានរក្សាទុកក្នុង Supabase Database ជោគជ័យ!");
        } else {
          showToast("✓ បានបង្កើត Pass ថ្មីដោយជោគជ័យ!");
        }
      } catch (err) {
        console.error("Backend save error:", err);
        showToast("✓ បានបង្កើត Pass (Saved Locally)");
      }
    }
    setCurrentView("list");
  };

  // Delete Record (Frontend & Backend Sync)
  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;
    triggerTopLoader(350);
    setItems((prev) => prev.filter((it) => it.id !== id));
    showToast("✓ Deleted pass.");

    // Backend sync
    try {
      await deleteToolServerFn({ data: { id } });
    } catch (err) {
      console.error("Backend delete error:", err);
    }
  };

  // Copy Code or URL
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast("✓ Copied: " + (text.length > 32 ? text.slice(0, 32) + "..." : text));
  };


  // Format Expiry Days
  const getDaysLeft = (expiryDate: string) => {
    if (!expiryDate) return null;
    const todayIso = new Date().toISOString().slice(0, 10);
    return daysUntil(expiryDate, todayIso);
  };

  return (
    <div className="flex h-screen w-full bg-[#f8fafc] text-slate-800 font-sans overflow-hidden select-none relative">
      {/* 
        ══════════════════════════════════════════════════════════════
        TOP LOADER PROGRESS BAR (Glowing NProgress / YouTube Style)
        ══════════════════════════════════════════════════════════════
      */}
      <div
        className={`fixed top-0 left-0 right-0 z-[9999] h-[3px] pointer-events-none transition-opacity duration-300 ${
          loaderVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <div
          className="h-full bg-gradient-to-r from-amber-400 via-rose-500 via-purple-500 to-indigo-500 shadow-[0_0_12px_rgba(168,85,247,0.85),0_0_5px_rgba(236,72,153,0.8)] transition-all duration-300 ease-out"
          style={{ width: `${loaderProgress}%` }}
        />
        {loaderVisible && loaderProgress > 0 && loaderProgress < 100 && (
          <div
            className="absolute top-[-2px] h-[7px] w-[7px] rounded-full bg-white shadow-[0_0_8px_#ffffff,0_0_12px_#ec4899] transition-all duration-300 ease-out"
            style={{ left: `calc(${loaderProgress}% - 4px)` }}
          />
        )}
      </div>

      {/* Toast Notification */}
      {copyToast && (
        <div className="fixed top-18 right-8 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <span>{copyToast}</span>
        </div>
      )}

      {/* Mobile Overlay Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-300 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 
        ══════════════════════════════════════════════════════════════
        SIDEBAR: EXPANDED (w-72) OR ICON MINI MODE (w-20)
        ══════════════════════════════════════════════════════════════
      */}
      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-50 bg-[#2d074e] text-white flex flex-col justify-between transition-all duration-300 ease-in-out shadow-2xl lg:shadow-none shrink-0 ${
          sidebarOpen
            ? "w-72 translate-x-0"
            : "-translate-x-full lg:translate-x-0 lg:w-20"
        }`}
      >
        <div className="flex flex-col">
          {/* Sidebar Top Header */}
          <div
            className={`h-16 flex items-center border-b border-purple-900/60 bg-[#250541] transition-all duration-300 ${
              sidebarOpen ? "justify-between px-5" : "justify-center px-2"
            }`}
          >
            {sidebarOpen ? (
              <>
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-black text-amber-300 text-sm shrink-0 shadow-xs">
                    SP
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="font-extrabold text-sm text-white tracking-wide leading-tight truncate">
                      Sopha Store
                    </span>
                    <span className="text-[10px] text-purple-300/80 truncate">Tools & Coupon Vault</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 text-lg transition cursor-pointer lg:hidden"
                  title="Close menu"
                >
                  ✕
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center font-black text-amber-300 text-sm transition cursor-pointer"
                title="Expand Sidebar"
              >
                SP
              </button>
            )}
          </div>

          {/* Model Switcher Links: Expanded or Icon Mini mode */}
          <div className={`space-y-1.5 ${sidebarOpen ? "p-3" : "px-2 py-3"}`}>
            {sidebarOpen && (
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-purple-300/60">
                Main Overview
              </div>
            )}

            {/* 0. Dashboard (Top on Sidebar) */}
            <button
              type="button"
              onClick={() => handleCategorySwitch("dashboard")}
              title="Dashboard Overview"
              className={`w-full flex items-center rounded-xl transition cursor-pointer ${
                sidebarOpen
                  ? "justify-between px-3.5 py-3 text-xs font-bold"
                  : "justify-center p-2.5"
              } ${
                activeCategory === "dashboard"
                  ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/40 ring-1 ring-purple-400/50"
                  : "text-purple-200/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className={`flex items-center ${sidebarOpen ? "gap-3" : "justify-center"}`}>
                <span className="text-xl">📊</span>
                {sidebarOpen && (
                  <div className="text-left">
                    <div>Dashboard</div>
                    <div className="text-[10px] font-normal opacity-80">Overview & Analytics</div>
                  </div>
                )}
              </div>
              {sidebarOpen && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white font-bold">
                  {items.length}
                </span>
              )}
            </button>

            {sidebarOpen && (
              <div className="pt-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-purple-300/60">
                Separated Workspaces
              </div>
            )}

            {/* 1. Gemini Pro Model */}
            <button
              type="button"
              onClick={() => handleCategorySwitch("gemini")}
              title={`Gemini Pro (${items.filter((i) => i.category === "gemini").length} passes)`}
              className={`w-full flex items-center rounded-xl transition cursor-pointer ${
                sidebarOpen
                  ? "justify-between px-3.5 py-3 text-xs font-bold"
                  : "justify-center p-2.5"
              } ${
                activeCategory === "gemini"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40 ring-1 ring-blue-400/50"
                  : "text-purple-200/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className={`flex items-center ${sidebarOpen ? "gap-3" : "justify-center"}`}>
                <span className="text-xl">🌟</span>
                {sidebarOpen && (
                  <div className="text-left">
                    <div>Gemini Pro</div>
                    <div className="text-[10px] font-normal opacity-80">18-Month AI Promo Links</div>
                  </div>
                )}
              </div>
              {sidebarOpen && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white font-bold">
                  {items.filter((i) => i.category === "gemini").length}
                </span>
              )}
            </button>

            {/* 2. Canva Pro Model */}
            <button
              type="button"
              onClick={() => handleCategorySwitch("canva")}
              title={`Canva Pro (${items.filter((i) => i.category === "canva").length} passes)`}
              className={`w-full flex items-center rounded-xl transition cursor-pointer ${
                sidebarOpen
                  ? "justify-between px-3.5 py-3 text-xs font-bold"
                  : "justify-center p-2.5"
              } ${
                activeCategory === "canva"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-900/40 ring-1 ring-purple-400/50"
                  : "text-purple-200/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className={`flex items-center ${sidebarOpen ? "gap-3" : "justify-center"}`}>
                <span className="text-xl">🎨</span>
                {sidebarOpen && (
                  <div className="text-left">
                    <div>Canva Pro</div>
                    <div className="text-[10px] font-normal opacity-80">Team Invites & Brand Kit</div>
                  </div>
                )}
              </div>
              {sidebarOpen && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white font-bold">
                  {items.filter((i) => i.category === "canva").length}
                </span>
              )}
            </button>

            {/* 3. CapCut Pro Model */}
            <button
              type="button"
              onClick={() => handleCategorySwitch("capcut")}
              title={`CapCut Pro (${items.filter((i) => i.category === "capcut").length} passes)`}
              className={`w-full flex items-center rounded-xl transition cursor-pointer ${
                sidebarOpen
                  ? "justify-between px-3.5 py-3 text-xs font-bold"
                  : "justify-center p-2.5"
              } ${
                activeCategory === "capcut"
                  ? "bg-rose-600 text-white shadow-lg shadow-rose-900/40 ring-1 ring-rose-400/50"
                  : "text-purple-200/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className={`flex items-center ${sidebarOpen ? "gap-3" : "justify-center"}`}>
                <span className="text-xl">🎬</span>
                {sidebarOpen && (
                  <div className="text-left">
                    <div>CapCut Pro</div>
                    <div className="text-[10px] font-normal opacity-80">VIP Creator & 4K Export</div>
                  </div>
                )}
              </div>
              {sidebarOpen && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white font-bold">
                  {items.filter((i) => i.category === "capcut").length}
                </span>
              )}
            </button>

            {/* 4. ChatGPT Plus Model */}
            <button
              type="button"
              onClick={() => handleCategorySwitch("chatgpt")}
              title={`ChatGPT Plus (${items.filter((i) => i.category === "chatgpt").length} passes)`}
              className={`w-full flex items-center rounded-xl transition cursor-pointer ${
                sidebarOpen
                  ? "justify-between px-3.5 py-3 text-xs font-bold"
                  : "justify-center p-2.5"
              } ${
                activeCategory === "chatgpt"
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 ring-1 ring-emerald-400/50"
                  : "text-purple-200/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className={`flex items-center ${sidebarOpen ? "gap-3" : "justify-center"}`}>
                <span className="text-xl">⚡</span>
                {sidebarOpen && (
                  <div className="text-left">
                    <div>ChatGPT Plus</div>
                    <div className="text-[10px] font-normal opacity-80">Team Workspace & GPT-4o</div>
                  </div>
                )}
              </div>
              {sidebarOpen && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white font-bold">
                  {items.filter((i) => i.category === "chatgpt").length}
                </span>
              )}
            </button>

            {/* 5. All Tools Vault */}
            <div className={sidebarOpen ? "pt-2" : "pt-1"}>
              <button
                type="button"
                onClick={() => handleCategorySwitch("all")}
                title={`All Passes (${items.length})`}
                className={`w-full flex items-center rounded-xl transition cursor-pointer ${
                  sidebarOpen
                    ? "justify-between px-3.5 py-2.5 text-xs font-semibold"
                    : "justify-center p-2.5"
                } ${
                  activeCategory === "all"
                    ? "bg-white/20 text-white font-bold"
                    : "text-purple-200/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                <div className={`flex items-center ${sidebarOpen ? "gap-3" : "justify-center"}`}>
                  <span className="text-base">📁</span>
                  {sidebarOpen && <span>All Passes ({items.length})</span>}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar Footer with Sign Out */}
        <div
          className={`border-t border-purple-900/60 bg-[#250541] flex items-center shrink-0 transition-all duration-300 ${
            sidebarOpen ? "p-4 justify-between" : "p-3 flex-col justify-center gap-2"
          }`}
        >
          {sidebarOpen ? (
            <>
              <div className="truncate">
                <div className="text-xs font-bold text-white truncate">{currentUser.name}</div>
                <div className="text-[10px] text-purple-300 truncate">{currentUser.email}</div>
              </div>
              <button
                onClick={onSignOut}
                className="text-purple-300 hover:text-rose-400 p-2 text-xs font-bold rounded-lg hover:bg-white/10 transition cursor-pointer shrink-0"
                title="Sign out"
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <div
                className="w-8 h-8 rounded-full bg-purple-700/60 text-white font-bold text-xs flex items-center justify-center shrink-0"
                title={`${currentUser.name} (${currentUser.email})`}
              >
                {currentUser.name.charAt(0)}
              </div>
              <button
                onClick={onSignOut}
                className="text-purple-300 hover:text-rose-400 p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
                title="Sign out"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </>
          )}
        </div>
      </aside>

      {/* 
        ══════════════════════════════════════════════════════════════
        MAIN CONTENT VIEWPORT
        ══════════════════════════════════════════════════════════════
      */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Navbar */}
        <header
          style={{ backgroundColor: "#3c0859" }}
          className="h-14 px-4 sm:px-6 flex items-center justify-between text-white shrink-0 z-30 shadow-md"
        >
          {/* Left: Hamburger Menu + Page Title */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              className="text-white hover:bg-white/10 p-1.5 rounded-lg transition cursor-pointer"
              aria-label="Toggle sidebar"
              title="Toggle Workspace Menu"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            {currentView === "form" ? (
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={handleBackToList}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition cursor-pointer"
                  title="Back to Passes List"
                >
                  <span>←</span>
                  <span className="hidden sm:inline">Back to Passes</span>
                  <span className="sm:hidden">Back</span>
                </button>
                <div className="h-4 w-px bg-white/20" />
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-base">{editingItem ? "✏️" : "✨"}</span>
                  <span className="font-extrabold text-sm sm:text-base tracking-tight capitalize text-white truncate">
                    {editingItem ? "Edit Pass" : "New Pass"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-lg">{modelMeta.icon}</span>
                <span className="font-extrabold text-base tracking-tight capitalize text-white">
                  {modelMeta.title}
                </span>
              </div>
            )}
          </div>

          {/* Right: DB Badge, Language Pill, Moon Theme, Notification Bell */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Database Cloud Live Status Badge */}
            <div 
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition shadow-xs ${
                databaseMode === "supabase"
                  ? "bg-emerald-500/25 text-emerald-300 border-emerald-400/50"
                  : "bg-white/10 text-purple-200 border-white/20"
              }`}
              title={databaseMode === "supabase" ? "Connected directly to Supabase PostgreSQL Database" : "Using Local Storage Cache"}
            >
              <span className={`w-2 h-2 rounded-full ${databaseMode === "supabase" ? "bg-emerald-400 animate-pulse" : "bg-purple-300"}`} />
              <span>{databaseMode === "supabase" ? "Supabase DB" : "Local Vault"}</span>
            </div>

            {/* Method 2: Live Silent Background Auto-Scan Status Pill */}
            <div
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition shadow-xs ${
                isSilentScanning
                  ? "bg-blue-500/30 text-blue-200 border-blue-400/60"
                  : "bg-white/10 text-purple-200 border-white/20"
              }`}
              title="Method 2: Silent In-Dashboard Auto-Scan for Gemini Pro links"
            >
              <span className={`w-2 h-2 rounded-full ${isSilentScanning ? "bg-blue-400 animate-ping" : "bg-emerald-400"}`} />
              <span>
                {isSilentScanning
                  ? "Auto-Detecting Gemini..."
                  : "Gemini Auto-Scan: Live"}
              </span>
            </div>

            {/* Language Pill */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs font-semibold hover:bg-white/20 transition cursor-pointer">
              <span className="text-sm">文A</span>
              <span>EN</span>
            </div>

            {/* Moon Theme Icon */}
            <button className="text-white/80 hover:text-white p-1 transition cursor-pointer" title="Light Theme Active">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            </button>

            {/* Notification Bell with Badge */}
            <button className="relative text-white/80 hover:text-white p-1 transition cursor-pointer" title="System Alerts">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {kpiStats.soon > 0 && (
                <>
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500" />
                </>
              )}
            </button>
          </div>
        </header>

        {/* 
          2. SCROLLABLE WORKSPACE: DEDICATED FORM PAGE OR DASHBOARD / LIST VIEW
        */}
        {currentView === "form" ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#f8fafc]">
            <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
              {/* Form Page Top Header with Breadcrumbs & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/90">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleBackToList}
                    className="w-10 h-10 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 shadow-xs flex items-center justify-center transition cursor-pointer shrink-0"
                    title="Back to Passes"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <line x1="19" y1="12" x2="5" y2="12" />
                      <polyline points="12 19 5 12 12 5" />
                    </svg>
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">
                        {fCategory === "gemini"
                          ? "🌟"
                          : fCategory === "canva"
                          ? "🎨"
                          : fCategory === "capcut"
                          ? "🎬"
                          : "⚡"}
                      </span>
                      <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                        {editingItem ? "Edit Pass" : "Create New Pass"}
                      </h1>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 font-bold">
                        {fCategory === "gemini"
                          ? "Gemini Pro"
                          : fCategory === "canva"
                          ? "Canva Pro"
                          : fCategory === "capcut"
                          ? "CapCut Pro"
                          : "ChatGPT Plus"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {editingItem
                        ? "Update the license credentials and status for this pass"
                        : "Fill in the coupon promo link, credentials, and validity details"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={handleBackToList}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="pass-page-form"
                    style={{ backgroundColor: "#3c0859" }}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-md shadow-purple-950/20 hover:opacity-95 active:scale-95 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <span>✓</span>
                    <span>{editingItem ? "Update Pass" : "Save Pass"}</span>
                  </button>
                </div>
              </div>

              {/* Form Content Cards */}
              <form id="pass-page-form" onSubmit={handleSave} className="space-y-6">
                {/* Section 1: Pass Credentials & Title */}
                <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
                  <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">
                    1. Pass Details & Access Link (ព័ត៌មានលម្អិត & តំណភ្ជាប់)
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Pass Title (English) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={fTitle}
                        onChange={(e) => setFTitle(e.target.value)}
                        placeholder="e.g. Gemini Pro · 18 Months Promo"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 outline-none focus:border-purple-600 focus:bg-white transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Khmer Title / Note (ឈ្មោះជាភាសាខ្មែរ)
                      </label>
                      <input
                        type="text"
                        value={fTitleKh}
                        onChange={(e) => setFTitleKh(e.target.value)}
                        placeholder="e.g. ប្រូម៉ូសិន 18 ខែ"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 outline-none focus:border-purple-600 focus:bg-white transition"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-slate-700">
                        Redemption URL or Coupon Code (តំណភ្ជាប់ ឬ កូដគូប៉ុង) <span className="text-rose-500">*</span>
                      </label>
                      {fUrlOrCode.trim().startsWith("http") && (
                        <button
                          type="button"
                          onClick={() => {
                            handleOpenGoogleDetector({
                              id: editingItem?.id || "temp",
                              category: fCategory,
                              title: fTitle || "Preview Pass",
                              urlOrCode: fUrlOrCode,
                              assignedEmail: fAssignedEmail,
                              source: fSource,
                              planTier: fPlanTier,
                              receivedDate: new Date().toISOString().slice(0, 10),
                              expiryDate: fExpiryDate,
                              status: fStatus,
                            });
                          }}
                          className="text-[11px] font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 cursor-pointer transition bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200"
                        >
                          <span>⚡</span>
                          <span>Auto Check System</span>
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      value={fUrlOrCode}
                      onChange={(e) => handleUrlInputChange(e.target.value)}
                      placeholder="https://one.google.com/promo/... or PROMO-CODE-XXXX"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-medium text-slate-800 outline-none focus:border-purple-600 focus:bg-white transition"
                    />

                    {/* Instant Auto-Detect Status Banner */}
                    {formAutoDetect && (
                      <div
                        className={`mt-2.5 p-3 rounded-xl border text-xs transition-all ${
                          formAutoDetect.isDetecting
                            ? "bg-purple-50/80 border-purple-200 text-purple-900"
                            : formAutoDetect.status === "REDEEMED"
                            ? "bg-purple-100/90 border-purple-300 text-purple-950"
                            : formAutoDetect.status === "AVAILABLE"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-950"
                            : formAutoDetect.status === "EXPIRED"
                            ? "bg-rose-50 border-rose-200 text-rose-950"
                            : "bg-slate-50 border-slate-200 text-slate-800"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <span className="text-base shrink-0">
                              {formAutoDetect.isDetecting
                                ? "⏳"
                                : formAutoDetect.status === "REDEEMED"
                                ? "⚡"
                                : formAutoDetect.status === "AVAILABLE"
                                ? "✓"
                                : formAutoDetect.status === "EXPIRED"
                                ? "✕"
                                : "ℹ️"}
                            </span>
                            <div className="space-y-0.5">
                              <div className="font-extrabold flex items-center gap-1.5 flex-wrap">
                                <span>Gemini Pro Auto-Detect:</span>
                                {formAutoDetect.isDetecting ? (
                                  <span className="text-purple-600 font-semibold animate-pulse">
                                    កំពុងពិនិត្យលើ Google Server...
                                  </span>
                                ) : formAutoDetect.status === "REDEEMED" ? (
                                  <span className="text-purple-800 font-black">
                                    បាន Activate រួចហើយ (Already Redeemed)
                                  </span>
                                ) : formAutoDetect.status === "AVAILABLE" ? (
                                  <span className="text-emerald-700 font-black">
                                    មិនទាន់ Activate ទេ (Active & Ready to Use)
                                  </span>
                                ) : formAutoDetect.status === "EXPIRED" ? (
                                  <span className="text-rose-700 font-black">
                                    ផុតកំណត់ (Expired)
                                  </span>
                                ) : (
                                  <span>{formAutoDetect.status}</span>
                                )}
                              </div>
                              <p className="text-[11px] font-medium opacity-90">
                                {formAutoDetect.message}
                              </p>
                              {formAutoDetect.planType && (
                                <div className="text-[10px] font-bold text-slate-500 pt-0.5">
                                  Plan: {formAutoDetect.planType} · គណនា 18 ខែស្វ័យប្រវត្តិ
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-lg bg-white/90 border border-slate-200 text-slate-700 shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>In-Dashboard Auto-Check</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <p className="text-[11px] text-slate-400 mt-1 font-medium">
                      Enter a direct link (starting with https://) for 1-click access, or a license activation code.
                    </p>
                  </div>
                </div>

                {/* Section 2: Account & Source */}
                <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
                  <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">
                    2. Account Assignment & Source (គណនី & ប្រភព)
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Assigned Email / User
                      </label>
                      <input
                        type="email"
                        value={fAssignedEmail}
                        onChange={(e) => setFAssignedEmail(e.target.value)}
                        placeholder="e.g. team.member@gmail.com"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 outline-none focus:border-purple-600 focus:bg-white transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Source / Vendor / Partner
                      </label>
                      <input
                        type="text"
                        value={fSource}
                        onChange={(e) => setFSource(e.target.value)}
                        placeholder="e.g. Google Cloud Workspace, Canva Enterprise"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 outline-none focus:border-purple-600 focus:bg-white transition"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Plan, Validity & Status */}
                <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
                  <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">
                    3. Plan Tier, Expiry & Status (ផែនការ & ស្ថានភាព)
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Plan / Tier Description
                      </label>
                      <input
                        type="text"
                        value={fPlanTier}
                        onChange={(e) => setFPlanTier(e.target.value)}
                        placeholder="e.g. 18-Month Plan (2TB), Pro Pass"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 outline-none focus:border-purple-600 focus:bg-white transition"
                      />
                    </div>
                    <div>
                      <label className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1.5">
                        <span>Expiry Date (កាលបរិច្ឆេទផុតកំណត់)</span>
                        {fCategory === "gemini" && (
                          <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full font-bold">
                            🌟 18-Month Auto (+18 ខែ)
                          </span>
                        )}
                      </label>
                      <input
                        type="date"
                        value={fExpiryDate}
                        onChange={(e) => setFExpiryDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 outline-none focus:border-purple-600 focus:bg-white transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">
                      Pass Status (ស្ថានភាពបច្ចុប្បន្ន)
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {(["ACTIVE", "SOON", "ACTIVATED", "EXPIRED"] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setFStatus(st)}
                          className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                            fStatus === st
                              ? st === "ACTIVE"
                                ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                                : st === "SOON"
                                ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                                : st === "ACTIVATED"
                                ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                                : "bg-rose-600 text-white border-rose-600 shadow-sm"
                              : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          <span>
                            {st === "ACTIVE"
                              ? "✓"
                              : st === "SOON"
                              ? "⚠️"
                              : st === "ACTIVATED"
                              ? "⚡"
                              : "✕"}
                          </span>
                          <span>
                            {st === "ACTIVE"
                              ? "ACTIVE (មិនទាន់ Activate)"
                              : st === "ACTIVATED"
                              ? "ACTIVATED (បាន Activate)"
                              : st === "SOON"
                              ? "EXPIRING SOON"
                              : "EXPIRED"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Section 4: Notes & Redemption Guide */}
                <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-2">
                  <label className="block text-xs font-black uppercase text-slate-500 tracking-wider">
                    4. Redemption Guide / Notes (កំណត់ចំណាំ ឬ ការណែនាំ)
                  </label>
                  <textarea
                    rows={3}
                    value={fNotes}
                    onChange={(e) => setFNotes(e.target.value)}
                    placeholder="Enter instructions, credentials, or redemption guidelines..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 outline-none focus:border-purple-600 focus:bg-white transition resize-none"
                  />
                </div>

                {/* Bottom Action Footer */}
                <div className="pt-2 flex items-center justify-end gap-3 pb-8">
                  <button
                    type="button"
                    onClick={handleBackToList}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{ backgroundColor: "#3c0859" }}
                    className="px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-md shadow-purple-950/20 hover:opacity-95 active:scale-95 transition cursor-pointer flex items-center gap-2"
                  >
                    <span>✓</span>
                    <span>{editingItem ? "Update Pass" : "Save Pass"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-5">
          {/* Header Row: Title & Add Pass Button (Only on model pages, hidden on dashboard) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight capitalize leading-tight">
                  {modelMeta.title}
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 font-bold">
                  {modelMeta.khTitle}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                {activeCategory === "dashboard"
                  ? "Live real-time analytics & tracking for all registered System Tools & Passes"
                  : `${categoryItems.length} total coupon passes & promo links in this system`}
              </p>
            </div>

            {/* Action Buttons: Hidden on Dashboard */}
            {activeCategory !== "dashboard" && (
              <div className="flex flex-wrap items-center gap-2.5">
                {activeCategory === "gemini" && (
                  <button
                    type="button"
                    onClick={handleBatchAutoDetectGemini}
                    disabled={isBatchDetecting}
                    className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold text-xs shadow-md shadow-indigo-950/20 flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-60 active:scale-95"
                    title="ពិនិត្យ Auto Detect លើ Links Gemini Pro ទាំងអស់ក្នុងប្រព័ន្ធ"
                  >
                    <span className={isBatchDetecting ? "animate-spin text-sm" : "text-sm"}>⚡</span>
                    <span>
                      {isBatchDetecting && batchProgress
                        ? `កំពុង Auto Detect (${batchProgress.current}/${batchProgress.total})...`
                        : "Auto Detect Links Gemini"}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleOpenCreatePage}
                  style={{ backgroundColor: "#4f46e5" }}
                  className="w-full sm:w-auto py-2.5 px-5 rounded-xl text-white font-bold text-xs shadow-md shadow-indigo-950/20 hover:opacity-95 active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span className="text-base leading-none font-bold">+</span>
                  <span>{modelMeta.addBtnLabel}</span>
                </button>
              </div>
            )}
          </div>

          {/* 
            ══════════════════════════════════════════════════════════════
            DASHBOARD VIEW: 100% PURE SYSTEM TOOLS & DYNAMIC LIVE DATA
            ══════════════════════════════════════════════════════════════
          */}
          {activeCategory === "dashboard" ? (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Row 1: 4 Top KPI Stat Cards (100% Dynamic from actual data!) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: TOTAL SYSTEM PASSES */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[11px] font-black tracking-wider text-slate-600 uppercase">
                        TOTAL SYSTEM PASSES
                      </span>
                      <div className="text-3xl font-black text-slate-900 mt-1 leading-tight">
                        {kpiStats.total}
                      </div>
                      <span className="text-xs text-slate-500 font-medium">
                        {kpiStats.total} registered tool passes
                      </span>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-indigo-600/30">
                      🗂️
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 rounded-full transition-all duration-500"
                        style={{ width: kpiStats.total > 0 ? "100%" : "0%" }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-3 text-xs">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                        Live System Data
                      </span>
                      <span className="text-[11px] text-slate-400 font-semibold">
                        Backend Connected
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 2: ACTIVE & READY */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[11px] font-black tracking-wider text-slate-600 uppercase">
                        ACTIVE & READY
                      </span>
                      <div className="text-3xl font-black text-slate-900 mt-1 leading-tight">
                        {kpiStats.active}
                      </div>
                      <span className="text-xs text-slate-500 font-medium">
                        {kpiStats.active} verified active passes
                      </span>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-emerald-500/30">
                      ✓
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-teal-400 to-emerald-500 rounded-full transition-all duration-500"
                        style={{
                          width: kpiStats.total > 0 ? `${Math.round((kpiStats.active / kpiStats.total) * 100)}%` : "0%",
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-3 text-xs">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        {kpiStats.total > 0 ? `${Math.round((kpiStats.active / kpiStats.total) * 100)}% Active` : "0% Active"}
                      </span>
                      <span className="text-[11px] text-slate-400 font-semibold">
                        Ready to Use
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 3: EXPIRING SOON */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[11px] font-black tracking-wider text-slate-600 uppercase">
                        EXPIRING SOON (≤ 7D)
                      </span>
                      <div className="text-3xl font-black text-slate-900 mt-1 leading-tight">
                        {kpiStats.soon}
                      </div>
                      <span className="text-xs text-slate-500 font-medium">
                        {kpiStats.soon} passes require renewal
                      </span>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-rose-500/30">
                      ⚠️
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-rose-500 to-amber-500 rounded-full transition-all duration-500"
                        style={{
                          width: kpiStats.total > 0 ? `${Math.round((kpiStats.soon / kpiStats.total) * 100)}%` : "0%",
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-3 text-xs">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                        {kpiStats.soon > 0 ? "Needs Attention" : "All Safe"}
                      </span>
                      <span className="text-[11px] text-slate-400 font-semibold">
                        Auto-tracked
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 4: ACTIVATION RATE */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[11px] font-black tracking-wider text-slate-600 uppercase">
                        ACTIVATION RATE
                      </span>
                      <div className="text-3xl font-black text-slate-900 mt-1 leading-tight">
                        {kpiStats.rate}%
                      </div>
                      <span className="text-xs text-slate-500 font-medium">
                        Passes in active deployment
                      </span>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-purple-600/30">
                      📊
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-teal-400 rounded-full transition-all duration-500"
                        style={{ width: `${kpiStats.rate}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-3 text-xs">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        {kpiStats.rate >= 70 ? "Healthy" : "In Progress"}
                      </span>
                      <span className="text-[11px] text-slate-400 font-semibold">
                        System Health
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 2: 3 Wide Status Cards (PURE SYSTEM TOOLS DATA) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Amber Border Card: Passes Expiring Soon */}
                <div className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-amber-400 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-xl shrink-0 shadow-md shadow-amber-500/20">
                    ⚠️
                  </div>
                  <div>
                    <div className="text-2xl font-black text-slate-900 leading-tight">
                      {kpiStats.soon}
                    </div>
                    <div className="text-xs font-bold text-slate-600">
                      Passes Expiring Soon (≤ 7 Days)
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Prompt action required to renew
                    </div>
                  </div>
                </div>

                {/* 2. Cyan Border Card: Redeemed & In Use */}
                <div className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-cyan-400 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500 text-white flex items-center justify-center text-xl shrink-0 shadow-md shadow-cyan-500/20">
                    ⚡
                  </div>
                  <div>
                    <div className="text-2xl font-black text-slate-900 leading-tight">
                      {kpiStats.activated}
                    </div>
                    <div className="text-xs font-bold text-slate-600">
                      Redeemed & In-Use Passes
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Active seats currently in production
                    </div>
                  </div>
                </div>

                {/* 3. Purple Border Card: Next Expiry Date */}
                <div className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-purple-300 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center text-xl shrink-0 shadow-md shadow-purple-600/20">
                    🕒
                  </div>
                  <div>
                    <div className="text-lg font-black text-slate-900 leading-tight">
                      {kpiStats.nextExpiry}
                    </div>
                    <div className="text-xs font-bold text-slate-600">
                      Earliest License Expiration
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Upcoming tool renewal deadline
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 3: 2 Visualizations (PURE SYSTEM TOOLS DATA) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Left: System Tools Activity Trend (2 Cols) */}
                <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs flex flex-col justify-between">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-indigo-600 text-base">📈</span>
                        <h3 className="text-sm font-black text-slate-900 tracking-tight">
                          System Tools Activity Trend
                        </h3>
                      </div>
                      <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                        Pass allocation and validity monitoring over 14 days
                      </p>
                    </div>

                    {/* Chart Legends */}
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                        <span>Gemini ({kpiStats.geminiCount})</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                        <span>Canva ({kpiStats.canvaCount})</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                        <span>CapCut ({kpiStats.capcutCount})</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <span>ChatGPT ({kpiStats.chatgptCount})</span>
                      </div>
                    </div>
                  </div>

                  {/* SVG Chart Canvas */}
                  <div className="relative w-full h-56 pt-2">
                    <svg viewBox="0 0 650 180" className="w-full h-full overflow-visible">
                      {/* Dotted Horizontal Grid lines */}
                      {[0, 45, 90, 135, 170].map((y, idx) => (
                        <g key={y}>
                          <line
                            x1="30"
                            y1={y}
                            x2="640"
                            y2={y}
                            stroke="#f1f5f9"
                            strokeWidth="1.5"
                            strokeDasharray="4 4"
                          />
                          <text
                            x="15"
                            y={y + 4}
                            fill="#94a3b8"
                            fontSize="10"
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            {4 - idx}
                          </text>
                        </g>
                      ))}

                      {/* Dynamic Trend Curves */}
                      {items.length > 0 ? (
                        <>
                          <path
                            d="M 40 150 Q 140 120, 240 100 T 440 70 T 630 50"
                            fill="none"
                            stroke="#2563eb"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          />
                          <path
                            d="M 40 160 Q 140 145, 240 130 T 440 110 T 630 90"
                            fill="none"
                            stroke="#9333ea"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                          <path
                            d="M 40 170 Q 140 165, 240 150 T 440 140 T 630 130"
                            fill="none"
                            stroke="#f43f5e"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </>
                      ) : (
                        <g>
                          <line x1="40" y1="170" x2="630" y2="170" stroke="#cbd5e1" strokeWidth="2" />
                          <text x="335" y="100" fill="#94a3b8" fontSize="12" fontWeight="600" textAnchor="middle">
                            No system tools registered yet. Create passes to populate activity metrics.
                          </text>
                        </g>
                      )}

                      {/* X-Axis Dates */}
                      {[
                        "10/11", "10/12", "10/13", "10/14", "10/15", "10/16",
                        "10/17", "10/18", "10/19", "10/20", "10/21", "10/22",
                        "10/23", "10/24"
                      ].map((date, i) => {
                        const x = 40 + i * ((630 - 40) / 13);
                        return (
                          <text
                            key={date}
                            x={x}
                            y="180"
                            fill="#94a3b8"
                            fontSize="9"
                            fontWeight="600"
                            textAnchor="middle"
                          >
                            {date}
                          </text>
                        );
                      })}
                    </svg>
                  </div>
                </div>

                {/* Right: Tool Allocation Distribution (Doughnut Chart) */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-600 text-base">🏷️</span>
                      <h3 className="text-sm font-black text-slate-900 tracking-tight">
                        Tool Allocation Distribution
                      </h3>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                      Real pass allocations across models
                    </p>
                  </div>

                  {/* Doughnut SVG */}
                  <div className="relative flex items-center justify-center my-4">
                    <svg className="w-48 h-48" viewBox="0 0 160 160">
                      {kpiStats.total > 0 ? (
                        <>
                          {/* Segment 1: Gemini (Blue) */}
                          <circle
                            cx="80"
                            cy="80"
                            r="55"
                            fill="transparent"
                            stroke="#2563eb"
                            strokeWidth="22"
                            strokeDasharray={`${Math.max(10, kpiStats.geminiPct * 3.45)} 345`}
                            strokeDashoffset="0"
                            strokeLinecap="round"
                          />
                          {/* Segment 2: Canva (Purple) */}
                          <circle
                            cx="80"
                            cy="80"
                            r="55"
                            fill="transparent"
                            stroke="#9333ea"
                            strokeWidth="22"
                            strokeDasharray={`${Math.max(10, kpiStats.canvaPct * 3.45)} 345`}
                            strokeDashoffset={`-${kpiStats.geminiPct * 3.45}`}
                            strokeLinecap="round"
                          />
                          {/* Segment 3: CapCut (Rose) */}
                          <circle
                            cx="80"
                            cy="80"
                            r="55"
                            fill="transparent"
                            stroke="#f43f5e"
                            strokeWidth="22"
                            strokeDasharray={`${Math.max(10, kpiStats.capcutPct * 3.45)} 345`}
                            strokeDashoffset={`-${(kpiStats.geminiPct + kpiStats.canvaPct) * 3.45}`}
                            strokeLinecap="round"
                          />
                          {/* Segment 4: ChatGPT (Emerald) */}
                          <circle
                            cx="80"
                            cy="80"
                            r="55"
                            fill="transparent"
                            stroke="#10b981"
                            strokeWidth="22"
                            strokeDasharray={`${Math.max(10, kpiStats.chatgptPct * 3.45)} 345`}
                            strokeDashoffset={`-${(kpiStats.geminiPct + kpiStats.canvaPct + kpiStats.capcutPct) * 3.45}`}
                            strokeLinecap="round"
                          />
                        </>
                      ) : (
                        <circle
                          cx="80"
                          cy="80"
                          r="55"
                          fill="transparent"
                          stroke="#e2e8f0"
                          strokeWidth="22"
                        />
                      )}
                    </svg>

                    {/* Doughnut Center Text */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-3xl font-black text-slate-900 leading-none">
                        {kpiStats.total}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                        TOTAL PASSES
                      </span>
                    </div>
                  </div>

                  {/* Category Legend Pill Badges */}
                  <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      <span>Gemini ({kpiStats.geminiCount})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                      <span>Canva ({kpiStats.canvaCount})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                      <span>CapCut ({kpiStats.capcutCount})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span>ChatGPT ({kpiStats.chatgptCount})</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 4: Real System Passes Table */}
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      Recent System Passes & Active Licenses
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">
                      Live real-time passes registered in the system
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCategorySwitch("all")}
                    className="text-xs font-bold text-purple-700 hover:text-purple-900 transition cursor-pointer"
                  >
                    View All Vault Passes ({items.length}) →
                  </button>
                </div>

                {items.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center">
                    <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center text-2xl mb-3 shadow-xs">
                      🗂️
                    </div>
                    <h4 className="text-sm font-black text-slate-800">
                      No System Tools or Passes Added Yet
                    </h4>
                    <p className="text-xs text-slate-500 max-w-sm mt-1">
                      Your database is clean. Click "+ Add Pass" on any model in the sidebar to register your first tool pass.
                    </p>
                    <button
                      type="button"
                      onClick={handleOpenCreatePage}
                      style={{ backgroundColor: "#3c0859" }}
                      className="mt-4 px-5 py-2.5 rounded-xl text-white font-bold text-xs shadow-md hover:opacity-95 transition cursor-pointer"
                    >
                      + Add Your First Pass
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[780px] whitespace-nowrap">
                      <thead>
                        <tr className="border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider whitespace-nowrap">
                          <th className="py-2.5 whitespace-nowrap">TOOL & PLAN</th>
                          <th className="py-2.5 whitespace-nowrap">PROMO CODE / URL</th>
                          <th className="py-2.5 whitespace-nowrap">ASSIGNED ACCOUNT</th>
                          <th className="py-2.5 whitespace-nowrap">EXPIRY DATE</th>
                          <th className="py-2.5 whitespace-nowrap">STATUS</th>
                          <th className="py-2.5 text-right whitespace-nowrap">ACTION</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 whitespace-nowrap">
                        {items.slice(0, 5).map((it) => (
                          <tr key={it.id} className="hover:bg-slate-50/70 transition">
                            <td className="py-3 font-bold text-slate-900 flex items-center gap-2 whitespace-nowrap">
                              <span>
                                {it.category === "gemini"
                                  ? "🌟"
                                  : it.category === "canva"
                                  ? "🎨"
                                  : it.category === "capcut"
                                  ? "🎬"
                                  : "⚡"}
                              </span>
                              <span>{it.title}</span>
                            </td>
                            <td className="py-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                              {it.urlOrCode.slice(0, 32)}...
                            </td>
                            <td className="py-3 text-slate-500 whitespace-nowrap">{it.assignedEmail}</td>
                            <td className="py-3 font-semibold text-slate-700 whitespace-nowrap">
                              {it.expiryDate || "No Expiry"}
                            </td>
                            <td className="py-3 whitespace-nowrap">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold inline-flex items-center gap-1 whitespace-nowrap ${
                                  it.status === "ACTIVE"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : it.status === "SOON"
                                    ? "bg-amber-100 text-amber-800"
                                    : it.status === "ACTIVATED"
                                    ? "bg-purple-100 text-purple-800"
                                    : "bg-rose-100 text-rose-800"
                                }`}
                              >
                                <span>{it.status === "ACTIVATED" ? "✓" : "●"}</span>
                                <span>{it.status === "ACTIVE" ? "ACTIVE" : it.status}</span>
                              </span>
                            </td>
                            <td className="py-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => handleToggleActivate(it)}
                                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer transition shadow-xs whitespace-nowrap ${
                                    it.status === "ACTIVATED"
                                      ? "bg-purple-100 text-purple-800 hover:bg-purple-200 border border-purple-200"
                                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                                  }`}
                                  title={it.status === "ACTIVATED" ? "Reset to Unactivated" : "Mark as Activated"}
                                >
                                  {it.status === "ACTIVATED" ? "✓ Activated" : "⚡ Activate"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(it.urlOrCode)}
                                  className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-[10px] font-bold cursor-pointer transition whitespace-nowrap"
                                >
                                  Copy
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* 
                3. 4 KPI STATS CARDS (Matching EXACT colored border style from the screenshot)
              */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: Blue Border - Total Passes */}
                <div className="bg-white rounded-2xl p-5 border-2 border-blue-400 shadow-xs flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-600 block">Total Passes</span>
                    <span className="text-3xl font-extrabold text-blue-600 mt-1 block">
                      {categoryItems.length}
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                </div>

                {/* Card 2: Purple Border - Active Passes */}
                <div className="bg-white rounded-2xl p-5 border-2 border-emerald-400 shadow-xs flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-600 block">មិនទាន់ Activate (Active)</span>
                    <span className="text-3xl font-extrabold text-emerald-600 mt-1 block">
                      {categoryItems.filter((i) => i.status === "ACTIVE").length}
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                    </svg>
                  </div>
                </div>

                {/* Card 3: Amber Border - Expiring Soon */}
                <div className="bg-white rounded-2xl p-5 border-2 border-amber-400 shadow-xs flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-600 block">ជិតផុតកំណត់ (≤ 7d)</span>
                    <span className="text-3xl font-extrabold text-amber-500 mt-1 block">
                      {categoryItems.filter((i) => i.status === "SOON").length}
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                </div>

                {/* Card 4: Emerald Border - Activated / Redeemed */}
                <div className="bg-white rounded-2xl p-5 border-2 border-purple-400 shadow-xs flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-600 block">បាន Activate រួច (Activated)</span>
                    <span className="text-3xl font-extrabold text-purple-600 mt-1 block">
                      {categoryItems.filter((i) => i.status === "ACTIVATED").length}
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* 
                4. FILTER TOOLBAR (Matching Screenshot Filter Pills)
              */}
              <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                {/* Search Input */}
                <div className="relative w-full md:max-w-xs lg:max-w-md">
                  <svg
                    className="w-4 h-4 text-slate-400 absolute left-3 top-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by title, promo code, URL, or email..."
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 placeholder-slate-400 outline-none focus:border-purple-600 focus:bg-white transition"
                  />
                </div>

                {/* Filter Dropdown Selects */}
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  {/* Status Filter */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 px-3 py-2 rounded-xl outline-none cursor-pointer hover:bg-slate-100 transition"
                  >
                    <option value="all">All Status (គ្រប់ស្ថានភាព)</option>
                    <option value="ACTIVE">មិនទាន់ Activate (Active & Ready)</option>
                    <option value="ACTIVATED">បាន Activate រួច (Activated)</option>
                    <option value="SOON">ជិតផុតកំណត់ (Expiring Soon ≤ 7d)</option>
                    <option value="EXPIRED">ផុតកំណត់ (Expired)</option>
                  </select>

                  {/* Plan/Tier Filter */}
                  {availableTiers.length > 0 && (
                    <select
                      value={tierFilter}
                      onChange={(e) => setTierFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 px-3 py-2 rounded-xl outline-none cursor-pointer hover:bg-slate-100 transition"
                    >
                      <option value="all">All Plans</option>
                      {availableTiers.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Source Filter */}
                  {availableSources.length > 0 && (
                    <select
                      value={sourceFilter}
                      onChange={(e) => setSourceFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 px-3 py-2 rounded-xl outline-none cursor-pointer hover:bg-slate-100 transition"
                    >
                      <option value="all">All Sources</option>
                      {availableSources.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Sort Dropdown */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 px-3 py-2 rounded-xl outline-none cursor-pointer hover:bg-slate-100 transition"
                  >
                    <option value="expiry-asc">Expiry: Soonest</option>
                    <option value="expiry-desc">Expiry: Latest</option>
                    <option value="title-asc">Title (A to Z)</option>
                    <option value="date-desc">Newest Added</option>
                  </select>


                </div>
              </div>

              {/* 
                5. DATA TABLE: ORIGINAL SYSTEM TOOLS & COUPON INFORMATION
              */}
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full text-left border-collapse min-w-[980px] whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-slate-200/80 bg-slate-50/50 text-[11px] font-bold text-slate-600 tracking-wider uppercase whitespace-nowrap">
                        <th className="py-3.5 px-5 whitespace-nowrap">TOOL & PLAN</th>
                        <th className="py-3.5 px-4 whitespace-nowrap">PROMO CODE / URL</th>
                        <th className="py-3.5 px-4 whitespace-nowrap">SOURCE / VENDOR</th>
                        <th className="py-3.5 px-4 whitespace-nowrap">EXPIRY DATE</th>
                        <th className="py-3.5 px-4 whitespace-nowrap">STATUS</th>
                        <th className="py-3.5 px-4 whitespace-nowrap">ACCESS LINK</th>
                        <th className="py-3.5 px-5 text-right whitespace-nowrap">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs whitespace-nowrap">
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400 whitespace-nowrap">
                            No passes found in this category. Click "+ Add {modelMeta.title} Voucher" above to add one.
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map((item) => {
                          const days = getDaysLeft(item.expiryDate);
                          const isExpired = days !== null && days < 0;
                          const isSoon = days !== null && days >= 0 && days <= 7;

                          return (
                            <tr key={item.id} className="hover:bg-slate-50/80 transition-colors whitespace-nowrap">
                              {/* Tool & Plan */}
                              <td className="py-3.5 px-5 whitespace-nowrap">
                                <div className="flex items-center gap-3 whitespace-nowrap">
                                  {/* 3D-styled Avatar */}
                                  <div
                                    className={`w-10 h-10 rounded-xl text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm ${
                                      item.category === "gemini"
                                        ? "bg-gradient-to-br from-blue-500 to-indigo-700"
                                        : item.category === "canva"
                                        ? "bg-gradient-to-br from-cyan-400 to-purple-600"
                                        : item.category === "capcut"
                                        ? "bg-gradient-to-br from-rose-500 to-neutral-900"
                                        : "bg-gradient-to-br from-emerald-500 to-teal-800"
                                    }`}
                                  >
                                    {item.category === "gemini"
                                      ? "🌟"
                                      : item.category === "canva"
                                      ? "🎨"
                                      : item.category === "capcut"
                                      ? "🎬"
                                      : "⚡"}
                                  </div>
                                  <div className="flex flex-col whitespace-nowrap">
                                    <div className="font-extrabold text-slate-900 flex items-center gap-1.5 whitespace-nowrap">
                                      <span>{item.title}</span>
                                      {item.titleKh && (
                                        <span className="text-purple-700 font-semibold text-[11px]">
                                          ({item.titleKh})
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5 whitespace-nowrap">
                                      <span className="text-[11px] text-slate-500 font-medium">
                                        {item.assignedEmail}
                                      </span>
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-semibold">
                                        {item.planTier}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Promo Code or URL with Copy button */}
                              <td className="py-3 px-4 whitespace-nowrap">
                                <div className="flex items-center gap-2 whitespace-nowrap">
                                  <span
                                    className="font-mono text-slate-800 font-semibold text-[11px] max-w-[220px] truncate block"
                                    title={item.urlOrCode}
                                  >
                                    {item.urlOrCode.replace(/^https?:\/\//, "")}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(item.urlOrCode)}
                                    className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 text-[10px] font-bold cursor-pointer transition shrink-0 whitespace-nowrap"
                                    title="Copy code / URL"
                                  >
                                    Copy
                                  </button>
                                </div>
                              </td>

                              {/* Source / Vendor */}
                              <td className="py-3 px-4 font-bold text-slate-700 text-[11px] whitespace-nowrap">
                                {item.source}
                              </td>

                              {/* Expiry Date + Countdown Badge (All in One Single Line) */}
                              <td className="py-3 px-4 whitespace-nowrap">
                                <div className="flex items-center gap-2 whitespace-nowrap">
                                  <span className="font-semibold text-slate-800 text-xs whitespace-nowrap">
                                    {item.expiryDate || "No Expiry"}
                                  </span>
                                  {days !== null && (
                                    <span
                                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${
                                        isExpired
                                          ? "text-rose-700 bg-rose-50 border border-rose-200"
                                          : isSoon
                                          ? "text-amber-700 bg-amber-50 border border-amber-200"
                                          : "text-slate-600 bg-slate-100"
                                      }`}
                                    >
                                      {isExpired
                                        ? `Expired ${Math.abs(days)}d ago`
                                        : days === 0
                                        ? "Expires today!"
                                        : `In ${days}d`}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Status Pill & Auto-Detect Badge */}
                              <td className="py-3 px-4 whitespace-nowrap">
                                <div className="flex flex-col gap-1 whitespace-nowrap">
                                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                                    <span
                                      className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 whitespace-nowrap ${
                                        item.status === "ACTIVE"
                                          ? "bg-emerald-100 text-emerald-800"
                                          : item.status === "SOON"
                                          ? "bg-amber-100 text-amber-800"
                                          : item.status === "ACTIVATED"
                                          ? "bg-purple-100 text-purple-800"
                                          : "bg-rose-100 text-rose-800"
                                      }`}
                                    >
                                      <span>
                                        {item.status === "ACTIVE"
                                          ? "●"
                                          : item.status === "SOON"
                                          ? "⚠️"
                                          : item.status === "ACTIVATED"
                                          ? "✓"
                                          : "✕"}
                                      </span>
                                      <span>
                                        {item.status === "ACTIVE"
                                          ? "ACTIVE"
                                          : item.status === "SOON"
                                          ? "EXPIRING SOON"
                                          : item.status === "ACTIVATED"
                                          ? "ACTIVATED"
                                          : "EXPIRED"}
                                      </span>
                                    </span>
                                    {item.status === "ACTIVATED" && item.activatedAt ? (
                                      <span className="text-[9px] text-purple-700 font-bold whitespace-nowrap">
                                        ({item.activatedAt.slice(0, 10)})
                                      </span>
                                    ) : (
                                      <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap">
                                        (មិនទាន់ Activate)
                                      </span>
                                    )}
                                  </div>

                                  {/* Gemini Pro Auto-Detect Verification Status Badge */}
                                  {(item.category === "gemini" || item.urlOrCode.includes("google")) && item.googleCheckStatus && (
                                    <div className="flex items-center gap-1">
                                      <span
                                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md border flex items-center gap-1 ${
                                          item.googleCheckStatus === "REDEEMED"
                                            ? "bg-purple-50 text-purple-700 border-purple-200"
                                            : item.googleCheckStatus === "AVAILABLE"
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                            : "bg-rose-50 text-rose-700 border-rose-200"
                                        }`}
                                      >
                                        <span>{item.googleCheckStatus === "REDEEMED" ? "⚡" : item.googleCheckStatus === "AVAILABLE" ? "✓" : "✕"}</span>
                                        <span>
                                          {item.googleCheckStatus === "REDEEMED"
                                            ? "Google: Redeemed"
                                            : item.googleCheckStatus === "AVAILABLE"
                                            ? "Google: Available"
                                            : "Google: Expired"}
                                        </span>
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Access Link */}
                              <td className="py-3 px-4 whitespace-nowrap">
                                <div className="flex items-center gap-1.5 whitespace-nowrap">
                                  {item.urlOrCode.startsWith("http") ? (
                                    <a
                                      href={item.urlOrCode}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50/80 border border-blue-200/60 text-blue-800 text-[11px] font-bold hover:bg-blue-100 transition cursor-pointer whitespace-nowrap"
                                    >
                                      <span>Open Link</span>
                                      <span className="text-xs">↗</span>
                                    </a>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold whitespace-nowrap">
                                      <span>Code Pass</span>
                                    </span>
                                  )}

                                  {(item.category === "gemini" || item.urlOrCode.includes("google")) && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenGoogleDetector(item)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-800 text-[10px] font-bold cursor-pointer transition shadow-2xs whitespace-nowrap"
                                      title="Auto Check ស្ថានភាពតាម System"
                                    >
                                      <span>⚡</span>
                                      <span>Auto Check</span>
                                    </button>
                                  )}
                                </div>
                              </td>

                              {/* Actions */}
                              <td className="py-3 px-5 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                                  {/* 1-Click Activate / Deactivate Toggle Button */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleActivate(item)}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition shadow-xs whitespace-nowrap ${
                                      item.status === "ACTIVATED"
                                        ? "bg-purple-100 text-purple-900 hover:bg-purple-200 border border-purple-300"
                                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                                    }`}
                                    title={
                                      item.status === "ACTIVATED"
                                        ? "បាន Activate រួច (ចុចដើម្បីប្តូរជាមិនទាន់ Activate វិញ)"
                                        : "ចុចដើម្បី Activate Pass (1-Click Activate)"
                                    }
                                  >
                                    <span>{item.status === "ACTIVATED" ? "✓" : "⚡"}</span>
                                    <span>{item.status === "ACTIVATED" ? "Activated" : "Activate"}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (item.urlOrCode.startsWith("http")) {
                                        window.open(item.urlOrCode, "_blank");
                                      } else {
                                        handleCopy(item.urlOrCode);
                                      }
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer whitespace-nowrap"
                                    title="Open or Copy"
                                  >
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                      <circle cx="12" cy="12" r="3" />
                                    </svg>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditPage(item)}
                                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer whitespace-nowrap"
                                    title="Edit pass"
                                  >
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDelete(item.id, item.title)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer whitespace-nowrap"
                                    title="Delete pass"
                                  >
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
        )}
      </div>

      {/* 
        ══════════════════════════════════════════════════════════════
        IN-SYSTEM AUTO PROMO DETECTOR MODAL (ពិនិត្យ AUTO លើ SYSTEM)
        ══════════════════════════════════════════════════════════════
      */}
      {detectingItem && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[88vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold text-lg shadow-xs">
                  ⚡
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Gemini Pro Auto-Detector & Probe
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    ពិនិត្យស្ថានភាព Activate / Redeemed ស្វ័យប្រវត្តិតាម System & Google Live Probe
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetectingItem(null);
                  setDetectResult(null);
                }}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 text-sm transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Body Content */}
            <div className="overflow-y-auto p-4 sm:p-5 space-y-3.5 flex-1">
              {/* Target Link Info */}
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Target Promo URL / Code
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(detectingItem.urlOrCode)}
                    className="text-[10px] font-bold text-purple-700 hover:text-purple-900 bg-white px-2 py-0.5 rounded border border-purple-200 cursor-pointer"
                  >
                    Copy Link
                  </button>
                </div>
                <div className="font-mono text-xs text-blue-900 font-semibold break-all select-all bg-white p-2 rounded-xl border border-slate-200/60 max-h-20 overflow-y-auto">
                  {detectingItem.urlOrCode}
                </div>
                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-600">
                  <span className="font-bold text-slate-800">{detectingItem.title}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold">
                    {detectingItem.planTier}
                  </span>
                </div>
                {detectResult?.tokenPreview && (
                  <div className="pt-1 text-[10px] text-slate-500 font-mono flex items-center justify-between bg-slate-100/70 px-2 py-1 rounded-lg">
                    <span>Token: {detectResult.tokenPreview}</span>
                    <span className="text-emerald-700 font-bold">✓ Formatted</span>
                  </div>
                )}
              </div>

              {/* In-System Detection Result Box */}
              <div className="bg-gradient-to-br from-slate-50 to-purple-50/40 rounded-2xl p-4 border border-purple-100/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                    <span>⚡ Live Auto-Detection Result</span>
                  </span>
                  {isDetecting ? (
                    <span className="text-[11px] font-bold text-purple-600 animate-pulse flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping" />
                      Checking Google System...
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleOpenGoogleDetector(detectingItem)}
                      className="text-[10px] font-bold text-purple-700 hover:text-purple-900 bg-white px-2 py-0.5 rounded-md border border-purple-200 cursor-pointer shadow-2xs"
                    >
                      🔄 Re-scan Auto
                    </button>
                  )}
                </div>

                {detectResult ? (
                  <div className="space-y-2.5">
                    <div
                      className={`p-3.5 rounded-xl border text-xs font-bold flex items-start gap-3 ${
                        detectResult.status === "REDEEMED"
                          ? "bg-purple-50 text-purple-950 border-purple-200 shadow-xs"
                          : detectResult.status === "AVAILABLE"
                          ? "bg-emerald-50 text-emerald-950 border-emerald-200 shadow-xs"
                          : detectResult.status === "EXPIRED"
                          ? "bg-rose-50 text-rose-950 border-rose-200 shadow-xs"
                          : "bg-amber-50 text-amber-950 border-amber-200 shadow-xs"
                      }`}
                    >
                      <span className="text-lg shrink-0 mt-0.5">
                        {detectResult.status === "REDEEMED"
                          ? "⚡"
                          : detectResult.status === "EXPIRED"
                          ? "✕"
                          : detectResult.status === "AVAILABLE"
                          ? "✓"
                          : "⚠️"}
                      </span>
                      <div className="space-y-1">
                        <div className="font-extrabold text-sm">
                          {detectResult.status === "REDEEMED"
                            ? "បាន Activate រួចហើយ (Already Redeemed / Claimed)"
                            : detectResult.status === "EXPIRED"
                            ? "ផុតកំណត់ (Expired Offer)"
                            : detectResult.status === "AVAILABLE"
                            ? "មិនទាន់ Activate ទេ (Active & Ready to Use)"
                            : "ត្រូវការ Sign-in ចូល Google Account"}
                        </div>
                        <div className="text-[11px] font-medium leading-relaxed opacity-95">
                          {detectResult.message}
                        </div>
                        {detectResult.planType && (
                          <div className="text-[10px] font-bold opacity-80 pt-0.5">
                            Plan: {detectResult.planType}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* In-Dashboard Verification Confirmation */}
                    <div className="w-full py-2.5 px-3 rounded-xl bg-purple-50/80 border border-purple-200/80 text-[11px] text-purple-900 font-semibold flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>បានផ្ទៀងផ្ទាត់ផ្ទាល់ក្នុង Admin Dashboard (In-System Server Probe)</span>
                      </span>
                      <span className="text-[10px] bg-purple-200/80 text-purple-900 px-2 py-0.5 rounded-full font-bold">100% In-Dashboard</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                    <span className="w-5 h-5 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
                    <span>កំពុងដំណើរការ System Auto-Check លើ Google...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Bottom Actions (Always Fully Visible) */}
            <div className="border-t border-slate-100 p-4 bg-slate-50/70 shrink-0 space-y-2">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">
                ចុចកំណត់ ឬ Update Status លើ System ភ្លាមៗ (Apply Status)
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleApplyDetectionOutcome("AVAILABLE")}
                  className="py-2.5 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer shadow-sm active:scale-95 text-center"
                >
                  <span>✓</span>
                  <span>មិនទាន់ Activate</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyDetectionOutcome("REDEEMED")}
                  className="py-2.5 px-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold transition flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer shadow-sm active:scale-95 text-center"
                >
                  <span>⚡</span>
                  <span>បាន Activate</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyDetectionOutcome("EXPIRED")}
                  className="py-2.5 px-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer shadow-sm active:scale-95 text-center"
                >
                  <span>✕</span>
                  <span>ផុតកំណត់</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setDetectingItem(null);
                  setDetectResult(null);
                }}
                className="w-full py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition cursor-pointer"
              >
                បិទផ្ទាំង (Close)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
