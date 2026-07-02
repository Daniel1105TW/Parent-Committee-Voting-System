export interface ParentRep {
  key: string;
  className: string;
  grade: number;
  parentName: string;
  childName: string;
  isWillingCommittee: boolean;
  hasOtherClasses: boolean;
  otherClassesText: string;
  hasOtherFamilyReps?: boolean;
  otherFamilyRepsText?: string;
  registered: boolean;
  disqualified: boolean;
  disqualificationReason: string;
  isCommittee: boolean;
  isSpecialEd: boolean;
  isConstantCommittee: boolean;
  isPresident: boolean;
}

export interface VoteCast {
  roundId: string;
  voterKey: string;
  targetKeys: string[];
  timestamp: string;
}

export interface TieBreakerState {
  active: boolean;
  grade?: number;
  candidates: string[];
  resolved: boolean;
  resolvedWinner?: string;
  resolveMethod?: "vote" | "draw";
}

export interface ElectionConfig {
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

export interface DatabaseState {
  parentReps: ParentRep[];
  votes: VoteCast[];
  config: ElectionConfig;
  logs: { timestamp: string; message: string }[];
}
