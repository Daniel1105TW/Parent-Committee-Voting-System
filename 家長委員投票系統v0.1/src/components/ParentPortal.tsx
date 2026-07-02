import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, AlertTriangle, Key, ArrowRight, ClipboardList, Info, HelpCircle, CheckSquare, Award } from "lucide-react";
import { DatabaseState, ParentRep } from "../types";

interface ParentPortalProps {
  onBackToHub: () => void;
}

export function ParentPortal({ onBackToHub }: ParentPortalProps) {
  const [accessKey, setAccessKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [currentParent, setCurrentParent] = useState<ParentRep | null>(null);
  const [dbState, setDbState] = useState<DatabaseState | null>(null);
  
  // Form fields for registration
  const [className, setClassName] = useState("");
  const [parentName, setParentName] = useState("");
  const [childName, setChildName] = useState("");
  const [isWilling, setIsWilling] = useState(true);
  const [hasOther, setHasOther] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [hasFamilyReps, setHasFamilyReps] = useState(false);
  const [familyRepsText, setFamilyRepsText] = useState("");

  // Selected candidates for current voting round
  const [selectedCandidateKeys, setSelectedCandidateKeys] = useState<string[]>([]);

  // Periodically poll backend state while logged in
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
        
        // If a parent is logged in, refresh their local state
        if (currentParent) {
          if (currentParent.key === data.config.specialEdMember.key) {
            // Keep special ed refreshed
            return;
          }
          const updated = data.parentReps.find((r: ParentRep) => r.key === currentParent.key);
          if (updated) {
            setCurrentParent(updated);
          }
        }
      }
    } catch (e) {
      console.error("Error fetching state:", e);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessKey.trim()) return;

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/verify-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: accessKey.trim() })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setCurrentParent(data.parent);
        setAccessKey("");
        // Pre-fill form if already registered
        if (data.parent.registered) {
          setClassName(data.parent.className);
          setParentName(data.parent.parentName);
          setChildName(data.parent.childName);
          setIsWilling(data.parent.isWillingCommittee);
          setHasOther(data.parent.hasOtherClasses);
          setOtherText(data.parent.otherClassesText);
          setHasFamilyReps(data.parent.hasOtherFamilyReps || false);
          setFamilyRepsText(data.parent.otherFamilyRepsText || "");
        }
        setSuccessMsg("登入成功！");
      } else {
        setErrorMsg(data.message || "登入失敗，請確認 5 位數識別碼！");
      }
    } catch (err) {
      setErrorMsg("系統連線錯誤，請稍後再試！");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentParent) return;
    if (!className.trim() || !parentName.trim() || !childName.trim()) {
      setErrorMsg("請完整填寫班級、姓名與學生姓名！");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: currentParent.key,
          className: className,
          parentName: parentName,
          childName: childName,
          isWillingCommittee: isWilling,
          hasOtherClasses: hasOther,
          otherClassesText: otherText,
          hasOtherFamilyReps: hasFamilyReps,
          otherFamilyRepsText: familyRepsText
        })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setCurrentParent(data.parent);
        setSuccessMsg("登記成功！系統已完成防重與同戶複審覆核。");
        // Update global state right away
        fetchState();
      } else {
        setErrorMsg(data.message || "登記失敗");
      }
    } catch (err) {
      setErrorMsg("連線錯誤");
    } finally {
      setLoading(false);
    }
  };

  // Check if parents are eligible for current voting round
  const getEligibility = (): { eligible: boolean; reason: string } => {
    if (!currentParent || !dbState) return { eligible: false, reason: "載入中" };
    
    // Disqualified by system rules (duplicate representation or household duplicate)
    if (currentParent.disqualified) {
      return { eligible: false, reason: currentParent.disqualificationReason };
    }

    if (!currentParent.registered) {
      return { eligible: false, reason: "請先在下方『填報基本資料』完成代表身份登記後，方能解鎖投票通道！" };
    }

    const round = dbState.config.currentRoundId;
    if (round === "registration") {
      return { eligible: false, reason: "目前尚未開啟投票。請等候後台大會管理員啟動各學級委員競選！" };
    }

    if (round === "finished") {
      return { eligible: false, reason: "本次家長代表大會投票環節已圓滿結束，感謝參與！" };
    }

    // Grade Committee
    if (round === "grade_committee") {
      return { eligible: true, reason: "" };
    }

    // Grade Tie-Breaker
    if (round === "grade_tie_breaker") {
      const activeGradeGb = (Object.entries(dbState.config.gradeTieBreakers) as [string, any][]).find(([_, tb]) => tb.active && !tb.resolved);
      if (!activeGradeGb) {
        return { eligible: false, reason: "當前無進行中的同年級同票二輪投票。" };
      }
      const activeGrade = parseInt(activeGradeGb[0], 10);
      if (currentParent.grade !== activeGrade) {
        return { eligible: false, reason: `目前為【${activeGrade}年級】二輪同票表決，您參與的是 ${currentParent.grade}年級，無本輪投票權。` };
      }
      return { eligible: true, reason: "" };
    }

    // Constant Committee / Tie-Breakers / President / Association Leaders
    const isElectedCommittee = currentParent.isCommittee || currentParent.isSpecialEd;
    if (
      round === "constant_committee" ||
      round === "constant_tie_breaker" ||
      round === "president" ||
      round === "president_tie_breaker"
    ) {
      if (!isElectedCommittee) {
        return {
          eligible: false,
          reason: "本階段（常務委員及會長選舉）僅限前列順利當選之 25 位【家長委員】參與。一般代表無投票權。"
        };
      }
      return { eligible: true, reason: "" };
    }

    return { eligible: false, reason: "未知階段" };
  };

  // Get election candidates filtered for parent depending on current round
  const getCandidates = (): any[] => {
    if (!currentParent || !dbState) return [];
    const round = dbState.config.currentRoundId;

    if (round === "grade_committee") {
      // Valid willing reps of same grade, excluding himself/herself if they want, but standardly they vote for willing representatives of same grade
      return dbState.parentReps.filter(
        r => r.registered && !r.disqualified && r.isWillingCommittee && r.grade === currentParent.grade
      );
    }

    if (round === "grade_tie_breaker") {
      const activeGradeGb = (Object.entries(dbState.config.gradeTieBreakers) as [string, any][]).find(([_, tb]) => tb.active && !tb.resolved);
      if (!activeGradeGb) return [];
      const candidatesKeys = activeGradeGb[1].candidates;
      return dbState.parentReps.filter(r => candidatesKeys.includes(r.key));
    }

    if (round === "constant_committee") {
      // Candidates are the 24 elected committee members + 1 special ed
      const list = dbState.parentReps.filter(r => r.isCommittee);
      const candidates: any[] = [...list];
      candidates.push({
        key: dbState.config.specialEdMember.key,
        parentName: dbState.config.specialEdMember.name,
        className: dbState.config.specialEdMember.className,
        childName: dbState.config.specialEdMember.childName,
        isComm: true,
        details: "校方指派特教家長代表"
      });
      return candidates;
    }

    if (round === "constant_tie_breaker") {
      const activeKeys = dbState.config.constantTieBreaker.candidates;
      return dbState.parentReps
        .filter(r => activeKeys.includes(r.key))
        .map(r => ({ ...r, details: `${r.className} 班` }))
        .concat(
          activeKeys.includes(dbState.config.specialEdMember.key)
            ? [{
                key: dbState.config.specialEdMember.key,
                parentName: dbState.config.specialEdMember.name,
                className: dbState.config.specialEdMember.className,
                childName: dbState.config.specialEdMember.childName,
                isComm: true,
                details: "校方指派特教代表"
              } as any]
            : []
        );
    }

    if (round === "president") {
      // Elected 9 Constant Committee Members
      return dbState.parentReps.filter(r => r.isConstantCommittee);
    }

    if (round === "president_tie_breaker") {
      const activeKeys = dbState.config.presidentTieBreaker.candidates;
      return dbState.parentReps.filter(r => activeKeys.includes(r.key));
    }

    return [];
  };

  const handleSelectCandidate = (key: string, maxVotes: number) => {
    if (maxVotes === 1) {
      setSelectedCandidateKeys([key]);
    } else {
      if (selectedCandidateKeys.includes(key)) {
        setSelectedCandidateKeys(selectedCandidateKeys.filter(k => k !== key));
      } else {
        if (selectedCandidateKeys.length < maxVotes) {
          setSelectedCandidateKeys([...selectedCandidateKeys, key]);
        }
      }
    }
  };

  const handleCastVote = async () => {
    if (!currentParent || selectedCandidateKeys.length === 0) return;
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voterKey: currentParent.key,
          targetKeys: selectedCandidateKeys
        })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSuccessMsg(data.message);
        setSelectedCandidateKeys([]);
        fetchState(); // sync
      } else {
        setErrorMsg(data.message || "投票失敗！");
      }
    } catch (e) {
      setErrorMsg("系統連線失敗！");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentParent(null);
    setSuccessMsg("");
    setErrorMsg("");
    setSelectedCandidateKeys([]);
  };

  const activeRoundId = dbState?.config.currentRoundId || "registration";
  const votingActive = dbState?.config.votingActive || false;
  const elegInfo = getEligibility();
  const candidatesList = getCandidates();

  // Has voter already voted in this active round?
  const alreadyVotedThisRound = dbState?.votes.some(
    v => v.roundId === activeRoundId && v.voterKey === currentParent?.key
  ) || false;

  const getMaxVotesForRound = (): number => {
    if (activeRoundId === "grade_committee") return 4;
    return 1; // All tie breakers and secondary committee/president stages are 1 vote
  };

  // Map stage/round IDs to human languages
  const getRoundLabel = (id: string): string => {
    switch (id) {
      case "registration": return "大會召開與家長登記 (第一階段)";
      case "grade_committee": return "各年級【家長委員】選舉投票";
      case "grade_tie_breaker": return "各年級委員【同票重選】表決";
      case "constant_committee": return "第二階段：【常務委員】選舉票選";
      case "constant_tie_breaker": return "常務委員【同票重選】表決";
      case "president": return "第三階段：【家長會長】神聖選舉";
      case "president_tie_breaker": return "家長會長【同票重選】決議";
      case "finished": return "大會選舉圓滿落幕";
      default: return id;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row items-center justify-between border-b pb-6 mb-8 border-gray-100">
        <div>
          <h2 id="parent-portal-title" className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <ClipboardList className="text-emerald-600 h-6 w-6" />
            家長大會投票系統（家長入口通道）
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            請輸入發放之五位數亂碼識別碼 (Key) 行使家長代表的神聖投票權。
          </p>
        </div>
        <button
          id="btn-parent-exit"
          onClick={onBackToHub}
          className="mt-4 md:mt-0 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
        >
          返回系統主頁
        </button>
      </div>

      {/* Messages */}
      <AnimatePresence mode="wait">
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 p-4 bg-rose-50 border-l-4 border-rose-500 text-rose-800 rounded-lg flex items-start gap-3 text-sm"
          >
            <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">操作提示：</p>
              <p className="mt-0.5">{errorMsg}</p>
            </div>
          </motion.div>
        )}
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 p-4 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 rounded-lg flex items-start gap-3 text-sm"
          >
            <Check className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">成功回報：</p>
              <p className="mt-0.5">{successMsg}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!currentParent ? (
        /* Login Screen */
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 max-w-md mx-auto"
        >
          <div className="text-center mb-6">
            <div className="bg-emerald-50 text-emerald-600 p-4 rounded-full inline-block mb-3">
              <Key className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">登入投票通道</h3>
            <p className="text-xs text-slate-500 mt-1">
              請輸入通知信/信封上標示的【五位數亂碼 Key】。
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="input-voter-key" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                五位數識別碼 Key
              </label>
              <input
                id="input-voter-key"
                type="text"
                maxLength={5}
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value.toUpperCase())}
                placeholder="例如: A3F8G"
                className="w-full text-center py-3.5 px-4 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xl tracking-widest text-slate-800 uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                autoFocus
              />
            </div>

            <button
              id="btn-voter-login"
              type="submit"
              disabled={loading || accessKey.length !== 5}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 px-4 rounded-xl transition-all shadow-sm shadow-emerald-100 flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:shadow-none disabled:text-slate-400 cursor-pointer"
            >
              登入進入大會
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-8 border-t pt-4 text-center">
            <h4 className="text-xs text-slate-500 font-medium tracking-wide">測試登入可用範例：</h4>
            <div className="mt-2 text-xs flex flex-wrap justify-center gap-2 font-mono">
              <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md border border-slate-200">201 代表：黃美玲 </span>
              <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md border border-slate-200">501 代表：林春生 </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-2">
              (或前往『選舉中控後台』一鍵複製全新 124 組 5 碼隨機密金編冊進行模擬。)
            </p>
          </div>
        </motion.div>
      ) : (
        /* Logged In Portal */
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6 animate-fade-in"
        >
          {/* Parent Welcome Bar */}
          <div className="bg-slate-950 text-white p-6 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-md">
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-emerald-500 text-slate-950 font-bold px-2 py-0.5 rounded-full text-xs font-mono">
                  KEY: {currentParent.key}
                </span>
                {currentParent.registered && (
                  <span className="bg-slate-800 text-slate-200 px-2.5 py-0.5 rounded-full text-xs">
                    {currentParent.className} 班
                  </span>
                )}
              </div>
              <h3 className="text-xl font-bold mt-2 flex items-center gap-2">
                關埔代表大會：
                {currentParent.registered ? (
                  <span>{currentParent.parentName} <span className="text-slate-400 text-sm">({currentParent.childName} 的家長)</span></span>
                ) : (
                  <span className="text-yellow-400">尚未完成基本資料登記</span>
                )}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                大會當前狀態項目：<span className="text-emerald-400 font-medium font-semibold">{getRoundLabel(activeRoundId)}</span>
              </p>
            </div>
            <button
              id="btn-voter-logout"
              onClick={handleLogout}
              className="mt-4 sm:mt-0 px-3.5 py-1.5 text-xs font-medium bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 hover:bg-slate-800 transition-colors text-slate-200 cursor-pointer"
            >
              登出帳號
            </button>
          </div>

          {/* Core Ballot Box Component */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 border-b pb-3 mb-4 flex items-center gap-2">
              <CheckSquare className="text-emerald-600 h-5 w-5" />
              選票遞投圈選處 (神聖選票)
            </h3>

            {!elegInfo.eligible || alreadyVotedThisRound || !votingActive ? (
              <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 text-center">
                {alreadyVotedThisRound ? (
                  <div className="flex flex-col items-center">
                    <div className="bg-emerald-100 text-emerald-800 p-2.5 rounded-full mb-3 flex items-center justify-center">
                      <Check className="h-6 w-6" />
                    </div>
                    <p className="font-semibold text-slate-800">本組識別碼已在此輪完成神聖投票！</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-md">
                      本輪投票只能投遞一次選票。目前系統已成功收件，正在電視大螢幕統計看板進行即時覆核。
                    </p>
                  </div>
                ) : !votingActive ? (
                  <div className="flex flex-col items-center">
                    <div className="bg-yellow-50 text-yellow-600 p-2.5 rounded-full mb-3 flex items-center justify-center">
                      <Info className="h-6 w-6" />
                    </div>
                    <p className="font-semibold text-slate-800">投票大通道目前處於關閉狀態</p>
                    <p className="text-xs text-slate-500 mt-1">
                      請大會管理員開啟本輪投票表決功能。
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center max-w-lg mx-auto">
                    <div className="bg-amber-100 text-amber-800 p-2.5 rounded-full mb-3 flex items-center justify-center">
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                    <p className="font-semibold text-slate-800">身分排除或暫無選務權限</p>
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                      {elegInfo.reason}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* Active Voting Interface */
              <div>
                <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl text-xs mb-6 border border-emerald-100 leading-relaxed">
                  <span className="font-bold flex items-center gap-1.5 text-emerald-900 mb-1">
                    <Award className="h-4 w-4" /> 投票規則說明：
                  </span>
                  您代表的是 <span className="font-bold font-mono">{currentParent.grade}年級</span>。
                  目前投票進行【{getRoundLabel(activeRoundId)}】。
                  您最少需圈選 1 位，最多可圈選 <span className="font-bold text-emerald-900">{getMaxVotesForRound()} 位</span> 候選人。
                  選票一經送出後便無法收回、重選、或篡改！
                </div>

                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-700">
                    選票圈選（候選人清單）：
                  </h4>
                  <span className="text-xs text-slate-500 font-medium">
                    已圈選：<span className="font-bold text-emerald-600">{selectedCandidateKeys.length}</span> / {getMaxVotesForRound()} 人
                  </span>
                </div>

                {candidatesList.length === 0 ? (
                  <p className="text-sm text-slate-400 italic text-center py-6">此階段暫無合規的各班家長委員候選人</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {candidatesList.map((cand) => {
                      const isSelected = selectedCandidateKeys.includes(cand.key);
                      return (
                        <div
                          key={cand.key}
                          onClick={() => handleSelectCandidate(cand.key, getMaxVotesForRound())}
                          className={`relative border rounded-xl p-4 cursor-pointer transition-all flex items-center justify-between select-none ${
                            isSelected
                              ? "border-emerald-600 bg-emerald-50/50 shadow-sm"
                              : "border-slate-200 bg-slate-50/20 hover:border-slate-300 hover:bg-slate-50/50"
                          }`}
                        >
                          <div>
                            <div className="font-bold text-slate-800 flex items-center gap-1.5">
                              {cand.parentName}
                              {cand.key === dbState.config.specialEdMember.key && (
                                <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                                  特教指派
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              班級單位：{cand.className}班 | 代表學生：{cand.childName}
                            </div>
                          </div>
                          
                          <div className={`h-6 w-6 rounded-lg border flex items-center justify-center transition-colors ${
                            isSelected ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-300"
                          }`}>
                            {isSelected && <Check className="h-4 w-4" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-8 pt-4 border-t flex justify-end">
                  <button
                    id="btn-cast-parent-vote"
                    onClick={handleCastVote}
                    disabled={loading || selectedCandidateKeys.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-6 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                  >
                    確認投遞此選票（送出）
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Parent Profile Registration Section (Taiwan class rules) */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 border-b pb-3 mb-4 flex items-center gap-2">
              <ClipboardList className="text-blue-600 h-5 w-5" />
              大會家長代表填報 (基本資料登記)
            </h3>

            {currentParent.registered && (
              <div className="bg-slate-50 px-4 py-3 border border-slate-200 rounded-xl flex items-start gap-2.5 text-xs text-slate-600 mb-6 font-medium">
                <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  身分覆核：您已成功提供基本代表身分（班級：{currentParent.className}，姓名：{currentParent.parentName}）。依中華民國國民小學家長會組織條例，系統將為您防重複與同戶除錯判定。您可隨時更改資料重新提交再次進行系統複查。
                </div>
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="reg-class" className="block text-xs font-semibold text-slate-600 mb-1.5">
                    代表班級 (例如: 101, 205, 501)
                  </label>
                  <input
                    id="reg-class"
                    type="text"
                    required
                    placeholder="例如: 205 (即2年5班)"
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    className="w-full py-2.5 px-3.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label htmlFor="reg-parent" className="block text-xs font-semibold text-slate-600 mb-1.5">
                    家長姓名 (代表姓名)
                  </label>
                  <input
                    id="reg-parent"
                    type="text"
                    required
                    placeholder="請輸入家長大名"
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    className="w-full py-2.5 px-3.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label htmlFor="reg-child" className="block text-xs font-semibold text-slate-600 mb-1.5">
                    代表子女學生大名 (系統除錯核心)
                  </label>
                  <input
                    id="reg-child"
                    type="text"
                    required
                    placeholder="請輸入就讀子女大名"
                    value={childName}
                    onChange={(e) => setChildName(e.target.value)}
                    className="w-full py-2.5 px-3.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-start gap-2.5">
                  <input
                    id="reg-willing"
                    type="checkbox"
                    checked={isWilling}
                    onChange={(e) => setIsWilling(e.target.checked)}
                    className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500 rounded mt-0.5 cursor-pointer"
                  />
                  <div>
                    <label htmlFor="reg-willing" className="text-sm font-semibold text-slate-700 cursor-pointer">
                      我有意願擔任家長委員
                    </label>
                    <p className="text-xs text-slate-500">
                      勾選後，系統方能在第一輪將您編入大會【家長委員】之被選拔對候選人清單中。
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-100 my-2 pt-2">
                  <div className="flex items-start gap-2.5">
                    <input
                      id="reg-other"
                      type="checkbox"
                      checked={hasOther}
                      onChange={(e) => setHasOther(e.target.checked)}
                      className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500 rounded mt-0.5 cursor-pointer"
                    />
                    <div>
                      <label htmlFor="reg-other" className="text-sm font-semibold text-slate-700 cursor-pointer">
                        我同時擔任本校多個班級之家長代表 (雙班/多班代表)
                      </label>
                      <p className="text-xs text-slate-500">
                        依大會章程，多班代表僅能保留較低年級的參選、被選舉、及選務圈選權，其餘高年段資格將由系統主動過濾。
                      </p>
                    </div>
                  </div>
                </div>

                {hasOther && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="pl-6 mb-2"
                  >
                    <label htmlFor="reg-other-text" className="block text-xs font-semibold text-slate-600 mb-1">
                      請寫出您同時代表的其餘班級
                    </label>
                    <input
                      id="reg-other-text"
                      type="text"
                      placeholder="例如: 同意擔任 503 代表"
                      value={otherText}
                      onChange={(e) => setOtherText(e.target.value)}
                      className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </motion.div>
                )}

                <div className="border-t border-slate-100 my-2 pt-2">
                  <div className="flex items-start gap-2.5">
                    <input
                      id="reg-family"
                      type="checkbox"
                      checked={hasFamilyReps}
                      onChange={(e) => setHasFamilyReps(e.target.checked)}
                      className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500 rounded mt-0.5 cursor-pointer"
                    />
                    <div>
                      <label htmlFor="reg-family" className="text-sm font-semibold text-slate-700 cursor-pointer">
                        家裡是否有成員同時擔任本校其他班級之家長代表 (同戶複數代表)
                      </label>
                      <p className="text-xs text-slate-500">
                        依規定，同一家戶（例如配偶）僅能保留較低年級的參選、被選舉、及選務圈選權，高年段代表資格將由系統主動過濾。
                      </p>
                    </div>
                  </div>
                </div>

                {hasFamilyReps && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="pl-6"
                  >
                    <label htmlFor="reg-family-text" className="block text-xs font-semibold text-slate-600 mb-1">
                      請寫出同戶另一位代表的班級與姓名 $ 學生姓名
                    </label>
                    <input
                      id="reg-family-text"
                      type="text"
                      placeholder="例如: 配偶林大明擔任 102 班代表"
                      value={familyRepsText}
                      onChange={(e) => setFamilyRepsText(e.target.value)}
                      className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </motion.div>
                )}
              </div>

              <div className="pt-4 border-t flex justify-end">
                <button
                  id="btn-submit-registration"
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2 rounded-xl transition-colors shadow-sm cursor-pointer disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {currentParent.registered ? "更正重提基本登記" : "確認登記基本資料"}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      )}
    </div>
  );
}
