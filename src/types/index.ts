export interface Competition {
  id: string;
  name: string;
  description: string;
  coordinator: string;
  password: string; // Unique ID to enter
  duration: number; // in seconds
  status: 'Upcoming' | 'Live' | 'Ended';
  texts: string[]; // Exactly 5 passages
  imageUrl?: string;
  createdAt: number;
}

export interface Participant {
  id: string; // Roll number is the ID
  name: string;
  rollNo: string;
  class: string;
  section: string;
  isRegistered: boolean;
  hasParticipated: boolean;
  status: 'Pending' | 'Disqualified' | 'Completed';
  warnings: number;
  score?: {
    wpm: number;
    accuracy: number;
    errors: number;
    time: number;
    submittedAt: number;
  };
}
