import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "data_store.json");

// Define election state structures
interface ParentRep {
  key: string;               // 5-digit random key
  className: string;         // e.g. "101", "205", "503" or empty
  grade: number;             // parsed 1-6 or 0
  parentName: string;        // empty if not registered
  childName: string;         // empty if not registered
  isWillingCommittee: boolean;
  hasOtherClasses: boolean;
  otherClassesText: string;
  hasOtherFamilyReps?: boolean;
  otherFamilyRepsText?: string;
  registered: boolean;
  disqualified: boolean;
  disqualificationReason: string;
  isCommittee: boolean;      // selected in Step 2/3
  isSpecialEd: boolean;      // school Principal appointed (Step 5)
  isConstantCommittee: boolean; // selected in Step 5/6
  isPresident: boolean;      // selected in Step 7
}

interface VoteCast {
  roundId: string;
  voterKey: string;
  targetKeys: string[];      // keys of candidates voted for
  timestamp: string;
}

interface TieBreakerState {
  active: boolean;
  grade?: number;            // For grade_tie_breaker: which grade has the tie
  candidates: string[];      // Keys of tied candidates participating
  resolved: boolean;
  resolvedWinner?: string;   // Key of candidate who won (via re-vote or draw)
  resolveMethod?: "vote" | "draw";
}

interface ElectionConfig {
  currentRoundId: "registration" | "grade_committee" | "grade_tie_breaker" | "constant_committee" | "constant_tie_breaker" | "president" | "president_tie_breaker" | "finished";
  votingActive: boolean;
  specialEdMember: {
    name: string;
    className: string;
    childName: string;
    key: string;
  };
  gradeTieBreakers: { [grade: number]: TieBreakerState };
  constantTieBreaker: TieBreakerState;
  presidentTieBreaker: TieBreakerState;
  adminPassword?: string;
}

interface DatabaseSchema {
  parentReps: ParentRep[];
  votes: VoteCast[];
  config: ElectionConfig;
  logs: { timestamp: string; message: string }[];
}

// Generate unique 5-digit keys
function generateUniqueKeys(count: number): string[] {
  const keys = new Set<string>();
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // clear readable chars (no I, O, 0, 1)
  while (keys.size < count) {
    let key = "";
    for (let i = 0; i < 5; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    keys.add(key);
  }
  return Array.from(keys);
}

// Parsing grade from Vietnamese/Taiwanese class format (e.g. "205" -> 2, "501" -> 5, "六年3班" -> 6)
function parseGrade(className: string): number {
  if (!className) return 0;
  const clean = className.trim();
  // Check typical Taiwan 3-digit class like "205" (Grade 2 Class 5)
  const matchDigits = clean.match(/^([1-6])\d{2}$/);
  if (matchDigits) {
    return parseInt(matchDigits[1], 10);
  }
  // Check for Chinese numbers like "一", "二", "三" or digits "1" to "6"
  const zhGrades: { [key: string]: number } = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6 };
  for (const char of Object.keys(zhGrades)) {
    if (clean.includes(char)) return zhGrades[char];
  }
  // Check single digit at start
  const matchSingle = clean.match(/^([1-6])/);
  if (matchSingle) {
    return parseInt(matchSingle[1], 10);
  }
  return 0;
}

// Populate sample data for simulation and playability out of box
function getSamplePrepopulatedData(keys: string[]): ParentRep[] {
  const reps: ParentRep[] = [];
  
  // 62 Classes (Class 101-110, 201-210, 301-310, 401-410, 501-511, 601-611)
  const classNames: string[] = [];
  for (let g = 1; g <= 6; g++) {
    const classCount = g >= 5 ? 11 : 10;
    for (let c = 1; c <= classCount; c++) {
      classNames.push(`${g}${c.toString().padStart(2, "0")}`);
    }
  }

  // Taiwanese names samples
  const sNames = [
    "林小寶", "張大明", "黃小華", "陳大偉", "李子豪", "王品睿", "劉又芯", "蔡依儒", "吳宇軒", "趙品熏",
    "曾宥廷", "彭郁婷", "許博仁", "洪立言", "沈宇婕", "詹凱文", "蘇亭妤", "藍光佑", "段家齊", "簡靖雅"
  ];
  const pNames = [
    "林國強", "張其明", "黃怡君", "陳家豪", "李淑芬", "王志偉", "劉美蓮", "蔡瑞敏", "吳昭宏", "趙正達",
    "曾秀娟", "彭政閔", "許文雄", "洪淑雅", "沈志豪", "詹素珍", "蘇俊雄", "藍廷宇", "段崇先", "簡美玲"
  ];

  // We have 124 seats (2 per class for 62 classes)
  for (let i = 0; i < 124; i++) {
    const classIdx = Math.floor(i / 2);
    let className = classNames[classIdx] || `${Math.floor(classIdx/10)+1}01`;
    let grade = parseGrade(className);
    const isRepA = i % 2 === 0;

    // We pre-populate some realistic registrations to show and test the voting instantly.
    // We register around 75% of them.
    const shouldRegister = i < 100; // leaves 24 for manual exploration in the preview
    
    let parentName = "";
    let childName = "";
    let isWillingCommittee = false;
    let registered = false;
    let hasOtherClasses = false;
    let otherClassesText = "";

    if (shouldRegister) {
      registered = true;
      // Normal values
      parentName = pNames[i % pNames.length] + (isRepA ? "（父）" : "（母）");
      childName = sNames[i % sNames.length];
      
      // Let's set some willingness (majority is willing, some not)
      isWillingCommittee = (i % 5 !== 0);

      // --- INJECT TEST CASES FOR DEDUPLICATION LAWS ---
      // 1. Multiple classes representation rule: "張其明" represents 503 and 205
      if (i === 10) { // e.g. Class 106 Rep A
        parentName = "張其明";
        childName = "張小朋";
        className = "503"; 
        hasOtherClasses = true;
        otherClassesText = "同時擔任 205 班代表";
      }
      if (i === 40) { // e.g. Class 205 Rep A
        parentName = "張其明";
        childName = "張小朋";
        className = "205";
        hasOtherClasses = true;
        otherClassesText = "同時擔任 503 班代表";
      }

      // 2. Household sibling rule: Mother and Father represent different classes:
      // Mother represents 201, Father represents 501. Child: "林大華"
      if (i === 32) { // Class 201 Rep A
        parentName = "黃美玲";
        childName = "林大華";
        className = "201";
      }
      if (i === 82) { // Class 501 Rep A
        parentName = "林春生";
        childName = "林大華";
        className = "501";
      }
      
      // Re-evaluate grade for overridden classes
      grade = parseGrade(className);
    }

    reps.push({
      key: keys[i],
      className: className,
      grade: grade,
      parentName: parentName,
      childName: childName,
      isWillingCommittee: isWillingCommittee,
      hasOtherClasses: hasOtherClasses,
      otherClassesText: otherClassesText,
      hasOtherFamilyReps: false,
      otherFamilyRepsText: "",
      registered: registered,
      disqualified: false,
      disqualificationReason: "",
      isCommittee: false,
      isSpecialEd: false,
      isConstantCommittee: false,
      isPresident: false
    });
  }

  return reps;
}

// Rules execution logic: Run through data and mark disqualified representatives
function processDeduplicationRules(parentReps: ParentRep[]): ParentRep[] {
  // First, reset all disqualifications
  parentReps.forEach(rep => {
    rep.disqualified = false;
    rep.disqualificationReason = "";
  });

  // Keep track of only registered representatives
  const activeReps = parentReps.filter(r => r.registered);

  // Apply standard parsing of grades to be absolutely sure
  activeReps.forEach(r => {
    r.grade = parseGrade(r.className);
  });

  // 1. Multiple class representation check
  // Find matching parent names representing multiple slots
  const parentMap = new Map<string, ParentRep[]>();
  activeReps.forEach(rep => {
    if (!rep.parentName) return;
    const cleanName = rep.parentName.replace(/（父）|（母）/g, "").trim();
    if (!parentMap.has(cleanName)) {
      parentMap.set(cleanName, []);
    }
    parentMap.get(cleanName)!.push(rep);
  });

  parentMap.forEach((slots, pName) => {
    if (slots.length > 1) {
      // Find the lowest grade
      slots.sort((a, b) => a.grade - b.grade);
      const lowestSlot = slots[0];
      // Keep lowestSlot qualified, disqualify all others
      slots.forEach((slot, index) => {
        if (index > 0) {
          slot.disqualified = true;
          slot.disqualificationReason = `重複代表多個班級（同一家長 ${pName} 同時代表 ${slots.map(s => s.className).join("、")}。依規定僅能代表低年級 ${lowestSlot.className} 班參選與投票。）`;
        }
      });
    }
  });

  // 2. Household same child rule "同一戶只有代表低年級的家人擁有投票權以及候選人資格"
  // Find matching child names
  const childMap = new Map<string, ParentRep[]>();
  activeReps.forEach(rep => {
    if (rep.disqualified || !rep.childName) return; // skip already disqualified items
    const cleanChild = rep.childName.trim();
    if (!childMap.has(cleanChild)) {
      childMap.set(cleanChild, []);
    }
    childMap.get(cleanChild)!.push(rep);
  });

  childMap.forEach((familySlots, cName) => {
    if (familySlots.length > 1) {
      // Sort by Grade to identify lowest grade family representative
      familySlots.sort((a, b) => a.grade - b.grade);
      const lowestFamilySlot = familySlots[0];
      familySlots.forEach((slot, index) => {
        if (index > 0) {
          slot.disqualified = true;
          slot.disqualificationReason = `同戶家人代表多個班級（學生 ${cName} 各班代表：${familySlots.map(s => `${s.className} 班 ${s.parentName}`).join("、")}。依規定僅能由低年級代表 ${lowestFamilySlot.parentName}（${lowestFamilySlot.className}班）行使權利，其餘代表喪失投票及被選舉權。）`;
        }
      });
    }
  });

  return parentReps;
}

// Initial Database Generation
function initDatabase(): DatabaseSchema {
  const keys = generateUniqueKeys(124);
  const rawReps = getSamplePrepopulatedData(keys);
  const processedReps = processDeduplicationRules(rawReps);

  const initialSchema: DatabaseSchema = {
    parentReps: processedReps,
    votes: [],
    config: {
      currentRoundId: "registration",
      votingActive: true,
      specialEdMember: {
        name: "李曉涵",
        className: "特教班",
        childName: "王小寶",
        key: "SPED1"
      },
      gradeTieBreakers: {},
      constantTieBreaker: { active: false, candidates: [], resolved: false },
      presidentTieBreaker: { active: false, candidates: [], resolved: false },
      adminPassword: "gppseb"
    },
    logs: [
      { timestamp: new Date().toISOString(), message: "投票系統建立：已隨機生成 124 組 5 位數登入識別碼 (Key)" },
      { timestamp: new Date().toISOString(), message: "系統除錯機制：多重代表與同戶重複篩選法規已載入，預設測試樣本已過濾" }
    ]
  };

  saveDb(initialSchema);
  return initialSchema;
}

// Read database file
function readDb(): DatabaseSchema {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return initDatabase();
    }
    const data = fs.readFileSync(DB_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (!parsed.config) parsed.config = {};
    if (!parsed.config.adminPassword) {
      parsed.config.adminPassword = "gppseb";
    }
    // Auto-run rules to ensure consistency
    parsed.parentReps = processDeduplicationRules(parsed.parentReps);
    return parsed;
  } catch (e) {
    console.error("Error reading database, re-initializing:", e);
    return initDatabase();
  }
}

// Save database file
function saveDb(data: DatabaseSchema) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Error writing database:", e);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Log accesses
  app.use((req, res, next) => {
    console.log(`[VOTING SERVER] ${req.method} ${req.url}`);
    next();
  });

  // REST API Endpoints

  // GET current full state
  app.get("/api/state", (req, res) => {
    const db = readDb();
    res.json(db);
  });

  // ADMIN PASSWORD: VERIFY PASSWORD
  app.post("/api/admin/verify-password", (req, res) => {
    const { password } = req.body;
    const db = readDb();
    const correct = (password || "") === (db.config.adminPassword || "gppseb");
    res.json({ success: correct });
  });

  // ADMIN PASSWORD: CHANGE PASSWORD
  app.post("/api/admin/change-password", (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!newPassword || newPassword.trim().length === 0) {
      return res.status(400).json({ success: false, message: "新密碼型態不可為空值！" });
    }
    const db = readDb();
    const currentPass = db.config.adminPassword || "gppseb";
    if (oldPassword !== currentPass) {
      return res.status(403).json({ success: false, message: "當前舊密碼校驗不符合！" });
    }
    db.config.adminPassword = newPassword.trim();
    db.logs.push({
      timestamp: new Date().toISOString(),
      message: "後台管理：管理員成功修改後台登入安全密碼。"
    });
    saveDb(db);
    res.json({ success: true, message: "後台密碼已順利修改完成！" });
  });

  // ADMIN: CLEAR ALL DATA (Reset to empty registration phase, reserving 124 keys)
  app.post("/api/admin/clear-all", (req, res) => {
    const db = readDb();
    db.parentReps.forEach(r => {
      r.registered = false;
      r.parentName = "";
      r.childName = "";
      r.isWillingCommittee = false;
      r.hasOtherClasses = false;
      r.otherClassesText = "";
      r.hasOtherFamilyReps = false;
      r.otherFamilyRepsText = "";
      r.isCommittee = false;
      r.isConstantCommittee = false;
      r.isPresident = false;
      r.disqualified = false;
      r.disqualificationReason = "";
      r.grade = parseGrade(r.className);
    });

    db.votes = [];
    db.config.currentRoundId = "registration";
    db.config.votingActive = true;
    db.config.gradeTieBreakers = {};
    db.config.constantTieBreaker = { active: false, candidates: [], resolved: false };
    db.config.presidentTieBreaker = { active: false, candidates: [], resolved: false };
    db.logs = [
      { timestamp: new Date().toISOString(), message: "後台動作一鍵：已清除所有家長個人註冊、已投選票、各輪當選身份，重置回初始登錄階段。" }
    ];

    saveDb(db);
    res.json({ success: true, message: "所有代表註冊及選票資料均一鍵清除完畢！", state: db });
  });

  // ADMIN: SIMULATE 124 REPRESENTATIVES AND COMPLETED VOTING FLOW
  app.post("/api/admin/simulate-all", (req, res) => {
    const db = readDb();

    // 1. Taiwanese names samples
    const sNames = [
      "林小寶", "張大明", "黃小華", "陳大偉", "李子豪", "王品睿", "劉又芯", "蔡依儒", "吳宇軒", "趙品熏",
      "曾宥廷", "彭郁婷", "許博仁", "洪立言", "沈宇婕", "詹凱文", "蘇亭妤", "藍光佑", "段家齊", "簡靖雅"
    ];
    const pNames = [
      "林國強", "張其明", "黃怡君", "陳家豪", "李淑芬", "王志偉", "劉美蓮", "蔡瑞敏", "吳昭宏", "趙正達",
      "曾秀娟", "彭政閔", "許文雄", "洪淑雅", "沈志豪", "詹素珍", "蘇俊雄", "藍廷宇", "段崇先", "簡美玲"
    ];

    // 2. Clear previous voting flags but maintain unique keys
    db.parentReps.forEach((rep, i) => {
      rep.registered = true;
      const isRepA = i % 2 === 0;
      rep.parentName = pNames[i % pNames.length] + (isRepA ? "（父）" : "（母）");
      rep.childName = sNames[i % sNames.length];
      rep.isWillingCommittee = (i % 5 !== 0); // 80% willing
      rep.hasOtherClasses = false;
      rep.otherClassesText = "";
      rep.hasOtherFamilyReps = false;
      rep.otherFamilyRepsText = "";
      rep.isCommittee = false;
      rep.isConstantCommittee = false;
      rep.isPresident = false;
      rep.disqualified = false;
      rep.disqualificationReason = "";
      rep.grade = parseGrade(rep.className);
    });

    // Inject 1 Multi-class representation test case (disqualifies index 10 in favor of index 40)
    db.parentReps[10].parentName = "張其明";
    db.parentReps[10].childName = "張小朋";
    db.parentReps[10].isWillingCommittee = true;
    db.parentReps[10].hasOtherClasses = true;
    db.parentReps[10].otherClassesText = "同時擔任 205 班代表";

    db.parentReps[40].parentName = "張其明";
    db.parentReps[40].childName = "張小朋";
    db.parentReps[40].isWillingCommittee = true;
    db.parentReps[40].hasOtherClasses = true;
    db.parentReps[40].otherClassesText = "同時擔任 503 班代表";

    // Inject 1 Family sibling test case (disqualifies index 82 in favor of index 32)
    db.parentReps[32].parentName = "黃美玲";
    db.parentReps[32].childName = "林大華";
    db.parentReps[32].isWillingCommittee = true;
    db.parentReps[32].hasOtherFamilyReps = true;
    db.parentReps[32].otherFamilyRepsText = "配偶林春生擔任 501 班代表";

    db.parentReps[82].parentName = "林春生";
    db.parentReps[82].childName = "林大華";
    db.parentReps[82].isWillingCommittee = true;
    db.parentReps[82].hasOtherFamilyReps = true;
    db.parentReps[82].otherFamilyRepsText = "配偶黃美玲擔任 201 班代表";

    // Run deduplication rules natively!
    db.parentReps = processDeduplicationRules(db.parentReps);

    // 3. GENERATE COMPLETE VOTES
    const simulatedVotes: VoteCast[] = [];

    // --- ROUND 1: GRADE COMMITTEE VOTES ---
    const gradeWinners: ParentRep[] = [];
    for (let g = 1; g <= 6; g++) {
      const gradeVoters = db.parentReps.filter(r => r.registered && !r.disqualified && r.grade === g);
      const gradeCands = db.parentReps.filter(r => r.registered && !r.disqualified && r.grade === g && r.isWillingCommittee);

      // Take top 4 candidates as chosen winners for this grade
      const targetWinners = gradeCands.slice(0, 4);
      targetWinners.forEach(tc => {
        gradeWinners.push(tc);
        // Turn on isCommittee flag
        const idx = db.parentReps.findIndex(r => r.key === tc.key);
        if (idx !== -1) db.parentReps[idx].isCommittee = true;
      });

      const otherCands = gradeCands.slice(4);

      // Generate realistic ballot votes per grade voter
      gradeVoters.forEach((voter, voterIdx) => {
        const targets: string[] = [];
        // We deterministic-bias votes to ensure clear win without ties
        targets.push(targetWinners[0].key);
        if (voterIdx % 4 !== 0 && targetWinners[1]) targets.push(targetWinners[1].key);
        if (voterIdx % 3 !== 0 && targetWinners[2]) targets.push(targetWinners[2].key);
        if (voterIdx % 2 !== 0 && targetWinners[3]) targets.push(targetWinners[3].key);

        // Occasional noise vote
        if (voterIdx % 5 === 0 && otherCands.length > 0) {
          const randKey = otherCands[voterIdx % otherCands.length].key;
          if (targets.length < 4 && !targets.includes(randKey)) {
            targets.push(randKey);
          }
        }

        if (targets.length > 0) {
          simulatedVotes.push({
            roundId: "grade_committee",
            voterKey: voter.key,
            targetKeys: targets,
            timestamp: new Date().toISOString()
          });
        }
      });
    }

    // --- ROUND 2: CONSTANT COMMITTEE VOTES ---
    // Total candidates for constant: 24 grade winners + 1 Special Ed member (SPED1)
    const spedKey = db.config.specialEdMember.key;
    const activeCommitteeKeys = gradeWinners.map(w => w.key);
    
    // Choose 9 constant winners from these candidates (e.g. first 8 selected grade winners + Special Ed)
    const constantWinners = [...activeCommitteeKeys.slice(0, 8), spedKey];

    // Mark as constant committees
    constantWinners.forEach(cKey => {
      if (cKey !== spedKey) {
        const idx = db.parentReps.findIndex(r => r.key === cKey);
        if (idx !== -1) db.parentReps[idx].isConstantCommittee = true;
      }
    });

    // 25 committee voters vote for 4 people
    const votersForConstant = [...gradeWinners, { key: spedKey } as any];
    votersForConstant.forEach((voter, voterIdx) => {
      const targets: string[] = [];
      // Pick 4 winners to vote for
      for (let j = 0; j < 4; j++) {
        const targetCollIdx = (voterIdx + j) % constantWinners.length;
        targets.push(constantWinners[targetCollIdx]);
      }
      simulatedVotes.push({
        roundId: "constant_committee",
        voterKey: voter.key,
        targetKeys: targets,
        timestamp: new Date().toISOString()
      });
    });

    // --- ROUND 3: PRESIDENT VOTES ---
    // Let's elect the Sped head or the first winner as President
    const presidentWinnerKey = constantWinners[0];
    const presidentIdx = db.parentReps.findIndex(r => r.key === presidentWinnerKey);
    if (presidentIdx !== -1) {
      db.parentReps[presidentIdx].isPresident = true;
    }

    // Generate president ballots from 25 members
    votersForConstant.forEach((voter, voterIdx) => {
      let selectedTarget = presidentWinnerKey;
      if (voterIdx >= 18 && voterIdx < 22) {
        selectedTarget = constantWinners[1];
      } else if (voterIdx >= 22) {
        selectedTarget = constantWinners[2];
      }
      simulatedVotes.push({
        roundId: "president",
        voterKey: voter.key,
        targetKeys: [selectedTarget],
        timestamp: new Date().toISOString()
      });
    });

    // 4. Update core logs & state config
    db.votes = simulatedVotes;
    db.config.currentRoundId = "finished";
    db.config.votingActive = false;
    db.config.gradeTieBreakers = {};
    db.config.constantTieBreaker = { active: false, candidates: [], resolved: false };
    db.config.presidentTieBreaker = { active: false, candidates: [], resolved: false };

    db.logs.push(
      { timestamp: new Date().toISOString(), message: "【自動模擬系統】已啟動！現正模擬全校 124 班家長代表快速註冊進程..." },
      { timestamp: new Date().toISOString(), message: "【自動模擬系統】成功，全部 124 位家長完成註冊！系統自動排他並排除同戶複數代表。" },
      { timestamp: new Date().toISOString(), message: "【自動模擬系統】模擬第一輪：年段家長委員開始投票（已為全體代表投下有效票）。" },
      { timestamp: new Date().toISOString(), message: "【自動模擬系統】第一輪計票結果：已順利產生 24 名年級家長委員當選者！" },
      { timestamp: new Date().toISOString(), message: "【自動模擬系統】模擬第二輪：首屆常務委員計票（25 位委員均投出 4 席自選常委票）。" },
      { timestamp: new Date().toISOString(), message: "【自動模擬系統】第二輪計票結果：順利選出常務委員 9 席（含特教特委委員代表）。" },
      { timestamp: new Date().toISOString(), message: "【自動模擬系統】模擬第三輪：首長選舉開投（常委圈選會長，計 1 正當選）。" },
      { timestamp: new Date().toISOString(), message: "【自動模擬系統】投票圓滿成功！所有當選名單、出席報表、名冊紀錄智慧生成！" }
    );

    saveDb(db);
    res.json({ success: true, message: "124位家長代表註冊、三輪投票與會長選拔自動模擬成功！", state: db });
  });

  // RESET systems
  app.post("/api/reset", (req, res) => {
    const fresh = initDatabase();
    res.json({ success: true, message: "資料庫已重設，並產成全新 124 組 Key 與初始測試樣本！", state: fresh });
  });

  // VERIFY KEY (Parent Portal login)
  app.post("/api/verify-key", (req, res) => {
    const { key } = req.body;
    if (!key || typeof key !== "string") {
      return res.status(400).json({ success: false, message: "請輸入 5 位數識別碼！" });
    }
    const cleanKey = key.trim().toUpperCase();
    const db = readDb();
    
    // Check if the SPED key is used
    if (cleanKey === db.config.specialEdMember.key) {
      return res.json({
        success: true,
        isSpecialEd: true,
        parent: {
          key: db.config.specialEdMember.key,
          className: db.config.specialEdMember.className,
          grade: 0,
          parentName: db.config.specialEdMember.name,
          childName: db.config.specialEdMember.childName,
          registered: true,
          disqualified: false,
          isCommittee: true,
          isSpecialEd: true
        }
      });
    }

    const parent = db.parentReps.find(r => r.key === cleanKey);
    if (!parent) {
      return res.status(404).json({ success: false, message: "找不到此 5 位數識別碼。請確認輸入是否正確 (英文字母皆為大寫)！" });
    }

    res.json({ success: true, parent: parent, isSpecialEd: false });
  });

  // PARENT REGISTER (Step 1)
  app.post("/api/register", (req, res) => {
    const { key, className, parentName, childName, isWillingCommittee, hasOtherClasses, otherClassesText, hasOtherFamilyReps, otherFamilyRepsText } = req.body;
    if (!key || !className || !parentName || !childName) {
      return res.status(400).json({ success: false, message: "請完整填寫班級、姓名與小孩姓名！" });
    }

    const db = readDb();
    const parentIndex = db.parentReps.findIndex(r => r.key === key.trim().toUpperCase());
    if (parentIndex === -1) {
      return res.status(404).json({ success: false, message: "登入識別碼無效！" });
    }

    // Save registration
    const prevRep = db.parentReps[parentIndex];
    db.parentReps[parentIndex] = {
      ...prevRep,
      className: className.trim(),
      grade: parseGrade(className),
      parentName: parentName.trim(),
      childName: childName.trim(),
      isWillingCommittee: !!isWillingCommittee,
      hasOtherClasses: !!hasOtherClasses,
      otherClassesText: (otherClassesText || "").trim(),
      hasOtherFamilyReps: !!hasOtherFamilyReps,
      otherFamilyRepsText: (otherFamilyRepsText || "").trim(),
      registered: true
    };

    // Re-run the deduplication rules and save
    db.parentReps = processDeduplicationRules(db.parentReps);
    
    // Log action
    db.logs.push({
      timestamp: new Date().toISOString(),
      message: `代表家長 ${parentName.trim()} (班級:${className.trim()}) 已利用 Key [${key}] 完成登錄與首輪資格篩選狀態！`
    });

    saveDb(db);
    res.json({ success: true, parent: db.parentReps[parentIndex] });
  });

  // CAST VOTES (Voters submit ballot)
  app.post("/api/vote", (req, res) => {
    const { voterKey, targetKeys } = req.body;
    if (!voterKey || !targetKeys || !Array.isArray(targetKeys)) {
      return res.status(400).json({ success: false, message: "投票資料格式不正確！" });
    }

    const db = readDb();

    // Check voter exists & is qualified
    let voter: { key: string; parentName: string; grade: number; disqualified: boolean; isCommittee: boolean; isSpecialEd: boolean } | undefined;
    if (voterKey.trim().toUpperCase() === db.config.specialEdMember.key) {
      voter = {
        key: db.config.specialEdMember.key,
        parentName: db.config.specialEdMember.name,
        grade: 0,
        disqualified: false,
        isCommittee: true,
        isSpecialEd: true
      };
    } else {
      voter = db.parentReps.find(r => r.key === voterKey.trim().toUpperCase());
    }

    if (!voter) {
      return res.status(404).json({ success: false, message: "投票者識別碼無效！" });
    }

    if (voter.disqualified) {
      return res.status(403).json({ success: false, message: "很抱歉，此組帳號已因『重複代表』或『同戶雙代表』法規，經系統除錯篩選後不具備投票資格。" });
    }

    if (!db.config.votingActive) {
      return res.status(403).json({ success: false, message: "當前投票環節尚未開放或已結算！" });
    }

    const currentRound = db.config.currentRoundId;

    // Check if voter already voted in this round
    const alreadyVoted = db.votes.some(v => v.roundId === currentRound && v.voterKey === voter!.key);
    if (alreadyVoted) {
      return res.status(403).json({ success: false, message: "本組識別碼已於此投票階段完成投票，無法重複投遞！" });
    }

    // Role-based authorization & Ballot verification for each round
    if (currentRound === "grade_committee") {
      // Parent Representative voting for their own grade candidates
      // Check: Max 4 votes, same grade
      if (targetKeys.length === 0 || targetKeys.length > 4) {
        return res.status(400).json({ success: false, message: "本輪（家長委員選舉）每人最少圈選 1 人，最多可以圈選 4 人！" });
      }

      // Check candidates grade
      const anyWrongGrade = targetKeys.some(tk => {
        const candidate = db.parentReps.find(r => r.key === tk);
        return !candidate || candidate.grade !== voter!.grade || candidate.disqualified;
      });

      if (anyWrongGrade) {
        return res.status(400).json({ success: false, message: "您只能圈選同一個年段且具備資格的家長代表候選人！" });
      }

    } else if (currentRound === "grade_tie_breaker") {
      // Find the specific active grade tie-breaker
      const activeGradeGb = Object.entries(db.config.gradeTieBreakers).find(([_, tb]) => tb.active && !tb.resolved);
      if (!activeGradeGb) {
        return res.status(400).json({ success: false, message: "當前年級同票二輪投票尚未啟用。" });
      }

      const activeGrade = parseInt(activeGradeGb[0], 10);
      if (voter.grade !== activeGrade) {
        return res.status(403).json({ success: false, message: `本輪僅開放屬 ${activeGrade} 年段的代表進行二輪同票表決！` });
      }

      if (targetKeys.length !== 1) {
        return res.status(400).json({ success: false, message: "二輪同票投票，每人限精準圈選 1 位候選人！" });
      }

      const tbState = activeGradeGb[1];
      if (!tbState.candidates.includes(targetKeys[0])) {
        return res.status(400).json({ success: false, message: "圈選對象非本次二輪投票的同票候選人！" });
      }

    } else if (currentRound === "constant_committee") {
      // Committee Members (the 24 + 1 SpecialEd) voting for Constant Committee
      // Check voter is in the 25
      const isEligibleCommittee = voter.isCommittee || voter.isSpecialEd;
      if (!isEligibleCommittee) {
        return res.status(403).json({ success: false, message: "本輪『常務委員選舉』僅限獲選的 25 位家長委員進行投票！" });
      }

      if (targetKeys.length !== 1) {
        return res.status(400).json({ success: false, message: "常務委員選舉為一人一票，限精準圈選 1 位！" });
      }

      // Check candidate is one of the 25
      const isSped = targetKeys[0] === db.config.specialEdMember.key;
      const cand = db.parentReps.find(r => r.key === targetKeys[0]);
      if (!isSped && (!cand || !cand.isCommittee)) {
        return res.status(400).json({ success: false, message: "投遞之對象非合法家長委員候選人！" });
      }

    } else if (currentRound === "constant_tie_breaker") {
      const isEligibleCommittee = voter.isCommittee || voter.isSpecialEd;
      if (!isEligibleCommittee) {
        return res.status(403).json({ success: false, message: "同票二輪常務委員投票僅限家長委員參與！" });
      }

      if (targetKeys.length !== 1) {
        return res.status(400).json({ success: false, message: "二輪投票，限圈選 1 位！" });
      }

      if (!db.config.constantTieBreaker.candidates.includes(targetKeys[0])) {
        return res.status(400).json({ success: false, message: "該候選人非列於本次二輪同票決議之常委名單。" });
      }

    } else if (currentRound === "president") {
      // 25 members voting for 1 President from 9 Constant Committee members
      const isEligibleCommittee = voter.isCommittee || voter.isSpecialEd;
      if (!isEligibleCommittee) {
        return res.status(403).json({ success: false, message: "本輪『家長會長選舉』僅限獲選的 25 位家長委員進行投票！" });
      }

      if (targetKeys.length !== 1) {
        return res.status(400).json({ success: false, message: "會長選舉為一人一票，限圈選 1 位！" });
      }

      // Candidate must be a Constant Committee member
      const cand = db.parentReps.find(r => r.key === targetKeys[0]);
      if (!cand || !cand.isConstantCommittee) {
        return res.status(400).json({ success: false, message: "會長候選人必須從上一輪當選之 9 位常務委員中去圈選！" });
      }

    } else if (currentRound === "president_tie_breaker") {
      const isEligibleCommittee = voter.isCommittee || voter.isSpecialEd;
      if (!isEligibleCommittee) {
        return res.status(403).json({ success: false, message: "首領二輪同票投票僅限家長委員參與！" });
      }

      if (targetKeys.length !== 1) {
        return res.status(400).json({ success: false, message: "限制精準圈選 1 位！" });
      }

      if (!db.config.presidentTieBreaker.candidates.includes(targetKeys[0])) {
        return res.status(400).json({ success: false, message: "該候選人未參與本次會長同票表決。" });
      }
    } else {
      return res.status(400).json({ success: false, message: "當前非可投票之階段！" });
    }

    // Cast vote successfully
    db.votes.push({
      roundId: currentRound,
      voterKey: voter.key,
      targetKeys: targetKeys,
      timestamp: new Date().toISOString()
    });

    db.logs.push({
      timestamp: new Date().toISOString(),
      message: `家長代表 ${voter.parentName} (${voterKey.trim().toUpperCase()}) 於 [${currentRound}] 投下有效票`
    });

    saveDb(db);
    res.json({ success: true, message: "投票成功！您的選票已安全計入統計看板。" });
  });

  // ADMIN CONTROL: SET ACTIVE ROUND
  app.post("/api/admin/set-round", (req, res) => {
    const { roundId, votingActive } = req.body;
    if (!roundId) {
      return res.status(400).json({ success: false, message: "請指定階段識別碼！" });
    }

    const db = readDb();
    db.config.currentRoundId = roundId;
    if (votingActive !== undefined) {
      db.config.votingActive = !!votingActive;
    }

    // Handle round transition business logic automatically (e.g. counting votes and finding who is elected)
    if (roundId === "grade_committee" && votingActive) {
      // Reset committee choices from previous runs to run a clean new vote
      db.parentReps.forEach(r => r.isCommittee = false);
      db.config.gradeTieBreakers = {};
    }

    // If advancing from grade_committee to next, tallies and detects ties
    if (roundId === "grade_tie_breaker" && !votingActive) {
      // Usually admin would close Grade Committee first
    }

    db.logs.push({
      timestamp: new Date().toISOString(),
      message: `後台管理：將選舉進度調至 [${roundId}]，投票通道設為: ${votingActive ? "開啟" : "關閉"}`
    });

    saveDb(db);
    res.json({ success: true, state: db });
  });

  // ADMIN: APPONT SPECIAL ED MEMBER
  app.post("/api/admin/set-special-ed", (req, res) => {
    const { name, className, childName } = req.body;
    if (!name || !className || !childName) {
      return res.status(400).json({ success: false, message: "請填寫特教委員家長姓名、班級與小孩姓名！" });
    }

    const db = readDb();
    db.config.specialEdMember.name = name;
    db.config.specialEdMember.className = className;
    db.config.specialEdMember.childName = childName;

    db.logs.push({
      timestamp: new Date().toISOString(),
      message: `校長特別指派特教家長委員為：${name}（學生：${childName}，隸屬：${className}，已賦予 5 碼專屬 Key: [${db.config.specialEdMember.key}]）`
    });

    saveDb(db);
    res.json({ success: true, state: db });
  });

  // ADMIN: FORCE REGISTER OR ADD REPRESENTATIVE
  app.post("/api/admin/manual-register", (req, res) => {
    const { key, className, parentName, childName, isWillingCommittee } = req.body;
    if (!key || !className || !parentName || !childName) {
      return res.status(400).json({ success: false, message: "資料填寫未齊！" });
    }

    const db = readDb();
    const idx = db.parentReps.findIndex(r => r.key === key.trim().toUpperCase());
    if (idx === -1) {
      return res.status(404).json({ success: false, message: "找不到該 Key！" });
    }

    db.parentReps[idx] = {
      ...db.parentReps[idx],
      className: className.trim(),
      grade: parseGrade(className),
      parentName: parentName.trim(),
      childName: childName.trim(),
      isWillingCommittee: !!isWillingCommittee,
      registered: true
    };

    db.parentReps = processDeduplicationRules(db.parentReps);
    db.logs.push({
      timestamp: new Date().toISOString(),
      message: `管理員手動進行家長登錄更正：${parentName.trim()} (${className.trim()})，識別碼：${key}`
    });

    saveDb(db);
    res.json({ success: true, state: db });
  });

  // ADMIN TALLY & ADVANCE - SMART AUTOMATION FOR ROUND TRANSITIONS
  app.post("/api/admin/tally-round", (req, res) => {
    const db = readDb();
    const currentRound = db.config.currentRoundId;
    const votes = db.votes.filter(v => v.roundId === currentRound);

    db.logs.push({
      timestamp: new Date().toISOString(),
      message: `後台管理：發動開票與當選人資格檢算（本次環節總收取 ${votes.length} 張選票）`
    });

    if (currentRound === "grade_committee") {
      // 1. Tally first round of Grade Committee (Elect 4 per grade)
      // Candidates are registered, qualified, and willing representatives of each grade
      const willingCandidates = db.parentReps.filter(r => r.registered && !r.disqualified && r.isWillingCommittee);
      
      // Calculate votes for each candidate
      const candVotesMap: { [key: string]: number } = {};
      willingCandidates.forEach(c => candVotesMap[c.key] = 0);
      votes.forEach(vt => {
        vt.targetKeys.forEach(tk => {
          if (candVotesMap[tk] !== undefined) {
            candVotesMap[tk]++;
          }
        });
      });

      // Process grade by grade
      let anyTiesActive = false;
      const gradeTieBreakers: { [grade: number]: TieBreakerState } = {};

      for (let g = 1; g <= 6; g++) {
        const gradeCands = willingCandidates.filter(c => c.grade === g);
        
        // Sort by votes descending
        const scoredCands = gradeCands.map(c => ({
          key: c.key,
          parentName: c.parentName,
          className: c.className,
          votesCount: candVotesMap[c.key] || 0
        })).sort((a, b) => b.votesCount - a.votesCount);

        // We want top 4
        if (scoredCands.length <= 4) {
          // Everyone willing is selected (fewer candidates than seats)
          scoredCands.forEach(sc => {
            const index = db.parentReps.findIndex(r => r.key === sc.key);
            if (index !== -1) db.parentReps[index].isCommittee = true;
          });
          db.logs.push({
            timestamp: new Date().toISOString(),
            message: `年段 ${g} 年級：候選人數 ${scoredCands.length} 小於等於席次 4，全員逕行當選為家長委員！`
          });
        } else {
          // We have a list. Check for ties around the 4th position (index 3 in sorted list)
          const cutOffVotes = scoredCands[3].votesCount;
          
          // Winners definitely above cutOff
          const clearWinners = scoredCands.filter(c => c.votesCount > cutOffVotes);
          // Tied matching the exact cutOff value
          const tiedCands = scoredCands.filter(c => c.votesCount === cutOffVotes);

          if (clearWinners.length + tiedCands.length === 4) {
            // No tie-breaker needed, exactly 4 people equal or exceed cutoff (all tied values fall exactly into 4 seats)
            const allWinners = [...clearWinners, ...tiedCands];
            allWinners.forEach(sc => {
              const index = db.parentReps.findIndex(r => r.key === sc.key);
              if (index !== -1) db.parentReps[index].isCommittee = true;
            });
            db.logs.push({
              timestamp: new Date().toISOString(),
              message: `年段 ${g} 年級：最高票順利產出 4 位當選人（當選門檻最低為 ${cutOffVotes} 票）`
            });
          } else {
            // We have a tie resolving the 4th place.
            // E.g., clearWinners = 2 people, tiedCands = 3 people (who have the same votes). We need to select 2 out of these 3.
            // Mark clearWinners as already elected
            clearWinners.forEach(sc => {
              const index = db.parentReps.findIndex(r => r.key === sc.key);
              if (index !== -1) db.parentReps[index].isCommittee = true;
            });

            // Put tied Candidates into a Tie-Breaker
            anyTiesActive = true;
            gradeTieBreakers[g] = {
              active: true,
              grade: g,
              candidates: tiedCands.map(tc => tc.key),
              resolved: false
            };

            db.logs.push({
              timestamp: new Date().toISOString(),
              message: `警報！${g} 年級出現同票現象。席位賸餘需在特選之同票候選人中行使第二輪投決：${tiedCands.map(tc => `${tc.parentName} (${tc.votesCount}票)`).join("、")}`
            });
          }
        }
      }

      if (anyTiesActive) {
        db.config.currentRoundId = "grade_tie_breaker";
        db.config.votingActive = true;
        db.config.gradeTieBreakers = gradeTieBreakers;
      } else {
        // No ties, advance directly to Stage 5: Constant Committee voting
        db.config.currentRoundId = "constant_committee";
        db.config.votingActive = true;
        db.logs.push({
          timestamp: new Date().toISOString(),
          message: "各年級第一輪投票已全數順利選出共 24 名年級家長委員！緊接著進入第二階段：首屆常務委員選舉投票。"
        });
      }

    } else if (currentRound === "grade_tie_breaker") {
      // We are resolving ties for each active grade tie-breaker
      let remainingTies = false;
      const activeGradeGb = Object.entries(db.config.gradeTieBreakers).find(([_, tb]) => tb.active && !tb.resolved);

      if (activeGradeGb) {
        const grade = parseInt(activeGradeGb[0], 10);
        const tbState = activeGradeGb[1];
        
        // Count re-votes
        const votesCast = db.votes.filter(v => v.roundId === "grade_tie_breaker");
        const scores: { [key: string]: number } = {};
        tbState.candidates.forEach(k => scores[k] = 0);
        
        votesCast.forEach(v => {
          if (v.targetKeys && v.targetKeys[0] && scores[v.targetKeys[0]] !== undefined) {
            scores[v.targetKeys[0]]++;
          }
        });

        // Find how many slots we still need to fill for this grade
        const alreadyElectedCount = db.parentReps.filter(r => r.grade === grade && r.isCommittee).length;
        const slotsNeeded = 4 - alreadyElectedCount;

        // Sort tied Candidates based on re-vote score
        const sortedTb = tbState.candidates.map(k => ({
          key: k,
          name: db.parentReps.find(r => r.key === k)?.parentName || "",
          score: scores[k] || 0
        })).sort((a, b) => b.score - a.score);

        // Check if top 'slotsNeeded' have clean break from next
        // E.g. slotsNeeded = 1, sortedTb[0] = 5 votes, sortedTb[1] = 3 votes -> resolved!
        let canResolve = false;
        if (sortedTb.length >= slotsNeeded) {
          if (slotsNeeded === sortedTb.length) {
            canResolve = true; // All slots match exactly the candidates (all win)
          } else {
            const cutOffScore = sortedTb[slotsNeeded - 1].score;
            const clearWinners = sortedTb.filter(x => x.score > cutOffScore);
            const edgeTied = sortedTb.filter(x => x.score === cutOffScore);
            
            if (clearWinners.length + edgeTied.length === slotsNeeded) {
              canResolve = true;
            }
          }
        }

        if (canResolve) {
          // Elect the top slotsNeeded
          for (let s = 0; s < slotsNeeded; s++) {
            const key = sortedTb[s].key;
            const index = db.parentReps.findIndex(r => r.key === key);
            if (index !== -1) db.parentReps[index].isCommittee = true;
          }

          db.config.gradeTieBreakers[grade].resolved = true;
          db.config.gradeTieBreakers[grade].resolvedWinner = sortedTb.slice(0, slotsNeeded).map(x => x.key).join(",");
          db.config.gradeTieBreakers[grade].resolveMethod = "vote";

          db.logs.push({
            timestamp: new Date().toISOString(),
            message: `恭喜！${grade} 年級二輪同票表決獲出成果。當選家長委員：${sortedTb.slice(0, slotsNeeded).map(x => `${x.name} (${x.score}票)`).join("、")}`
          });
        } else {
          // Still a tie! Let the head master / president draw lots. We retain tie breaker active but flag draw option
          db.logs.push({
            timestamp: new Date().toISOString(),
            message: `警報！二輪重選後，${grade} 年級候選人依舊同分（${sortedTb.map(x => `${x.name}護 ${x.score}票`).join("、")}）。請大會主席（會長或校長）於後台發動『隨機抽籤輪盤』選取本班最後代表！`
          });
          // We don't advance yet till draw-lots resolve this grade
          // Save and exit
          saveDb(db);
          return res.json({ success: true, state: db, drawLotsRequired: true, tiedGrade: grade, candidates: sortedTb });
        }
      }

      // Check if more grades have pending tie-breakers
      const nextPendingGb = Object.entries(db.config.gradeTieBreakers).find(([_, tb]) => tb.active && !tb.resolved);
      if (!nextPendingGb) {
        // All grade ties resolved! Transition to Constant Committee Election
        db.config.currentRoundId = "constant_committee";
        db.config.votingActive = true;
        db.logs.push({
          timestamp: new Date().toISOString(),
          message: "所有年級家長委員當選名單（共 24 人）已全部補齊底定！正式開啟一票常務委員選舉環節。"
        });
      } else {
        db.config.votingActive = true; // reset votingActive for next Grade Tie-Breaker
        db.logs.push({
          timestamp: new Date().toISOString(),
          message: `載入下一個待決同票年級：【${nextPendingGb[0]} 年級】進行二輪二審表決投票。`
        });
      }

    } else if (currentRound === "constant_committee") {
      // 2. Tally Constant Committee (Elect 9 from 25)
      // Candidates are the 24 elected parent committee members + 1 Special Ed member
      const activeCommitteeList = db.parentReps.filter(r => r.isCommittee);
      const candidates = [...activeCommitteeList];
      // Make sure Sped key is supported
      const spedMember = db.config.specialEdMember;
      
      const scores: { [key: string]: number } = {};
      candidates.forEach(c => scores[c.key] = 0);
      scores[spedMember.key] = 0;

      votes.forEach(vt => {
        vt.targetKeys.forEach(tk => {
          if (scores[tk] !== undefined) {
            scores[tk]++;
          }
        });
      });

      // Map combined candidatos
      const combineCandidates = [
        ...candidates.map(c => ({ key: c.key, name: c.parentName, details: `${c.className} 班`, score: scores[c.key] || 0 })),
        { key: spedMember.key, name: spedMember.name, details: spedMember.className, score: scores[spedMember.key] || 0 }
      ].sort((a, b) => b.score - a.score);

      // Select top 9
      const cutOffScore = combineCandidates[8].score;
      const clearWinners = combineCandidates.filter(x => x.score > cutOffScore);
      const tiedCands = combineCandidates.filter(x => x.score === cutOffScore);

      if (clearWinners.length + tiedCands.length === 9) {
        // No tie-breaker needed, exactly 9 people equal or exceed cutoff (all tied values fall exactly into 9 seats)
        const allWinners = [...clearWinners, ...tiedCands];
        allWinners.forEach(sc => {
          if (sc.key === spedMember.key) {
            // Special Ed can be a Constant Committee
            // we flag it
          } else {
            const idx = db.parentReps.findIndex(r => r.key === sc.key);
            if (idx !== -1) db.parentReps[idx].isConstantCommittee = true;
          }
        });

        // Save Sped Committee separate flag if selected
        // We'll add a helper field on state or store
        
        db.config.currentRoundId = "president";
        db.config.votingActive = true;
        db.logs.push({
          timestamp: new Date().toISOString(),
          message: `首屆 9 名常務委員已依投票率最高無爭議產出：${allWinners.map(x => `${x.name} (${x.score}票)`).join("、")}。進入最終階段：家長會長公投！`
        });
      } else {
        // Tie-breaker for Constant Committee
        clearWinners.forEach(sc => {
          const idx = db.parentReps.findIndex(r => r.key === sc.key);
          if (idx !== -1) db.parentReps[idx].isConstantCommittee = true;
        });

        db.config.currentRoundId = "constant_tie_breaker";
        db.config.votingActive = true;
        db.config.constantTieBreaker = {
          active: true,
          candidates: tiedCands.map(tc => tc.key),
          resolved: false
        };

        db.logs.push({
          timestamp: new Date().toISOString(),
          message: `常務委員席位在排名第 9 名時，出現同票競爭！參與常委二輪票選名單：${tiedCands.map(tc => `${tc.name} (${tc.score}票)`).join("、")}`
        });
      }

    } else if (currentRound === "constant_tie_breaker") {
      // Resolve Constant Committee tie-breaker
      const tbState = db.config.constantTieBreaker;
      const scores: { [key: string]: number } = {};
      tbState.candidates.forEach(k => scores[k] = 0);

      votes.forEach(vt => {
        if (vt.targetKeys && vt.targetKeys[0] && scores[vt.targetKeys[0]] !== undefined) {
          scores[vt.targetKeys[0]]++;
        }
      });

      // Find how many slots we still need to fill
      // Special Ed Constant Committee tracker or standard reps
      const alreadyElectedCount = db.parentReps.filter(r => r.isConstantCommittee).length;
      const slotsNeeded = 9 - alreadyElectedCount;

      const sortedTb = tbState.candidates.map(k => {
        let name = "";
        if (k === db.config.specialEdMember.key) name = db.config.specialEdMember.name;
        else name = db.parentReps.find(r => r.key === k)?.parentName || "";

        return { key: k, name: name, score: scores[k] || 0 };
      }).sort((a, b) => b.score - a.score);

      let canResolve = false;
      if (sortedTb.length >= slotsNeeded) {
        if (slotsNeeded === sortedTb.length) {
          canResolve = true;
        } else {
          const cutOffScore = sortedTb[slotsNeeded - 1].score;
          const clearWinners = sortedTb.filter(x => x.score > cutOffScore);
          const edgeTied = sortedTb.filter(x => x.score === cutOffScore);
          
          if (clearWinners.length + edgeTied.length === slotsNeeded) {
            canResolve = true;
          }
        }
      }

      if (canResolve) {
        for (let s = 0; s < slotsNeeded; s++) {
          const key = sortedTb[s].key;
          const idx = db.parentReps.findIndex(r => r.key === key);
          if (idx !== -1) db.parentReps[idx].isConstantCommittee = true;
        }

        db.config.constantTieBreaker.resolved = true;
        db.config.constantTieBreaker.resolvedWinner = sortedTb.slice(0, slotsNeeded).map(x => x.key).join(",");
        db.config.constantTieBreaker.resolveMethod = "vote";

        // Advance to President
        db.config.currentRoundId = "president";
        db.config.votingActive = true;

        db.logs.push({
          timestamp: new Date().toISOString(),
          message: `常委二輪表決成功。補實常委：${sortedTb.slice(0, slotsNeeded).map(x => `${x.name} (${x.score}票)`).join("、")}。現在進入：家長會長選舉！`
        });
      } else {
        // Still tie! Require Draw lots
        db.logs.push({
          timestamp: new Date().toISOString(),
          message: `常委二輪表決依舊同分（${sortedTb.map(x => `${x.name} 獲 ${x.score}票`).join("、")}）。請會長點擊系統執行『常委隨機抽籤』！`
        });
        saveDb(db);
        return res.json({ success: true, state: db, drawLotsRequired: true, type: "constant", candidates: sortedTb });
      }

    } else if (currentRound === "president") {
      // 3. Tally President (Elect 1 from 9 Constant Committee)
      const candList = db.parentReps.filter(r => r.isConstantCommittee);
      const scores: { [key: string]: number } = {};
      candList.forEach(c => scores[c.key] = 0);

      votes.forEach(vt => {
        if (vt.targetKeys && vt.targetKeys[0] && scores[vt.targetKeys[0]] !== undefined) {
          scores[vt.targetKeys[0]]++;
        }
      });

      const scoredCands = candList.map(c => ({
        key: c.key,
        name: c.parentName,
        className: c.className,
        score: scores[c.key] || 0
      })).sort((a, b) => b.score - a.score);

      // Check for ties at top spot (index 0)
      const topScore = scoredCands[0].score;
      const topTied = scoredCands.filter(x => x.score === topScore);

      if (topTied.length === 1) {
        // Single winner is president!
        const winKey = topTied[0].key;
        const idx = db.parentReps.findIndex(r => r.key === winKey);
        if (idx !== -1) db.parentReps[idx].isPresident = true;

        db.config.currentRoundId = "finished";
        db.config.votingActive = false;
        
        db.logs.push({
          timestamp: new Date().toISOString(),
          message: `【歷史性時刻】一任大選計票落成！恭喜由 ${topTied[0].name}（班級：${topTied[0].className}）榮獲 ${topScore} 票，榮登本屆家長會長！`
        });
      } else {
        // Tie for president
        db.config.currentRoundId = "president_tie_breaker";
        db.config.votingActive = true;
        db.config.presidentTieBreaker = {
          active: true,
          candidates: topTied.map(tc => tc.key),
          resolved: false
        };

        db.logs.push({
          timestamp: new Date().toISOString(),
          message: `高票同分！兩位或以上之常務委員以最高 ${topScore} 票並列會長人選，即日起召開首領投票第二輪對決：${topTied.map(x => x.name).join("、")}`
        });
      }

    } else if (currentRound === "president_tie_breaker") {
      // Resolve President tie-breaker
      const tbState = db.config.presidentTieBreaker;
      const scores: { [key: string]: number } = {};
      tbState.candidates.forEach(k => scores[k] = 0);

      votes.forEach(vt => {
        if (vt.targetKeys && vt.targetKeys[0] && scores[vt.targetKeys[0]] !== undefined) {
          scores[vt.targetKeys[0]]++;
        }
      });

      const sortedTb = tbState.candidates.map(k => {
        const rep = db.parentReps.find(r => r.key === k)!;
        return { key: k, name: rep.parentName, className: rep.className, score: scores[k] || 0 };
      }).sort((a, b) => b.score - a.score);

      const topScore = sortedTb[0].score;
      const topTied = sortedTb.filter(x => x.score === topScore);

      if (topTied.length === 1) {
        const winKey = topTied[0].key;
        const idx = db.parentReps.findIndex(r => r.key === winKey);
        if (idx !== -1) db.parentReps[idx].isPresident = true;

        db.config.currentRoundId = "finished";
        db.config.votingActive = false;
        db.config.presidentTieBreaker.resolved = true;
        db.config.presidentTieBreaker.resolvedWinner = winKey;
        db.config.presidentTieBreaker.resolveMethod = "vote";

        db.logs.push({
          timestamp: new Date().toISOString(),
          message: `二輪會長當選決：恭喜 ${topTied[0].name}（班級：${topTied[0].className}）獲票 ${topScore} 順利出線！`
        });
      } else {
        // Still tie-breaker draw lots
        db.logs.push({
          timestamp: new Date().toISOString(),
          message: `二輪對抗高潮再創平手！會長人選高票依舊僵持不分（${sortedTb.map(x => `${x.name} ${x.score}票`).join("、")}）。需請主席啟動『抽籤會長輪盤』決定大任！`
        });
        saveDb(db);
        return res.json({ success: true, state: db, drawLotsRequired: true, type: "president", candidates: sortedTb });
      }
    }

    saveDb(db);
    res.json({ success: true, state: db });
  });

  // ADMIN: DRAW LOTS (DRAW LOTTERY WHEEL / RANDOM LOTS DECISIONS)
  app.post("/api/admin/draw-lots", (req, res) => {
    const { type, grade } = req.body;
    const db = readDb();
    
    if (type === "grade" && grade) {
      const gNum = parseInt(grade, 10);
      const tb = db.config.gradeTieBreakers[gNum];
      if (!tb || !tb.active || tb.resolved) {
        return res.status(400).json({ success: false, message: "無待決同票年級資訊" });
      }

      // Count vacancies remaining
      const alreadyElected = db.parentReps.filter(r => r.grade === gNum && r.isCommittee).length;
      const vacancies = 4 - alreadyElected;

      // Shuffle candidates and pick
      const pool = [...tb.candidates];
      // Shuffle Helper
      const shuffled = pool.sort(() => Math.random() - 0.5);
      const winners = shuffled.slice(0, vacancies);

      winners.forEach(wk => {
        const index = db.parentReps.findIndex(r => r.key === wk);
        if (index !== -1) db.parentReps[index].isCommittee = true;
      });

      db.config.gradeTieBreakers[gNum].resolved = true;
      db.config.gradeTieBreakers[gNum].resolvedWinner = winners.join(",");
      db.config.gradeTieBreakers[gNum].resolveMethod = "draw";

      db.logs.push({
        timestamp: new Date().toISOString(),
        message: `【大會抽籤結果】進行 ${gNum} 年級家長委員抽籤（候選:${tb.candidates.map(k=>db.parentReps.find(r=>r.key===k)?.parentName).join("、")}）。幸運獲選人：${winners.map(wk => db.parentReps.find(r => r.key === wk)?.parentName).join("、")}！`
      });

      // Check next
      const nextPendingGb = Object.entries(db.config.gradeTieBreakers).find(([_, t]) => t.active && !t.resolved);
      if (!nextPendingGb) {
        db.config.currentRoundId = "constant_committee";
        db.config.votingActive = true;
        db.logs.push({
          timestamp: new Date().toISOString(),
          message: "各年級委員抽籤全部結案！24 名委員順利到齊。即日起開始下一屆『常務委員選舉』！"
        });
      }

    } else if (type === "constant") {
      const tb = db.config.constantTieBreaker;
      if (!tb || !tb.active || tb.resolved) {
        return res.status(400).json({ success: false, message: "無待決同票常委資訊" });
      }

      const alreadyElected = db.parentReps.filter(r => r.isConstantCommittee).length;
      const vacancies = 9 - alreadyElected;

      const shuffled = [...tb.candidates].sort(() => Math.random() - 0.5);
      const winners = shuffled.slice(0, vacancies);

      winners.forEach(wk => {
        const index = db.parentReps.findIndex(r => r.key === wk);
        if (index !== -1) db.parentReps[index].isConstantCommittee = true;
      });

      db.config.constantTieBreaker.resolved = true;
      db.config.constantTieBreaker.resolvedWinner = winners.join(",");
      db.config.constantTieBreaker.resolveMethod = "draw";

      db.config.currentRoundId = "president";
      db.config.votingActive = true;

      db.logs.push({
        timestamp: new Date().toISOString(),
        message: `【常委抽籤結果】大會進行常務委員缺額抽籤。幸運獲選人：${winners.map(wk => {
          if (wk === db.config.specialEdMember.key) return db.config.specialEdMember.name;
          return db.parentReps.find(r => r.key === wk)?.parentName;
        }).join("、")}！常委補齊，即起進行會長投票。`
      });

    } else if (type === "president") {
      const tb = db.config.presidentTieBreaker;
      if (!tb || !tb.active || tb.resolved) {
        return res.status(400).json({ success: false, message: "無待決會長資訊" });
      }

      const shuffled = [...tb.candidates].sort(() => Math.random() - 0.5);
      const winner = shuffled[0];

      const index = db.parentReps.findIndex(r => r.key === winner);
      if (index !== -1) db.parentReps[index].isPresident = true;

      db.config.presidentTieBreaker.resolved = true;
      db.config.presidentTieBreaker.resolvedWinner = winner;
      db.config.presidentTieBreaker.resolveMethod = "draw";

      db.config.currentRoundId = "finished";
      db.config.votingActive = false;

      const winRep = db.parentReps.find(r => r.key === winner)!;
      db.logs.push({
        timestamp: new Date().toISOString(),
        message: `【首領大抽籤】莊嚴、公平！會長人選經神聖抽籤落成：恭喜由常委 ${winRep.parentName} (${winRep.className} 班) 榮任本屆新任家長會長！`
      });

    } else {
      return res.status(400).json({ success: false, message: "無效的抽籤類型或缺少參數" });
    }

    saveDb(db);
    res.json({ success: true, state: db });
  });

  // FRONTEND SERVER / STATIC SPA MIDDLEWARE HOOK FOR FAST REFRESH
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[VOTING ROOT PORT:3000] Server successfully running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
