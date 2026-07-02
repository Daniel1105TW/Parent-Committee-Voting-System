import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Vote, Tv, Settings, ClipboardCheck, ArrowRight, Award, Flame, Zap, Calendar, Clock,
  MapPin, HelpCircle, GraduationCap, ChevronRight, Activity, BellRing
} from "lucide-react";
import { ParentPortal } from "./components/ParentPortal";
import { DisplayCanvas } from "./components/DisplayCanvas";
import { AdminPanel } from "./components/AdminPanel";

enum ViewType {
  HUB = "hub",
  PARENT = "parent",
  TV_SCREEN = "tv_screen",
  ADMIN = "admin"
}

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>(ViewType.HUB);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [dbState, setDbState] = useState<any>(null);

  useEffect(() => {
    // Localized clock tik-tok
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleString("zh-TW", { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync general db status to display counters on portal
  useEffect(() => {
    const fetchGeneralStatus = async () => {
      try {
        const res = await fetch("/api/state");
        if (res.ok) {
          const data = await res.json();
          setDbState(data);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchGeneralStatus();
    const interval = setInterval(fetchGeneralStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Count metrics for hub
  const registeredCount = dbState?.parentReps.filter((r: any) => r.registered).length || 0;
  const votedCountInCurrent = dbState?.votes.filter((v: any) => v.roundId === dbState?.config.currentRoundId).length || 0;
  
  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      <AnimatePresence mode="wait">
        {currentView === ViewType.HUB && (
          <motion.div
            key="portal-hub-root"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full max-w-7xl mx-auto px-4 py-12 flex flex-col min-h-screen justify-between"
          >
            {/* Top Minimal Header */}
            <div className="flex flex-col sm:flex-row items-center justify-between border-b pb-6 mb-12 border-slate-200 gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-600 text-white p-2 rounded-xl shadow-md shadow-emerald-100">
                  <GraduationCap className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">新竹市東區關埔國民小學</h1>
                  <p className="text-xs text-slate-500 font-medium">Hsinchu City East District Guanpu Elementary School</p>
                </div>
              </div>

              {/* Dynamic Local Clock */}
              <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 bg-slate-100 px-4 py-2 rounded-xl border border-slate-200 shadow-inner">
                <div className="flex items-center gap-1.5 font-mono">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <span>{currentTime || "載入中"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">智慧中控連線中</span>
                </div>
              </div>
            </div>

            {/* Core Display Hero */}
            <div className="text-center py-4 mb-4">
              <div className="bg-emerald-50/60 border border-emerald-500/20 text-emerald-800 text-xs font-black px-4 py-1.5 rounded-full inline-flex items-center gap-1.5 leading-none shadow-sm shadow-emerald-50/50">
                <Award className="h-4 w-4 shrink-0" />
                第一屆家長會會務大會
              </div>
              <h2 id="main-portal-title" className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight mt-4 leading-tight">
                家長委員暨會長智慧選舉系統
              </h2>
              <p className="max-w-2xl mx-auto text-sm md:text-base text-slate-500 font-medium mt-4 leading-relaxed">
                整合代表身分填報、多班/雙班大代表複審、同戶重複除錯核定、分級直選開票、同分二輪重投以及隨機神聖抽籤全法規全流程開票。
              </p>
            </div>

            {/* Portal Cards (The Three major websites combined) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8">
              {/* Card 1: Parent Portal */}
              <motion.div
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                id="portal-card-parent"
                onClick={() => setCurrentView(ViewType.PARENT)}
                className="bg-white p-8 rounded-3xl border border-slate-200 border-b-4 hover:border-emerald-600 transition-all flex flex-col justify-between shadow-sm cursor-pointer group hover:shadow-md"
              >
                <div>
                  <div className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl inline-block group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-inner">
                    <Vote className="h-8 w-8" />
                  </div>
                  <h3 className="text-xl font-bold mt-6 text-slate-950 flex items-center gap-2">
                    家長代表投票入口
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">
                    持有校徽密封套發放之【五位數密金 Key】的家長代表，請由此登入，填報班級身份進行系統防重篩選，並在合規後參與各階段神聖票選！
                  </p>
                </div>

                <div className="border-t pt-5 mt-8 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">VOTER PANEL</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-full">
                      已登錄 {registeredCount} 席
                    </span>
                  </div>
                </div>
              </motion.div>

              {/* Card 2: TV Statistics Display Screen */}
              <motion.div
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                id="portal-card-tv"
                onClick={() => setCurrentView(ViewType.TV_SCREEN)}
                className="bg-white p-8 rounded-3xl border border-slate-200 border-b-4 hover:border-blue-600 transition-all flex flex-col justify-between shadow-sm cursor-pointer group hover:shadow-md"
              >
                <div>
                  <div className="bg-blue-50 text-blue-600 p-4 rounded-2xl inline-block group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner">
                    <Tv className="h-8 w-8" />
                  </div>
                  <h3 className="text-xl font-bold mt-6 text-slate-950 flex items-center gap-2">
                    智慧開票大螢幕看板
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">
                    適合在大講堂/多媒體大廳大電視、投影螢幕上投放。秒級即時更新，展示當前投票階段回收率、候選人得票比重、各級當選者名冊等。
                  </p>
                </div>

                <div className="border-t pt-5 mt-8 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">STAGE SCREEN</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-full">
                      本輪收得 {votedCountInCurrent} 票
                    </span>
                  </div>
                </div>
              </motion.div>

              {/* Card 3: Admin Dashboard */}
              <motion.div
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                id="portal-card-admin"
                onClick={() => setCurrentView(ViewType.ADMIN)}
                className="bg-slate-900 p-8 rounded-3xl transition-all flex flex-col justify-between shadow-sm cursor-pointer group hover:shadow-md border-b-4 border-slate-950 text-white"
              >
                <div>
                  <div className="bg-slate-800 text-blue-400 p-4 rounded-2xl inline-block group-hover:bg-blue-500 group-hover:text-slate-950 transition-all shadow-inner">
                    <Settings className="h-8 w-8" />
                  </div>
                  <h3 className="text-xl font-bold mt-6 text-white flex items-center gap-2">
                    智慧選務中控後台
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                  </h3>
                  <p className="text-xs text-slate-400 font-medium mt-2 leading-relaxed">
                    給本校選務老師或家長會督察使用。提供 124 席 Key 分配、手動配置特殊教育指委、中控各類重選和一鍵為教育局自動排編會議紀錄與名單。
                  </p>
                </div>

                <div className="border-t pt-5 mt-8 border-slate-800 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-bold tracking-wider uppercase font-mono">BACKEND HUB</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 font-mono bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                      ▶ {dbState?.config.currentRoundId || "registration"}
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Bottom Brand */}
            <div className="mt-12 border-t pt-6 text-center text-xs text-slate-400 font-medium">
              新竹市東區關埔國民小學 家長會選務委員會 主辦・智慧電視牆輔助計票系統 © All Rights Reserved.
            </div>
          </motion.div>
        )}

        {/* View Routing */}
        {currentView === ViewType.PARENT && (
          <motion.div
            key="voter-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ParentPortal onBackToHub={() => setCurrentView(ViewType.HUB)} />
          </motion.div>
        )}

        {currentView === ViewType.TV_SCREEN && (
          <motion.div
            key="tv-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <DisplayCanvas onBackToHub={() => setCurrentView(ViewType.HUB)} />
          </motion.div>
        )}

        {currentView === ViewType.ADMIN && (
          <motion.div
            key="admin-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <AdminPanel onBackToHub={() => setCurrentView(ViewType.HUB)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
