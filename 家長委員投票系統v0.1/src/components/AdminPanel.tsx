import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Key, RefreshCw, AlertTriangle, Play, CheckCircle, Save, Settings, Users, FileText, 
  Download, Sparkles, Plus, Trash2, Link, ShieldCheck, ChevronRight, HelpCircle, Archive, ClipboardList
} from "lucide-react";
import { DatabaseState, ParentRep } from "../types";

interface AdminPanelProps {
  onBackToHub: () => void;
}

export function AdminPanel({ onBackToHub }: AdminPanelProps) {
  const [dbState, setDbState] = useState<DatabaseState | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"control" | "keys" | "rules" | "minutes">("control");
  const [searchKeyQuery, setSearchKeyQuery] = useState("");
  
  // Sibling custom household link form
  const [sibKeyA, setSibKeyA] = useState("");
  const [sibKeyB, setSibKeyB] = useState("");

  // Special Ed setup form
  const [spedName, setSpedName] = useState("");
  const [spedClass, setSpedClass] = useState("");
  const [spedChild, setSpedChild] = useState("");

  // Lottery Spinner state
  const [showSpinner, setShowSpinner] = useState(false);
  const [spinnerCandidates, setSpinnerCandidates] = useState<any[]>([]);
  const [spinnerType, setSpinnerType] = useState<"grade" | "constant" | "president">("grade");
  const [selectedGradeForDraw, setSelectedGradeForDraw] = useState<number | null>(null);
  const [winnerKey, setWinnerKey] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);

  // Password Verification & Admin Action States
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordFeedback, setPasswordFeedback] = useState("");

  // Check saved session auth state
  useEffect(() => {
    const savedAuth = sessionStorage.getItem("admin_authenticated");
    if (savedAuth === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  // Poll state every 3 seconds to keep admin fully updated
  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchState = async () => {
    try {
      const res = await fetch("/api/state");
      if (res.ok) {
        const data = await res.json();
        setDbState(data);
        if (data && data.config) {
          setSpedName(data.config.specialEdMember.name);
          setSpedClass(data.config.specialEdMember.className);
          setSpedChild(data.config.specialEdMember.childName);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSetRound = async (id: string, active: boolean) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/set-round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId: id, votingActive: active })
      });
      if (res.ok) {
        const data = await res.json();
        setDbState(data.state);
      }
    } catch (e) {
      alert("設定失敗");
    } finally {
      setLoading(false);
    }
  };

  const handleTally = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tally-round", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (res.ok) {
        setDbState(data.state);
        // If tie-breaker re-vote flatly ties again, prompt draw-lots modal immediately!
        if (data.drawLotsRequired) {
          setSpinnerCandidates(data.candidates);
          setSpinnerType(data.type || "grade");
          setSelectedGradeForDraw(data.tiedGrade || null);
          setWinnerKey(null);
          setShowSpinner(true);
        }
      }
    } catch (e) {
      alert("計票結算通報錯誤");
    } finally {
      setLoading(false);
    }
  };

  const handleDrawLots = async () => {
    if (spinnerCandidates.length === 0) return;
    setSpinning(true);
    setWinnerKey(null);

    // Beautiful animated lottery wheel rolling mock: spin keys 15 times before landing on actual random choice
    let currentIdx = 0;
    const interval = setInterval(() => {
      currentIdx = (currentIdx + 1) % spinnerCandidates.length;
      setWinnerKey(spinnerCandidates[currentIdx].key);
    }, 150);

    setTimeout(async () => {
      clearInterval(interval);
      try {
        const res = await fetch("/api/admin/draw-lots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: spinnerType,
            grade: selectedGradeForDraw
          })
        });
        const data = await res.json();
        if (res.ok) {
          setDbState(data.state);
          
          // Re-fetch resolved winner from state
          let actualWinner: string | undefined;
          if (spinnerType === "grade" && selectedGradeForDraw) {
            actualWinner = data.state.config.gradeTieBreakers[selectedGradeForDraw]?.resolvedWinner;
          } else if (spinnerType === "constant") {
            actualWinner = data.state.config.constantTieBreaker?.resolvedWinner;
          } else if (spinnerType === "president") {
            actualWinner = data.state.config.presidentTieBreaker?.resolvedWinner;
          }

          if (actualWinner) {
            // Can be multiple winners if vacancies > 1
            const winners = actualWinner.split(",");
            setWinnerKey(winners[0]); // highlight first lucky land
          }
        }
      } catch (e) {
        alert("抽籤落成錯誤");
      } finally {
        setSpinning(false);
      }
    }, 2800);
  };

  const handleManualAddHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sibKeyA || !sibKeyB || !dbState) return;

    setLoading(true);
    // Find reps
    const repA = dbState.parentReps.find(r => r.key === sibKeyA.trim().toUpperCase());
    const repB = dbState.parentReps.find(r => r.key === sibKeyB.trim().toUpperCase());

    if (!repA || !repB) {
      alert("兩者中至少有一組 Key 無效！");
      setLoading(false);
      return;
    }

    if (!repA.registered || !repB.registered) {
      alert("家戶關聯必須限兩位家長代表皆已『填表完成登記』方可進行！");
      setLoading(false);
      return;
    }

    // Connect them on childName which automatically triggers the household deduplication algorithm based on grade sorting
    try {
      const res = await fetch("/api/admin/manual-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: repB.key,
          className: repB.className,
          parentName: repB.parentName,
          childName: repA.childName, // Force sibling A child name onto child B to link household!
          isWillingCommittee: repB.isWillingCommittee
        })
      });
      if (res.ok) {
        const data = await res.json();
        setDbState(data.state);
        alert(`已成功將 ${repB.parentName} (${repB.className}班) 與 ${repA.parentName} (${repA.className}班) 連結為同一家戶（統一登記學生姓名為 ${repA.childName}），系統已自動除錯保留低年段 ${repA.grade < repB.grade ? repA.parentName : repB.parentName}，並過濾排除高年級方代表。`);
        setSibKeyA("");
        setSibKeyB("");
      }
    } catch (e) {
      alert("連結設定出錯");
    } finally {
      setLoading(false);
    }
  };

  const updateSpecialEd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spedName || !spedClass || !spedChild) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/set-special-ed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: spedName,
          className: spedClass,
          childName: spedChild
        })
      });
      if (res.ok) {
        const data = await res.json();
        setDbState(data.state);
        alert("已重新指派特教家長委員資格，專屬 Key: SPED1 保持生效。");
      }
    } catch (e) {
      alert("更新特教指派失敗");
    } finally {
      setLoading(false);
    }
  };

  const handleSystemReset = async () => {
    if (!window.confirm("確定要【清除所有投票】並重設家長代表清單、密鑰，恢復為全新初始測試庫狀態嗎？此動作不可逆！")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setDbState(data.state);
        alert(data.message);
      }
    } catch (e) {
      alert("重置資料庫錯誤");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    try {
      const res = await fetch("/api/admin/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput })
      });
      const data = await res.json();
      if (data.success) {
        setIsAuthenticated(true);
        sessionStorage.setItem("admin_authenticated", "true");
      } else {
        setPasswordError("後台密碼驗證錯誤，預設密碼為 gppseb！");
      }
    } catch (err) {
      setPasswordError("無法連線至安全性驗證伺服器");
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback("");
    if (!newPassword || newPassword.trim().length === 0) {
      setPasswordFeedback("❌ 新密碼不可為空白！");
      return;
    }
    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword: oldPassword, newPassword: newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordFeedback("✅ " + data.message);
        setOldPassword("");
        setNewPassword("");
        setTimeout(() => {
          setShowPasswordChange(false);
          setPasswordFeedback("");
        }, 2100);
      } else {
        setPasswordFeedback("❌ " + (data.message || "修改失敗"));
      }
    } catch (err) {
      setPasswordFeedback("❌ 伺服器通訊出錯");
    }
  };

  const handleClearAllData = async () => {
    if (!window.confirm("確定要【一鍵清除所有資料】嗎？\n此動作將清空所有家長登記、已圈選選票及當選身份，重置返回首輪註冊階段！此一鍵清除動作極度關鍵且不可逆！")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/clear-all", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setDbState(data.state);
        alert("🧹 " + data.message);
      } else {
        alert("無法清除：" + data.message);
      }
    } catch (err) {
      alert("連線清除失敗");
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateAllVoting = async () => {
    if (!window.confirm("確定要執行【一鍵智慧模擬 124 位代表及三階段投票】嗎？\n\n系統將一鍵自動完成：\n1. 快速註冊並排他過濾全校 124 席家長代表（包括重複及同戶家族過篩等）\n2. 投下首輪年級家長委員選票\n3. 委員計票當選，並接續投下首輪 9 席常務委員選票\n4. 投下本屆關埔國小家長會長選票，直達大選大獲成功！\n\n全部選務看板、統計圖表及組織名冊與會議記錄將立即補齊！")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/simulate-all", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setDbState(data.state);
        alert("⚡ " + data.message);
      } else {
        alert("模擬失敗：" + data.message);
      }
    } catch (err) {
      alert("連線智慧模擬伺服器失敗");
    } finally {
      setLoading(false);
    }
  };

  const exportCodebookMarkdown = () => {
    if (!dbState) return;
    let markdown = `# 家長委員投票識別碼通知清冊 (密鑰 Codebook)\n\n| 班級 | 代表子女 | 家長姓名 | 填報狀態 | 登入亂碼識別碼 (5碼 Key) |\n|---|---|---|---|---|\n`;
    dbState.parentReps.forEach(r => {
      markdown += `| ${r.className || "空"} | ${r.childName || "空"} | ${r.parentName || "空"} | ${r.registered ? "已登錄" : "未登錄"} | **${r.key}** |\n`;
    });
    
    // Create download
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "家長代表識別碼選冊.md");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-8 shadow-2xl space-y-6"
        >
          <div className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 bg-blue-500/10 border border-blue-500/30 rounded-full flex items-center justify-center text-blue-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">教育管理後台・安全驗證</h2>
            <p className="text-xs text-slate-400 leading-relaxed font-semibold">
              新竹市東區關埔國民小學
            </p>
          </div>

          <form onSubmit={handleVerifyPasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase font-mono tracking-wider">
                請輸入安全登入密碼 (預設: gppseb)
              </label>
              <input 
                type="password"
                placeholder="••••••"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono text-center tracking-widest text-lg"
                autoFocus
              />
            </div>

            {passwordError && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg font-medium"
              >
                {passwordError}
              </motion.div>
            )}

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={onBackToHub}
                className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer border border-slate-700 transition"
              >
                返回大廳
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold cursor-pointer transition shadow-md shadow-blue-500/10"
              >
                驗證登入
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    );
  }

  if (!dbState) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 text-blue-600 animate-spin" />
        <span className="ml-3 font-semibold text-slate-800">同步中控系統...</span>
      </div>
    );
  }

  const currentRound = dbState.config.currentRoundId;
  const isVotingChannelOpen = dbState.config.votingActive;

  // Filter keys table
  const filteredRepsList = dbState.parentReps.filter(r => {
    if (!searchKeyQuery) return true;
    const q = searchKeyQuery.toLowerCase().trim();
    return (
      r.key.toLowerCase().includes(q) ||
      r.parentName.toLowerCase().includes(q) ||
      r.childName.toLowerCase().includes(q) ||
      r.className.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-sm mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-500 text-slate-950 font-bold px-2.5 py-0.5 rounded text-xs">
              SECRET ADMIN
            </span>
            <span className="text-xs text-slate-400 font-mono">
              DB_FILE: data_store.json (持續在線上同步)
            </span>
          </div>
          <h2 id="admin-system-title" className="text-2xl font-black mt-2 flex items-center gap-2">
            <Settings className="text-blue-400 h-6 w-6 shrink-0" />
            家長委員選舉中控後台 (教育管理埠)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            供老師及家長會代表進行密鑰分配、資格初審除錯、跨階段控制、同票命運抽籤和會務紀錄匯出。
          </p>
        </div>

        <div className="flex flex-wrap gap-2 justify-end items-center">
          {/* Simulate Action */}
          <button
            id="btn-admin-simulate"
            onClick={handleSimulateAllVoting}
            disabled={loading}
            className="px-3 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-extrabold cursor-pointer transition-all duration-200 shadow-md shadow-violet-900/30 flex items-center gap-1 shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5" /> 一鍵模擬124位家長代表與投票
          </button>

          {/* Clear Action */}
          <button
            id="btn-admin-clear"
            onClick={handleClearAllData}
            disabled={loading}
            className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-extrabold cursor-pointer transition-colors shrink-0"
          >
            一鍵清除所有資料
          </button>

          {/* Change Password Trigger */}
          <button
            id="btn-admin-change-pass"
            onClick={() => setShowPasswordChange(!showPasswordChange)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors shrink-0"
          >
            變更後台密碼
          </button>

          {/* Fallback original reset */}
          <button
            id="btn-admin-reset"
            onClick={handleSystemReset}
            className="px-3 py-2 bg-rose-950 hover:bg-rose-905 text-rose-200 border border-rose-800 rounded-xl text-xs font-semibold cursor-pointer transition-colors shrink-0"
            title="將資料重設並回復初始內建部分註冊的示範資料"
          >
            重置為預設示範庫
          </button>

          <button
            id="btn-admin-exit"
            onClick={onBackToHub}
            className="px-4 py-2 bg-slate-950 hover:bg-slate-900 text-slate-300 rounded-xl text-xs font-bold cursor-pointer border border-slate-800 shrink-0"
          >
            返回系統主頁
          </button>
        </div>
      </div>

      {/* Password Change Form Section */}
      <AnimatePresence>
        {showPasswordChange && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-6"
          >
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-inner">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-3">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                變更管理者安全登入密碼
              </h3>
              <form onSubmit={handleChangePasswordSubmit} className="flex flex-col sm:flex-row items-end gap-3 max-w-2xl">
                <div className="w-full sm:flex-1">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">當前舊密碼：</label>
                  <input
                    type="password"
                    placeholder="預設為 gppseb"
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div className="w-full sm:flex-1">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">全新新密碼：</label>
                  <input
                    type="password"
                    placeholder="輸入自訂新密碼"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
                >
                  確認修改密碼
                </button>
              </form>
              {passwordFeedback && (
                <p className="text-xs font-semibold mt-2.5">{passwordFeedback}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-px mb-6 overflow-x-auto">
        <button
          id="tab-control-panel"
          onClick={() => setActiveTab("control")}
          className={`px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 cursor-pointer border-b-2 transition-all ${
            activeTab === "control"
              ? "border-blue-600 text-blue-600 font-black"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Play className="h-4.5 w-4.5" /> 會務投票中控
        </button>
        <button
          id="tab-keys-ledger"
          onClick={() => setActiveTab("keys")}
          className={`px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 cursor-pointer border-b-2 transition-all ${
            activeTab === "keys"
              ? "border-blue-600 text-blue-600 font-black"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Key className="h-4.5 w-4.5" /> 124 席識別碼清冊
        </button>
        <button
          id="tab-rules-ledger"
          onClick={() => setActiveTab("rules")}
          className={`px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 cursor-pointer border-b-2 transition-all ${
            activeTab === "rules"
              ? "border-blue-600 text-blue-600 font-black"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <AlertTriangle className="h-4.5 w-4.5" /> 系統法規除錯核定
        </button>
        <button
          id="tab-minutes-ledger"
          onClick={() => setActiveTab("minutes")}
          className={`px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 cursor-pointer border-b-2 transition-all ${
            activeTab === "minutes"
              ? "border-blue-600 text-blue-600 font-black"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <FileText className="h-4.5 w-4.5" /> 產生會務組織名冊與會議紀錄
        </button>
      </div>

      {/* Tab Area Contents */}
      <AnimatePresence mode="wait">
        {activeTab === "control" && (
          <motion.div
            key="control-tab"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Phase Workflow Progress map */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-base font-bold text-slate-800 border-b pb-3 mb-4 flex items-center gap-2">
                  <Sparkles className="text-blue-600 h-4.5 w-4.5" />
                  大會階段流程推進控制器
                </h3>

                <div className="space-y-4">
                  {[
                    { id: "registration", label: "階段 1: 家長代表登錄登記 & 重複同戶篩選", desc: "開放 124 席家長代表上線用 Key 綁定基本資料，系統在後台實時判定並篩選各年段合規之投票與被參選人名冊。" },
                    { id: "grade_committee", label: "階段 2: 各年級第一輪投票（家長委員選舉）", desc: "各學段家長代表登錄後，可以勾選同級且有意願之代表。每代表限投其同級代表，一人限 4 票。" },
                    { id: "grade_tie_breaker", label: "階段 3: 各年級委員同票二輪重選（如無則跳過）", desc: "若有級別最低票數同票形成當選人模糊，則系統在此強制對同票者進行二輪投票，限級代表投遞（每人 1 表）。" },
                    { id: "constant_committee", label: "階段 4: 第二階段常務委員選舉", desc: "從當選之 24 位年級委員與指派之 1 位特教指委，共 25 人中。由 25 委員互選產生 9 名常務委員。（一人圈 1 人）。" },
                    { id: "constant_tie_breaker", label: "階段 5: 常委同票二輪重選 (如平分僵局則備)", desc: "排名第 9 名如遇同票，在此進行常委二輪決投（限家委票圈）。" },
                    { id: "president", label: "階段 6: 第三階段家長會長公投選立", desc: "由 25 位委員，就本屆當選之 9 名常務委員中去圈選出最高的 1 人為會長（每人 1 表）。" },
                    { id: "president_tie_breaker", label: "階段 7: 家長會長同票二輪重選", desc: "會長決戰高票同分時在此作二輪委員決，若再平手則由主席發動命運抽籤決。" },
                    { id: "finished", label: "階段 8: 選舉全會圓滿落幕公佈成冊", desc: "截止通道，鎖死投票數據，顯示會務組織架構表、家長會最高 Roster 與會議紀錄。" }
                  ].map((round) => {
                    const isPassedOrActive = currentRound === round.id;
                    return (
                      <div
                        key={round.id}
                        className={`p-4 rounded-xl border transition-all ${
                          isPassedOrActive
                            ? "border-blue-600 bg-blue-50/20 shadow-sm"
                            : "border-slate-100 bg-slate-50/20"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <h4 className={`text-sm font-bold ${isPassedOrActive ? "text-blue-800 text-base" : "text-slate-700"}`}>
                              {round.label}
                            </h4>
                            <p className="text-xs text-slate-500 mt-1">{round.desc}</p>
                          </div>
                          <div className="shrink-0 flex gap-2">
                            {currentRound === round.id ? (
                              <span className="bg-blue-600 text-white text-xs font-bold font-semibold px-2.5 py-1 rounded-sm flex items-center gap-1">
                                目前活躍
                              </span>
                            ) : (
                              <button
                                id={`btn-set-round-${round.id}`}
                                onClick={() => handleSetRound(round.id, true)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold py-1 px-2.5 rounded-lg border border-slate-200 transition-colors"
                              >
                                設定為此階段
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Voting Center actions & Special-Ed configurations */}
            <div className="space-y-6">
              {/* Commands card */}
              <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-sm border border-slate-800">
                <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-400 border-b border-slate-800 pb-3 mb-4 flex items-center gap-2">
                  <ShieldCheck className="h-4.5 w-4.5 text-emerald-400" />
                  大會開票計票司令台
                </h3>

                <div className="space-y-4">
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <p className="text-xs text-slate-400">當前活躍環節：</p>
                    <p className="text-sm font-bold text-white mt-1 font-mono uppercase text-teal-400">
                      ▶ {currentRound}
                    </p>
                    <div className="flex items-center gap-2 mt-3 text-xs bg-slate-900 p-2 rounded">
                      <span>投票通道：</span>
                      <span className={`font-black font-semibold uppercase ${isVotingChannelOpen ? "text-emerald-400" : "text-yellow-400"}`}>
                        {isVotingChannelOpen ? "● 開放投票中" : "■ 已關閉通道"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3.5">
                      <button
                        id="btn-admin-channel-open"
                        onClick={() => handleSetRound(currentRound, true)}
                        className={`py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                          isVotingChannelOpen ? "bg-emerald-600 text-white cursor-default" : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                        }`}
                      >
                        開啟投票
                      </button>
                      <button
                        id="btn-admin-channel-close"
                        onClick={() => handleSetRound(currentRound, false)}
                        className={`py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                          !isVotingChannelOpen ? "bg-amber-600 text-white cursor-default" : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                        }`}
                      >
                        關閉投票
                      </button>
                    </div>
                  </div>

                  {/* Core Tally Function */}
                  <button
                    id="btn-admin-tally"
                    onClick={handleTally}
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-sm tracking-wide transition-all uppercase flex items-center justify-center gap-1.5 cursor-pointer disabled:bg-slate-700"
                  >
                    <RefreshCw className={`h-4.5 w-4.5 ${loading ? "animate-spin" : ""}`} />
                    即時發動【開票與決算當選名冊】
                  </button>

                  <div className="text-[10px] text-slate-400 py-1 leading-relaxed">
                    ※ 說明：在大會投票完後，點擊上方【開票與決算】。系統會實時核算該階段所有人得票，如果有同分且影響當選席位（例如第 4 名出現同分、或會長競爭並列最高等），系統會自動檢測並進入同票第二輪重選方案，或拉起會長隨機抽籤輪盤，極為精準！
                  </div>
                </div>
              </div>

              {/* Special Education Placement Card */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-800 border-b pb-3 mb-4 flex items-center gap-2">
                  <Users className="text-blue-600 h-4.5 w-4.5" />
                  特教班家長代表指派欄 (Step 5 核心)
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  依規定特教家長代表為【校長指派特殊教育委員】，直接編入常務委員與會長選舉票堆中。
                </p>

                <form onSubmit={updateSpecialEd} className="space-y-3 shrink-0 text-slate-800">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
                      特教指派家長姓名
                    </label>
                    <input
                      type="text"
                      required
                      value={spedName}
                      onChange={(e) => setSpedName(e.target.value)}
                      className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
                      指派班級 (例如: 特教班)
                    </label>
                    <input
                      type="text"
                      required
                      value={spedClass}
                      onChange={(e) => setSpedClass(e.target.value)}
                      className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
                      子女學生名
                    </label>
                    <input
                      type="text"
                      required
                      value={spedChild}
                      onChange={(e) => setSpedChild(e.target.value)}
                      className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded text-xs"
                    />
                  </div>
                  <div className="pt-2 border-t text-right">
                    <button
                      type="submit"
                      className="bg-slate-900 text-white hover:bg-slate-800 text-xs py-1.5 px-3 rounded font-bold cursor-pointer"
                    >
                      校方核定指派
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </motion.div>
        )}

        {/* 124 Keys Ledger view */}
        {activeTab === "keys" && (
          <motion.div
            key="keys-tab"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-800">124 組 5 碼家長大會亂碼通知單選冊 (鍵簿 Codebook)</h3>
                <p className="text-xs text-slate-500 mt-1">
                  每班核定兩名代表席，共 124 名。請老師將各班家長填報後得到此 5 碼發放給对应的代表。
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  id="btn-admin-export-keys"
                  onClick={exportCodebookMarkdown}
                  className="bg-slate-900 border border-slate-800 text-white hover:bg-slate-800 text-xs font-bold py-1.5 px-3 rounded-lg cursor-pointer flex items-center gap-1"
                >
                  <Download className="h-4 w-4" /> 匯出為 Markdown 清冊.md
                </button>
              </div>
            </div>

            <div className="border border-slate-100 rounded-xl bg-slate-50 p-4 flex gap-2">
              <input
                type="text"
                placeholder="輸入識別碼 Key、班級名稱、代表家長姓或學生大名搜索..."
                value={searchKeyQuery}
                onChange={(e) => setSearchKeyQuery(e.target.value)}
                className="w-full max-w-md py-2 px-3 bg-white border border-slate-200 rounded-lg text-xs"
              />
            </div>

            {/* Keys grid ledger */}
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-widest font-bold">
                  <tr>
                    <th className="p-3">代表席次</th>
                    <th className="p-3">5 碼 Key (識別碼)</th>
                    <th className="p-3">行政班級</th>
                    <th className="p-3">代表家長大名</th>
                    <th className="p-3">子女學生名</th>
                    <th className="p-3">家委參選熱誠</th>
                    <th className="p-3">登記狀複審</th>
                    <th className="p-3">首輪投票</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRepsList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 italic">找不到符合條件的代表 Keys。</td>
                    </tr>
                  ) : (
                    filteredRepsList.map((rep, idx) => {
                      const votedThisRound = dbState.votes.some(v => v.voterKey === rep.key && v.roundId === currentRound);
                      return (
                        <tr key={rep.key} className={rep.disqualified ? "bg-rose-50/20 text-rose-800/80" : ""}>
                          <td className="p-3 font-mono font-bold text-slate-400">Seat {String(idx + 1).padStart(3, "0")}</td>
                          <td className="p-3">
                            <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {rep.key}
                            </span>
                          </td>
                          <td className="p-3 font-semibold">{rep.className || <span className="text-slate-400 italic">未填</span>}</td>
                          <td className="p-3">
                            <div>{rep.parentName || <span className="text-slate-400 italic">未填</span>}</div>
                            {rep.hasOtherClasses && (
                              <div className="text-[10px] text-amber-600 bg-amber-50/80 px-1.5 py-0.5 rounded border border-amber-100 mt-1 inline-block font-medium" title={rep.otherClassesText}>
                                多班代表
                              </div>
                            )}
                            {rep.hasOtherFamilyReps && (
                              <div className="text-[10px] text-orange-600 bg-orange-50/80 px-1.5 py-0.5 rounded border border-orange-100 mt-1 ml-1 inline-block font-medium" title={rep.otherFamilyRepsText}>
                                同戶複數代表
                              </div>
                            )}
                          </td>
                          <td className="p-3">{rep.childName || <span className="text-slate-400 italic">未填</span>}</td>
                          <td className="p-3">
                            {rep.registered ? (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${rep.isWillingCommittee ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                                {rep.isWillingCommittee ? "意願極高" : "不參委"}
                              </span>
                            ) : "-"}
                          </td>
                          <td className="p-3">
                            {!rep.registered ? (
                              <span className="text-slate-400 text-[10px]">■ 未登記填報</span>
                            ) : rep.disqualified ? (
                              <span className="text-rose-600 font-bold text-[10px] flex items-center gap-1" title={rep.disqualificationReason}>
                                <AlertTriangle className="h-3 w-3 shrink-0" /> 資格排除 (複審)
                              </span>
                            ) : (
                              <span className="text-emerald-600 font-bold text-[10px]">✔ 已登記且合規</span>
                            )}
                          </td>
                          <td className="p-3 font-mono">
                            {votedThisRound ? (
                              <span className="text-emerald-600 font-bold">● 已投票</span>
                            ) : (
                              <span className="text-slate-400">○ 尚未遞投</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* Sibling Manual Household Linking (除錯法規核定) */}
        {activeTab === "rules" && (
          <motion.div
            key="rules-tab"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {/* Manual Household Linking */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4 md:col-span-1">
              <h3 className="text-base font-bold text-slate-800 border-b pb-3 flex items-center gap-1.5">
                <Link className="text-blue-600 h-4.5 w-4.5" />
                同一家互為手足手動關聯（同戶鏈結）
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                若有手足姓名不完全一樣（例如同戶異父、異母、或重組戶），但確實為同一家庭代表，可輸入這兩位代表已登記填報的隨機 Key。系統經鏈連，會自動按法規對其除錯篩選（僅保留低年級，高年級那一位自動排除選委與投票權，杜絕一戶雙票！）。
              </p>

              <form onSubmit={handleManualAddHousehold} className="space-y-4 pt-2">
                <div>
                  <label htmlFor="sib-a" className="block text-xs font-semibold text-slate-700 mb-1">
                    代表 A 識別碼 (例如: 低年段 Key)
                  </label>
                  <input
                    id="sib-a"
                    type="text"
                    required
                    maxLength={5}
                    placeholder="輸入5碼 Key"
                    value={sibKeyA}
                    onChange={(e) => setSibKeyA(e.target.value.toUpperCase())}
                    className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded text-xs uppercase"
                  />
                </div>
                <div>
                  <label htmlFor="sib-b" className="block text-xs font-semibold text-slate-700 mb-1">
                    代表 B 識別碼 (例如: 高年段 Key)
                  </label>
                  <input
                    id="sib-b"
                    type="text"
                    required
                    maxLength={5}
                    placeholder="輸入5碼 Key"
                    value={sibKeyB}
                    onChange={(e) => setSibKeyB(e.target.value.toUpperCase())}
                    className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded text-xs uppercase"
                  />
                </div>

                <button
                  id="btn-admin-link-household"
                  type="submit"
                  disabled={loading}
                  className="w-full bg-slate-900 text-white hover:bg-slate-800 text-xs py-2 px-4 rounded-lg font-bold cursor-pointer transition-colors"
                >
                  ✔ 確認強配關聯並執行除錯
                </button>
              </form>
            </div>

            {/* List of current registrations & eligibility explanations */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4 md:col-span-2">
              <h3 className="text-base font-bold text-slate-800 border-b pb-3 flex items-center gap-1.5">
                <ShieldCheck className="text-emerald-600 h-4.5 w-4.5" />
                大會現階段登陸填報之『法規安全覆核除錯』總判定
              </h3>

              <div className="text-xs space-y-4">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <h4 className="font-bold text-slate-800">⚖ 中華民國國民中小學家長會法規安全除錯標準（多重同戶檢核機制）：</h4>
                  <ul className="list-disc pl-4 mt-2 space-y-1.5 text-slate-500 leading-relaxed">
                    <li><strong className="text-slate-700">多班委員除錯篩選</strong>：同一代表同時在多個班級獲選為代表（重複代表學級）。此大代表僅能在較低年級（低年段）的班級保留候選資格與投票資格，高年級的所有資格均在計票堆自動標記 Disqualified 排除，避免多票！</li>
                    <li><strong className="text-slate-700">同一室家戶除錯篩選</strong>：同學級或跨級若爸爸媽媽分任不同級代表（同戶雙代）。依『同一家戶指派一人』行使家委委員被選舉權與表決投票權，系統在實時審查中僅精準保留較低年級家人（如：媽媽201班，爸爸501班，僅保留媽媽），爸爸自動標定 Disqualified 排除。</li>
                  </ul>
                </div>

                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin">
                  <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                    判定排除名冊列表：
                  </h4>

                  {dbState.parentReps.filter(r => r.registered && r.disqualified).length === 0 ? (
                    <p className="text-slate-500 italic py-6 text-center">所有大會家長填報合規無虞，目前無人被發規排除。</p>
                  ) : (
                    dbState.parentReps
                      .filter(r => r.registered && r.disqualified)
                      .map(dis => (
                        <div key={dis.key} className="bg-rose-50 border-l-4 border-rose-500 p-3.5 rounded-xl text-rose-950 flex flex-col justify-start">
                          <div className="flex items-center justify-between font-bold">
                            <span>{dis.className}班 代表家長：{dis.parentName}</span>
                            <span className="font-mono bg-rose-100 text-rose-800 rounded px-1.5 py-0.5 text-[10px]">
                              密金 Key: {dis.key}
                            </span>
                          </div>
                          <div className="text-[11px] text-rose-800 mt-1 leading-relaxed">
                            學生大名：<span className="font-semibold">{dis.childName || "未載"}</span>
                          </div>
                          <div className="text-[11.5px] font-semibold text-rose-900 mt-2 bg-white/70 p-2 rounded border border-rose-100 leading-relaxed flex items-start gap-1">
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                            <span>法規除錯原因：{dis.disqualificationReason}</span>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Generate organizational roster and Related Meeting Minutes table (自動產生組織名冊與會務會議紀錄) */}
        {activeTab === "minutes" && (
          <motion.div
            key="minutes-tab"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {/* Parent Association Executive Team organizational Roster */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
              <h3 className="text-base font-bold text-slate-800 border-b pb-3 flex items-center gap-1.5">
                <Users className="text-blue-600 h-4.5 w-4.5" />
                自動生成本校：家長會會務組織名冊 (Elected Officer Roster)
              </h3>
              <p className="text-xs text-slate-500">
                本表按現場表決結果實時更新自動成冊，可直接列印提供教育局備查。
              </p>

              <div id="print-roster-area" className="border border-slate-250 rounded-xl p-5 bg-white shadow-inner space-y-4 text-xs select-text">
                <div className="text-center font-bold text-sm border-b pb-3 border-slate-200">
                  <h3>新竹市東區關埔國民小學 {new Date().getFullYear() - 1911} 學年度家長會委員會組織名冊</h3>
                  <p className="text-[10px] text-slate-400 font-normal mt-1">核定日期：民國 {new Date().getFullYear() - 1911} 年 {new Date().getMonth()+1} 月 {new Date().getDate()} 日</p>
                </div>

                <div className="space-y-3.5">
                  <div className="flex border-b border-slate-100 pb-2">
                    <span className="w-24 font-black font-semibold text-slate-600">家長會會長：</span>
                    <span className="text-slate-900 font-bold">
                      {dbState.parentReps.find(r => r.isPresident)?.parentName || "（選務尚未開投或同票待抽籤）"}
                    </span>
                  </div>
                  
                  <div className="flex border-b border-slate-100 pb-2">
                    <span className="w-24 font-black font-semibold text-slate-600">常務委員：</span>
                    <span className="text-slate-900 font-bold leading-relaxed break-all">
                      {dbState.parentReps.filter(r => r.isConstantCommittee).map(r=>r.parentName.replace(/（父）|（母）/g, "")).join("、") || "（選務進行中）"}
                    </span>
                  </div>

                  <div className="flex border-b border-slate-100 pb-2">
                    <span className="w-24 font-black font-semibold text-slate-600">特委委員：</span>
                    <span className="text-slate-900 font-bold">
                      {dbState.config.specialEdMember.name} (學級：{dbState.config.specialEdMember.className} 代表級)
                    </span>
                  </div>

                  <div>
                    <span className="font-black font-semibold text-slate-600 block mb-2">24 席班級分學段家長委員：</span>
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100 max-h-[160px] overflow-y-auto">
                      {dbState.parentReps.filter(r => r.isCommittee).map(r => (
                        <div key={r.key} className="text-[10px] text-slate-700">
                          <strong>{r.parentName.replace(/（父）|（母）/g, "")}</strong> ({r.className}班)
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Related Election Meeting Minutes Generator */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
              <h3 className="text-base font-bold text-slate-800 border-b pb-3 flex items-center gap-1.5">
                <FileText className="text-emerald-600 h-4.5 w-4.5" />
                自動生成大會：相關各級委員會會議紀錄表 (Meeting Minutes)
              </h3>
              <p className="text-xs text-slate-500">
                自動整合大會時間、開票出席率、選委投票歷程、二輪同票二重選、及主席同票除錯抽籤決議。
              </p>

              <div id="print-minutes-area" className="border border-slate-250 rounded-xl p-5 bg-white shadow-inner space-y-4 text-[11px] text-slate-800 leading-relaxed max-h-[355px] overflow-y-auto select-text font-serif">
                <div className="text-center font-bold text-xs border-b pb-3 border-slate-200 font-sans">
                  <h4>新竹市東區關埔國民小學 {new Date().getFullYear() - 1911} 學年度第一屆代表大會會議紀錄表</h4>
                  <p className="text-[9px] text-slate-400 font-normal mt-1">會議目的：班級家長委員、常務委員暨家長會長選舉大會</p>
                </div>

                <div className="space-y-3">
                  <p><strong>一、 會議時間：</strong>民國 {new Date().getFullYear() - 1911} 年 {new Date().getMonth()+1} 月 {new Date().getDate()} 日</p>
                  <p><strong>二、 會議地點：</strong>本校大禮堂（結合智慧電視大螢幕開票看板）</p>
                  
                  <div>
                    <strong>三、 代表出席登記率：</strong>
                    <ul className="list-disc pl-4 mt-1 space-y-1 text-slate-600">
                      <li>本校法定班級代表：124 名代表座位（62班）。</li>
                      <li>累計上線 Key 校驗合格並登記人數：{dbState.parentReps.filter(r=>r.registered).length} 人。</li>
                      <li>系統防重及雙同戶篩選排除人数：{dbState.parentReps.filter(r=>r.registered && r.disqualified).length} 人。</li>
                      <li>合法具備神聖投票與候選人數：{dbState.parentReps.filter(r=>r.registered && !r.disqualified).length} 人。</li>
                    </ul>
                  </div>

                  <div>
                    <strong>四、 班級家長委員決選過程記錄：</strong>
                    <p className="text-slate-600 mt-1">
                      首輪投票結束後，計有 {dbState.parentReps.filter(r => r.isCommittee).length} 位委員依照最高票數（同級不跨級）直接當選。
                    </p>
                    {(Object.entries(dbState.config.gradeTieBreakers) as [string, any][]).length > 0 && (
                      <div className="bg-slate-50 p-2 rounded-md font-sans text-[10px] mt-1.5 border border-slate-200">
                        <span className="font-bold text-slate-800">各直屬年級二輪同票決議記錄：</span>
                        {(Object.entries(dbState.config.gradeTieBreakers) as [string, any][]).map(([g, tb]) => (
                          <div key={g} className="mt-1">
                            • 【{g}年級】：同票候選人：{tb.candidates.map((k: string)=>dbState.parentReps.find(r=>r.key===k)?.parentName).join("、")}。
                            決議方式：<span className="font-bold text-blue-600">{tb.resolveMethod === "draw" ? "主席隨機命運抽籤" : "二輪重決投票"}</span>。
                            幸運獲選人：{tb.resolvedWinner ? tb.resolvedWinner.split(",").map((wk: string) => dbState.parentReps.find(r => r.key === wk)?.parentName).join("、") : "同票待決"}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <strong>五、 常委與會長大選決議：</strong>
                    <ul className="list-disc pl-4 mt-1 space-y-1 text-slate-600">
                      <li>常委選舉（應選 9 位）：{dbState.parentReps.filter(r=>r.isConstantCommittee).length > 0 ? "已當選常委補齊 9 位。" : "投票進行中。"}</li>
                      {dbState.config.constantTieBreaker.active && (
                        <li className="text-[10px] list-none pl-2 text-rose-700">➔ 偵測常委同票决：{dbState.config.constantTieBreaker.resolved ? `已經由 ${dbState.config.constantTieBreaker.resolveMethod === "draw"?"抽籤":"再投票"} 補決。` : "待決中。"}</li>
                      )}
                      <li>家長會長選舉：{dbState.parentReps.find(r=>r.isPresident) ? `經互選一致通過，由 【${dbState.parentReps.find(r=>r.isPresident)?.parentName}】 會員榮任會長一職。` : "投票互選中。"}</li>
                    </ul>
                  </div>

                  <p className="border-t pt-2 border-dashed border-slate-200 text-[10px] text-slate-400 italic">
                    會議簽字處（校方監票代表、新任會長、前任會長蓋印）
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Randomized draw lots dialog block (同票隨機抽籤輪盤) */}
      <AnimatePresence>
        {showSpinner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 text-white rounded-3xl p-6 max-w-md w-full shadow-2xl relative"
            >
              <div className="text-center space-y-3">
                <div className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3.5 py-1.5 rounded-full inline-flex items-center gap-1.5 text-xs font-bold leading-none mx-auto uppercase">
                  <Sparkles className="h-4 w-4 shrink-0" />
                  大會開票：最終平手命運抽籤決
                </div>
                
                <h3 className="text-xl font-bold">
                  {spinnerType === "grade" ? `${selectedGradeForDraw}年級家長委員` : spinnerType === "constant" ? "常務委員" : "家長會長"} 同票平分僵局
                </h3>
                
                <p className="text-xs text-slate-400">
                  兩次連開二輪決投高分依舊打平！依據組織條例規定，大會當前必須以隨機公正抽籤方式，決定最後席次！
                </p>

                {/* Spinning Wheel display */}
                <div className="my-8 relative bg-slate-950 border border-slate-800 py-8 rounded-2xl flex items-center justify-center h-40 shadow-inner overflow-hidden">
                  <div className="absolute top-1.5 left-1/2 -translate-x-1/2 text-[10px] uppercase font-bold text-slate-600 font-mono">
                    LUCKY SECTOR WHEEL
                  </div>

                  <AnimatePresence mode="popLayout">
                    {winnerKey ? (
                      <motion.div
                        key={winnerKey}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="text-center"
                      >
                        <p className="text-xs text-emerald-400 uppercase font-mono tracking-wider">
                          {spinning ? "正在滾動抽取..." : "★ 恭喜中籤當選 ★"}
                        </p>
                        <p className="text-2xl font-black mt-2 text-white">
                          {spinnerCandidates.find(c => c.key === winnerKey)?.name || spinnerCandidates.find(c => c.key === winnerKey)?.parentName || "抽取中"}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-1">
                          識別碼: {winnerKey}
                        </p>
                      </motion.div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">準備就緒，點擊啟動</p>
                    )}
                  </AnimatePresence>

                  {/* Red pointer anchor */}
                  <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-red-600/30 pointer-events-none" />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    id="btn-admin-spin"
                    onClick={handleDrawLots}
                    disabled={spinning}
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-2.5 rounded-xl text-sm transition-all cursor-pointer shadow-sm shadow-amber-500/10 disabled:bg-slate-800 disabled:text-slate-500"
                  >
                    {spinning ? "抽籤轉動中..." : "啟動神聖命運抽籤"}
                  </button>
                  <button
                    id="btn-admin-close-draw"
                    onClick={() => {
                      setShowSpinner(false);
                      fetchState();
                    }}
                    disabled={spinning}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-sm cursor-pointer border border-slate-700"
                  >
                    結束抽籤並關閉
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
