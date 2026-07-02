import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Tv, Play, RefreshCw, Award, Users, FileText, CheckCircle2, ChevronRight, Activity, Volume2, AlertTriangle } from "lucide-react";
import { DatabaseState, ParentRep } from "../types";

interface DisplayCanvasProps {
  onBackToHub: () => void;
}

export function DisplayCanvas({ onBackToHub }: DisplayCanvasProps) {
  const [dbState, setDbState] = useState<DatabaseState | null>(null);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [syncStatus, setSyncStatus] = useState<"ok" | "syncing" | "error">("ok");
  const [soundEnabled, setSoundEnabled] = useState(false);

  // Poll state every 2 seconds to act like an instant Live TV Display
  useEffect(() => {
    fetchLatestState();
    const interval = setInterval(fetchLatestState, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchLatestState = async () => {
    setSyncStatus("syncing");
    try {
      const res = await fetch("/api/state");
      if (res.ok) {
        const data = await res.json();
        
        // Play gentle audio sound if vote count increases to enhance visual television casting
        if (soundEnabled && dbState && data.votes.length > dbState.votes.length) {
          playBeep();
        }

        setDbState(data);
        setLastSync(new Date());
        setSyncStatus("ok");
      } else {
        setSyncStatus("error");
      }
    } catch (e) {
      setSyncStatus("error");
    }
  };

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      // Ignored
    }
  };

  if (!dbState) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-8">
        <Activity className="h-10 w-10 text-emerald-500 animate-spin mb-4" />
        <h3 className="text-xl font-bold">載入大螢幕統計看板中...</h3>
        <p className="text-slate-400 mt-2">系統正在同步本屆 62 班家長代表清冊與投票資料</p>
      </div>
    );
  }

  const activeRound = dbState.config.currentRoundId;
  const isVotingActive = dbState.config.votingActive;

  // Process and count votes based on the current active round
  const currentVotes = dbState.votes.filter(v => v.roundId === activeRound);
  const totalRegisteredVoters = dbState.parentReps.filter(r => r.registered && !r.disqualified);
  
  // Calculate total eligible voters depending on current round
  let eligibleVotersCount = 124;
  if (activeRound === "grade_committee") {
    eligibleVotersCount = totalRegisteredVoters.length;
  } else if (activeRound === "grade_tie_breaker") {
    // Only representatives of that specific tied grade
    const activeGradeGb = (Object.entries(dbState.config.gradeTieBreakers) as [string, any][]).find(([_, tb]) => tb.active && !tb.resolved);
    const grNum = activeGradeGb ? parseInt(activeGradeGb[0], 10) : 0;
    eligibleVotersCount = totalRegisteredVoters.filter(r => r.grade === grNum).length;
  } else if (
    activeRound === "constant_committee" ||
    activeRound === "constant_tie_breaker" ||
    activeRound === "president" ||
    activeRound === "president_tie_breaker"
  ) {
    // Only the 25 committee members
    eligibleVotersCount = 25;
  }

  const votedPercent = eligibleVotersCount > 0 
    ? Math.round((currentVotes.length / eligibleVotersCount) * 100) 
    : 0;

  // Helper: Count votes for any candidate in this round
  const getCandidateScores = (): { [key: string]: number } => {
    const scores: { [key: string]: number } = {};
    currentVotes.forEach(vt => {
      vt.targetKeys.forEach(key => {
        scores[key] = (scores[key] || 0) + 1;
      });
    });
    return scores;
  };

  const currentScores = getCandidateScores();

  // Helper: Get list of representatives elected as committee members
  const committeeList = dbState.parentReps.filter(r => r.isCommittee);
  const constantCommitteeList = dbState.parentReps.filter(r => r.isConstantCommittee);
  const presidentOpt = dbState.parentReps.find(r => r.isPresident);

  // Return round names in beautiful Traditional Chinese
  const getRoundDisplayTitle = (): string => {
    switch (activeRound) {
      case "registration": return "大會開幕：家長代表登記資格登錄中";
      case "grade_committee": return "第一階段：各年段【家長委員】公投選舉";
      case "grade_tie_breaker": {
        const activeGradeGb = (Object.entries(dbState.config.gradeTieBreakers) as [string, any][]).find(([_, tb]) => tb.active && !tb.resolved);
        return `各年段同票表決：第二輪 ${activeGradeGb ? activeGradeGb[0] : ""} 年級委員重選中`;
      }
      case "constant_committee": return "第二階段：大會精選【常務委員】選舉票選";
      case "constant_tie_breaker": return "常務委員同票表決：第二輪重選中";
      case "president": return "第三階段：本校新一任【家長會長】大選投票";
      case "president_tie_breaker": return "家長會長同票表決：第二輪重選中";
      case "finished": return "【本屆選舉圓滿落幕】最新當選會務團隊名單";
      default: return activeRound;
    }
  };

  return (
    <div id="big-tv-container" className="min-h-screen bg-slate-950 text-white font-sans flex flex-col justify-between">
      {/* Top Banner Status Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-red-600 animate-pulse text-white text-xs font-bold font-mono px-3 py-1 rounded-sm tracking-wider uppercase">
            ● LIVE 統計
          </div>
          <div>
            <h1 id="tv-system-title" className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <Tv className="text-emerald-400 h-6 w-6" />
              家長委員會神聖選舉大電視看板
            </h1>
            <p className="text-xs text-slate-400">大會現場開票直播・電視牆即時公告</p>
          </div>
        </div>

        {/* Sync Indicator */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-lg text-slate-300 border border-slate-700">
            <span>聲音音效：</span>
            <button
              id="btn-toggle-sound"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${soundEnabled ? "bg-emerald-500 text-slate-950" : "bg-slate-700 text-slate-300"}`}
            >
              {soundEnabled ? "啟用中" : "已關鎖"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <RefreshCw className={`h-4.5 w-4.5 text-emerald-400 ${syncStatus === "syncing" ? "animate-spin" : ""}`} />
            <span className="text-slate-300">秒級即時同步：{lastSync.toLocaleTimeString()}</span>
          </div>

          <button
            id="btn-tv-exit"
            onClick={onBackToHub}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg hover:text-white transition-colors cursor-pointer border border-slate-700"
          >
            退出看板
          </button>
        </div>
      </div>

      {/* Main Stats Center */}
      <div className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-4 gap-6 max-w-[1700px] mx-auto w-full">
        {/* Left 3/4 Area (Active Voting Data or final result board) */}
        <div className="xl:col-span-3 space-y-6 flex flex-col justify-between">
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-3xl backdrop-blur-md flex-1 flex flex-col justify-between">
            {/* Round Title & State Progress bar */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
                <div>
                  <span className="text-xs text-emerald-400 uppercase font-mono tracking-widest font-bold">CURRENT BALLOT FLOW</span>
                  <h2 id="tv-round-title" className="text-2xl md:text-3xl font-black text-white py-1">{getRoundDisplayTitle()}</h2>
                </div>
                {/* Visual Circle Meter */}
                {activeRound !== "finished" && activeRound !== "registration" && (
                  <div className="flex items-center gap-3 bg-slate-950 px-5 py-3 rounded-2xl border border-slate-800 shadow-inner">
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">選票回收進度</p>
                      <p className="text-lg font-black font-semibold font-mono text-emerald-400">
                        {currentVotes.length} <span className="text-slate-500 font-normal text-sm">/ {eligibleVotersCount} 票</span>
                      </p>
                    </div>
                    {/* Tiny percentage ring or bar */}
                    <div className="w-14 bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div className="bg-emerald-400 h-full transition-all duration-500" style={{ width: `${votedPercent}%` }} />
                    </div>
                    <span className="font-mono font-bold text-sm text-emerald-400">{votedPercent}%</span>
                  </div>
                )}
              </div>
            </div>

            {/* Core Visualization depending on active state */}
            <div className="flex-1 py-4">
              {activeRound === "registration" && (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto py-12">
                  <USERS_BOARD reps={dbState.parentReps} />
                </div>
              )}

              {activeRound === "grade_committee" && (
                /* 6-Grade Grid View: Perfectly parallel show */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3, 4, 5, 6].map((grade) => {
                    const gradeCands = dbState.parentReps
                      .filter(r => r.registered && !r.disqualified && r.isWillingCommittee && r.grade === grade)
                      .map(c => ({
                        key: c.key,
                        name: c.parentName,
                        className: c.className,
                        score: currentScores[c.key] || 0
                      }))
                      .sort((a, b) => b.score - a.score);

                    return (
                      <div key={grade} className="bg-slate-950 p-4 border border-slate-800 rounded-2xl flex flex-col">
                        <div className="border-b border-slate-800 pb-2 mb-3 flex items-center justify-between">
                          <h4 className="font-black text-emerald-400 tracking-wider flex items-center gap-1.5 text-base">
                            <Award className="h-4 w-4" /> {grade} 年級候選代表
                          </h4>
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                            席次: 4
                          </span>
                        </div>

                        {gradeCands.length === 0 ? (
                          <p className="text-xs text-slate-500 italic py-8 text-center">本年級暫無登記與有意願委員候選人</p>
                        ) : (
                          <div className="space-y-2.5 flex-1 flex flex-col justify-start">
                            {gradeCands.slice(0, 7).map((cand, idx) => {
                              // Highlight leading top 4 in emerald, tied ones or other in Slate
                              const isLeading = idx < 4 && cand.score > 0;
                              return (
                                <div key={cand.key} className="text-xs">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-bold flex items-center gap-1.5 text-slate-200">
                                      <span className={`w-4 h-4 rounded-full flex items-center justify-center font-mono text-[9px] ${isLeading ? "bg-emerald-500 text-slate-950 font-black" : "bg-slate-800 text-slate-400"}`}>
                                        {idx + 1}
                                      </span>
                                      {cand.name} <span className="text-slate-500 font-normal">({cand.className}班)</span>
                                    </span>
                                    <span className={`font-mono font-bold ${isLeading ? "text-emerald-400" : "text-slate-400"}`}>
                                      {cand.score} 票
                                    </span>
                                  </div>
                                  <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-full transition-all duration-500 ${isLeading ? "bg-emerald-400" : "bg-slate-800"}`}
                                      style={{ width: `${Math.min((cand.score / Math.max(...gradeCands.map(c=>c.score, 1))) * 100, 100) || 0}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                            {gradeCands.length > 7 && (
                              <p className="text-[10px] text-slate-600 text-center italic mt-1">（其餘 {gradeCands.length - 7} 位略... 數據於後台完整保留）</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {activeRound === "grade_tie_breaker" && (
                /* Focus Tie-Breaker candidates */
                <ACTIVE_TIE_BREAKER
                  title="年級委員二輪同分重選"
                  candidates={dbState.parentReps.filter(r => {
                    const activeGb = (Object.entries(dbState.config.gradeTieBreakers) as [string, any][]).find(([_, tb]) => tb.active && !tb.resolved);
                    return activeGb ? activeGb[1].candidates.includes(r.key) : false;
                  })}
                  scores={currentScores}
                  dbState={dbState}
                  type="grade"
                />
              )}

              {activeRound === "constant_committee" && (
                /* Constant Committee representation (elect 9 of 25) */
                <ACTIVE_TIE_BREAKER
                  title="首屆常務委員統計 (應選 9 位，參選 25 位)"
                  candidates={
                    dbState.parentReps.filter(r => r.isCommittee).map((r: any) => ({ ...r, details: `${r.className}班` }))
                    .concat([
                      {
                        key: dbState.config.specialEdMember.key,
                        parentName: dbState.config.specialEdMember.name,
                        className: dbState.config.specialEdMember.className,
                        childName: dbState.config.specialEdMember.childName,
                        details: "校方特別指派"
                      } as any
                    ])
                  }
                  scores={currentScores}
                  dbState={dbState}
                  targetCount={9}
                  type="constant"
                />
              )}

              {activeRound === "constant_tie_breaker" && (
                <ACTIVE_TIE_BREAKER
                  title="常務委員二輪同分重選"
                  candidates={
                    dbState.parentReps.filter(r => dbState.config.constantTieBreaker.candidates.includes(r.key))
                    .concat(
                      dbState.config.constantTieBreaker.candidates.includes(dbState.config.specialEdMember.key)
                        ? [{
                            key: dbState.config.specialEdMember.key,
                            parentName: dbState.config.specialEdMember.name,
                            className: dbState.config.specialEdMember.className,
                            childName: dbState.config.specialEdMember.childName,
                            details: "特教代表"
                          } as any]
                        : []
                    )
                  }
                  scores={currentScores}
                  dbState={dbState}
                  type="constant_tie"
                />
              )}

              {activeRound === "president" && (
                /* Head Master / President race (elect 1 from 9) */
                <ACTIVE_TIE_BREAKER
                  title="家長會長選舉統計 (應選 1 位，候選人 9 位)"
                  candidates={dbState.parentReps.filter(r => r.isConstantCommittee)}
                  scores={currentScores}
                  dbState={dbState}
                  targetCount={1}
                  type="president"
                />
              )}

              {activeRound === "president_tie_breaker" && (
                <ACTIVE_TIE_BREAKER
                  title="家長會長二輪同分重選"
                  candidates={dbState.parentReps.filter(r => dbState.config.presidentTieBreaker.candidates.includes(r.key))}
                  scores={currentScores}
                  dbState={dbState}
                  type="president_tie"
                />
              )}

              {activeRound === "finished" && (
                <FINAL_ELECTED_BOARD
                  president={presidentOpt}
                  constants={constantCommitteeList}
                  committees={committeeList}
                  specialEd={dbState.config.specialEdMember}
                />
              )}
            </div>
          </div>

          {/* Scrolling Ticker (Live transaction notifications) */}
          <div className="bg-slate-900 border border-slate-800 px-5 py-3 rounded-2xl flex items-center gap-3">
            <Volume2 className="text-emerald-400 h-5 w-5 shrink-0 animate-bounce" />
            <div className="text-xs uppercase text-slate-500 font-bold font-mono tracking-wider shrink-0">
              即時系統記錄：
            </div>
            <div className="flex-1 overflow-hidden h-5 relative">
              <div className="absolute inset-0 flex items-center text-xs text-slate-300 truncate font-medium">
                {dbState.logs && dbState.logs.length > 0 ? (
                  <motion.span
                    key={dbState.logs[dbState.logs.length - 1].timestamp}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    [{new Date(dbState.logs[dbState.logs.length - 1].timestamp).toLocaleTimeString()}] {dbState.logs[dbState.logs.length - 1].message}
                  </motion.span>
                ) : (
                  <span>大會投票通道順暢開放中，等候圈選開票。</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right 1/4 Column (Elected Sidebar status ledger) */}
        <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-3xl backdrop-blur-md flex flex-col justify-between space-y-6">
          <div>
            <h3 className="text-sm font-black uppercase text-emerald-400 tracking-widest border-b border-slate-800 pb-3 mb-4 flex items-center gap-2">
              <Users className="h-4.5 w-4.5 text-emerald-400" />
              大會會務最新當選明細
            </h3>

            <div className="space-y-4">
              {/* President Row */}
              <div className="border border-slate-800/80 bg-slate-950/60 p-3.5 rounded-xl">
                <span className="text-[10px] text-yellow-500 font-black tracking-wider uppercase bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                  ★ 家長會長
                </span>
                <p className="text-base font-black text-white mt-1.5">
                  {presidentOpt ? `${presidentOpt.parentName}` : <span className="text-slate-600 text-xs italic font-normal">投票尚未決選</span>}
                </p>
                {presidentOpt && (
                  <p className="text-[10px] text-slate-400 mt-0.5">代表子女：{presidentOpt.childName} | 班級：{presidentOpt.className} 班</p>
                )}
              </div>

              {/* Constant committees */}
              <div className="border border-slate-800/80 bg-slate-950/60 p-3.5 rounded-xl">
                <span className="text-[10px] text-emerald-400 font-black tracking-wider uppercase bg-emerald-400/10 px-2 py-0.5 rounded-md border border-emerald-400/20">
                  ◆ 常務委員 (應選 9 位)
                </span>
                <div className="mt-2.5">
                  {constantCommitteeList.length === 0 ? (
                    <span className="text-slate-600 text-xs italic font-normal">尚未決選</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {constantCommitteeList.map(c => (
                        <span key={c.key} className="bg-slate-900 text-slate-200 border border-slate-800 text-[10px] px-2.5 py-1 rounded-md font-medium">
                          {c.parentName.replace(/（父）|（母）/g, "")}
                        </span>
                      ))}
                      {/* Check if Sped got custom elected or belongs to SpecialEd list */}
                    </div>
                  )}
                </div>
              </div>

              {/* Grade Committees List (Count) */}
              <div className="border border-slate-800/80 bg-slate-950/60 p-3.5 rounded-xl">
                <span className="text-[10px] text-blue-400 font-black tracking-wider uppercase bg-blue-400/10 px-2 py-0.5 rounded-md border border-blue-400/20">
                  ■ 班級家長委員 (應選 24 位)
                </span>
                <p className="text-sm font-bold text-slate-200 mt-2">
                  已當選委員會人數：
                  <span className="text-emerald-400 font-black font-semibold font-mono text-base">{committeeList.length}</span> / 24 人
                </p>
                {committeeList.length > 0 && (
                  <div className="mt-2.5 max-h-[180px] overflow-y-auto pr-1 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800">
                    {[1, 2, 3, 4, 5, 6].map(g => {
                      const grComms = committeeList.filter(c => c.grade === g);
                      return (
                        <div key={g} className="text-[10px] border-b border-slate-900/60 pb-1 flex justify-between">
                          <span className="text-slate-500 font-bold">{g}年級 ({grComms.length}名)：</span>
                          <span className="text-slate-300 truncate max-w-[130px]" title={grComms.map(c=>c.parentName).join("、")}>
                            {grComms.map(c=>c.parentName.substring(0, 3)).join("、") || "無"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3 text-center">
            <p className="text-[10px] text-slate-600 font-mono">
              關埔國小常委組織部・智慧開源中控系統
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* User lists in registration phase */
function USERS_BOARD({ reps }: { reps: ParentRep[] }) {
  const registered = reps.filter(r => r.registered);
  const willing = reps.filter(r => r.registered && !r.disqualified && r.isWillingCommittee);
  const disqualified = reps.filter(r => r.registered && r.disqualified);

  return (
    <div className="w-full space-y-8 py-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Seats */}
        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800/80">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">總席次名單</p>
          <p className="text-3xl font-black text-emerald-400 mt-1 font-mono">124 <span className="text-sm font-normal text-slate-500">個家長代表</span></p>
          <p className="text-[10px] text-slate-500 mt-1">對應本校 62 個班級 A/B 二代表席</p>
        </div>
        {/* Completed Registered */}
        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800/80">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">登入登記完成率</p>
          <p className="text-3xl font-black text-blue-400 mt-1 font-mono">
            {registered.length} <span className="text-sm font-normal text-slate-500">/ 124人</span>
          </p>
          <p className="text-[10px] text-slate-500 mt-1">累計家長填發登記率：{Math.round((registered.length/124)*100)}%</p>
        </div>
        {/* Active Eligible Candidates */}
        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800/80">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">合規且有意參選委員數</p>
          <p className="text-3xl font-black text-purple-400 mt-1 font-mono">
            {willing.length} <span className="text-sm font-normal text-slate-500">/ {registered.length - disqualified.length}人</span>
          </p>
          <p className="text-[10px] text-slate-500 mt-1">已排除資格複審重複之合規意願家長</p>
        </div>
      </div>

      <div className="bg-slate-950/80 p-6 rounded-2xl border border-slate-800 text-left space-y-4">
        <h4 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
          <CheckCircle2 className="text-blue-400 h-4 w-4" /> 
          即時系統法規安全審查（複審狀態）
        </h4>
        <div className="text-xs text-slate-300 leading-relaxed space-y-3 max-h-[220px] overflow-y-auto pr-2">
          {disqualified.length === 0 ? (
            <p className="text-slate-500 italic text-center py-4">目前登記資料無重複，未偵測到任何法規排除對象。</p>
          ) : (
            disqualified.map(dis => (
              <div key={dis.key} className="bg-slate-900 border-l-4 border-amber-500 p-2.5 rounded-lg flex gap-2">
                <AlertTriangle className="h-4.5 w-4.5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white font-mono bg-slate-950 px-1.5 py-0.5 rounded text-[10px] border border-slate-800">Key: {dis.key}</span>{" "}
                  <span className="font-bold text-slate-200">{dis.parentName}</span>（隸屬本校 {dis.className} 班代表子女：{dis.childName}），
                  <span className="text-amber-400 font-medium">【判定資格排除】</span>：
                  <p className="text-[10px] text-slate-400 mt-1 bg-slate-950 p-1.5 rounded">{dis.disqualificationReason}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* Visualization Widget for Single tie-breaker or simple committee/president rounds */
function ACTIVE_TIE_BREAKER({ title, candidates, scores, dbState, targetCount, type }: { title: string; candidates: any[]; scores: { [key: string]: number }; dbState: DatabaseState; targetCount?: number; type?: string }) {
  const sortedCands = candidates.map(c => ({
    key: c.key,
    name: c.parentName || c.name,
    details: c.className ? `${c.className} 班` : (c.details || ""),
    score: scores[c.key] || 0
  })).sort((a, b) => b.score - a.score);

  const maxScore = Math.max(...sortedCands.map(c => c.score), 1);
  const isTargetElected = (idx: number, score: number) => {
    if (!targetCount) return false;
    if (score === 0) return false;
    return idx < targetCount;
  };

  return (
    <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 flex flex-col justify-start">
      <h3 className="font-black text-emerald-400 text-lg border-b border-slate-800 pb-3 mb-4 flex items-center justify-between">
        <span className="flex items-center gap-1.5">{title}</span>
        {targetCount && (
          <span className="text-xs bg-slate-900 text-slate-400 border border-slate-800 px-3 py-1 rounded-full uppercase tracking-wider font-bold">
            目標選取: {targetCount} 位
          </span>
        )}
      </h3>

      {sortedCands.length === 0 ? (
        <p className="text-xs text-slate-500 italic py-12 text-center">本輪暫時沒有符合資格候選人列入表決</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          {sortedCands.map((cand, idx) => {
            const isElected = isTargetElected(idx, cand.score);
            return (
              <div key={cand.key} className="bg-slate-900/40 p-3 rounded-xl border border-slate-800/40 flex flex-col justify-center">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold flex items-center gap-2 text-sm text-slate-200">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-xs font-black ${
                      isElected 
                        ? "bg-emerald-500 text-slate-950" 
                        : (targetCount && idx < targetCount && cand.score === sortedCands[targetCount]?.score)
                        ? "bg-amber-500 text-slate-950" // tie caution!
                        : "bg-slate-800 text-slate-400"
                    }`}>
                      {idx + 1}
                    </span>
                    {cand.name} <span className="text-slate-500 font-normal text-xs">({cand.details})</span>
                  </span>
                  <span className={`font-mono font-bold text-sm ${isElected ? "text-emerald-400" : "text-slate-400"}`}>
                    {cand.score} 票
                  </span>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                  <div
                    className={`h-full transition-all duration-700 ${isElected ? "bg-emerald-400" : (targetCount && idx < targetCount && cand.score === sortedCands[targetCount]?.score) ? "bg-amber-400" : "bg-slate-800"}`}
                    style={{ width: `${(cand.score / maxScore) * 100 || 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Big full-width board with beautifully paired cards for final当选 results */
function FINAL_ELECTED_BOARD({ president, constants, committees, specialEd }: { president?: ParentRep; constants: ParentRep[]; committees: ParentRep[]; specialEd: any }) {
  return (
    <div className="space-y-6 py-4 animate-fade-in text-left">
      <div className="text-center max-w-2xl mx-auto mb-6">
        <h3 className="text-xl md:text-2xl font-black text-amber-400 flex items-center justify-center gap-2">
          🏆 中華民國本校新一屆家長大會選舉圓滿成功 🏆
        </h3>
        <p className="text-xs text-slate-400 mt-1">各年級、常務委員、會長大選開票核算完成，會務組織正式公告成冊</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* President Card */}
        <div className="bg-slate-900 border-2 border-amber-500/80 p-6 rounded-3xl flex flex-col justify-between shadow-lg shadow-amber-500/5 md:col-span-1">
          <div>
            <div className="bg-amber-500 text-slate-950 text-xs font-black px-3 py-1 rounded-md inline-block">
              ★ 家長會長 (PRESIDENT)
            </div>
            {president ? (
              <div className="mt-6 flex items-start gap-3">
                <div className="bg-amber-500 text-slate-950 h-12 w-12 rounded-full inline-flex items-center justify-center text-xl font-black shrink-0 shadow">
                  會
                </div>
                <div>
                  <h4 className="text-2xl font-black text-white">{president.parentName}</h4>
                  <p className="text-xs text-slate-400 mt-1">隸屬班級：{president.className}班</p>
                  <p className="text-xs text-slate-400 mt-0.5">學生子女：{president.childName}</p>
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-xs italic py-12">未決選</p>
            )}
          </div>
          <p className="text-[10px] text-amber-500/80 font-bold tracking-wider mt-6 border-t border-slate-800 pt-3">
            大會主席團親頒當選公告・代表全體本校家長致敬
          </p>
        </div>

        {/* Constant committees Card */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col justify-between shadow-md md:col-span-2">
          <div>
            <div className="bg-emerald-500 text-slate-950 text-xs font-black px-3 py-1 rounded-md inline-block">
              ◆ 常務委員名單 (ESTEEMED MEMBERS - 9 SEATS)
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
              {constants.map((c, idx) => (
                <div key={c.key} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-slate-600">0{idx+1}</span>
                  <div>
                    <h5 className="font-bold text-slate-200 text-xs">{c.parentName.replace(/（父）|（母）/g, "")}</h5>
                    <p className="text-[9px] text-slate-500 mt-0.5">{c.className} 班代表</p>
                  </div>
                </div>
              ))}
              {/* Special Ed representation check */}
              {specialEd && (
                <div className="bg-slate-950 p-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-amber-500">特教</span>
                  <div>
                    <h5 className="font-bold text-amber-400 text-xs">{specialEd.name}</h5>
                    <p className="text-[9px] text-slate-500 mt-0.5">{specialEd.className}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <p className="text-[10px] text-slate-500 font-mono tracking-wider mt-6 border-t border-slate-800 pt-3">
            由大會委員一人一票票選決議產出，依法組織家長常委常駐核心小組。
          </p>
        </div>
      </div>

      {/* 24 Committees block (6 Grades) */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-sm">
        <div className="bg-blue-500 text-slate-950 text-xs font-black px-3 py-1 rounded-md inline-block">
          ■ 24 席班級分級家長委員名冊 (GRADE SELECTION LIST)
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-6">
          {[1, 2, 3, 4, 5, 6].map(g => {
            const grComms = committees.filter(c => c.grade === g);
            return (
              <div key={g} className="bg-slate-950 p-3 rounded-2xl border border-slate-800/80">
                <h5 className="font-bold text-blue-400 text-xs border-b border-slate-900 pb-1 flex justify-between">
                  <span>{g} 年級代表</span>
                  <span className="text-[10px] text-slate-600">({grComms.length}席)</span>
                </h5>
                <ul className="mt-2 space-y-1.5 text-slate-300 text-xs">
                  {grComms.map((c, i) => (
                    <li key={c.key} className="flex justify-between py-0.5">
                      <span className="font-bold text-slate-200">{c.parentName.replace(/（父）|（母）/g, "")}</span>
                      <span className="text-[10px] text-slate-600 font-mono font-medium">{c.className}班</span>
                    </li>
                  ))}
                  {grComms.length === 0 && <span className="text-[10px] text-slate-600">無當選人</span>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
