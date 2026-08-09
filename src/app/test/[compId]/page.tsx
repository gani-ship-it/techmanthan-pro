'use client';

import { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Competition, Participant } from '@/types';
import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';

const playAudioTone = (freq: number, type: OscillatorType, duration: number) => {
  if (typeof window === 'undefined') return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.warn("Audio Context blocked or unsupported:", e);
  }
};

export default function TypingTestEngine({ params }: { params: { compId: string } }) {
  const router = useRouter();

  // Data State
  const [comp, setComp] = useState<Competition | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [loading, setLoading] = useState(true);

  // Anti-Cheat State
  const [warnings, setWarnings] = useState(0);
  const [isDisqualified, setIsDisqualified] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  // Typing Render State
  const [words, setWords] = useState<string[]>([]);
  // Flat character index cursor (includes spaces between words)
  const [charIndex, setCharIndex] = useState(0);

  // Countdown State
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [countdown, setCountdown] = useState(3);

  // Live Telemetry Stats
  const [liveWpm, setLiveWpm] = useState(0);
  const [liveAccuracy, setLiveAccuracy] = useState(100);
  const [liveErrors, setLiveErrors] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [isTestRunning, setIsTestRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  // Offline & Recovery State
  const [isOfflineSaved, setIsOfflineSaved] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  // Scrolling state — MonkeyType 3-line window
  const [scrollY, setScrollY] = useState(0);
  const wordSpanRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // High-Performance Mutable References
  const charIndexRef = useRef(0);          // current position in fullText
  const fullTextRef  = useRef('');          // words joined with single spaces
  // charStates: 'c' correct | 'w' wrong | 'u' untyped — one per char in fullText
  const charStatesRef = useRef<string[]>([]);
  const correctCharsRef = useRef(0);
  const errorsRef = useRef(0);
  const wordsRef = useRef<string[]>([]);
  const isTestRunningRef = useRef(false);
  const isFinishedRef = useRef(false);
  const isDisqualifiedRef = useRef(false);

  const startTimeRef = useRef<number | null>(null);
  const finalStatsRef = useRef({ wpm: 0, accuracy: 0, timeSpent: 0, errors: 0 });

  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Initial Load & Session Verification
  useEffect(() => {
    const initTest = async () => {
      try {
        const sessionStr = localStorage.getItem('techmanthan_session');
        if (!sessionStr) {
          alert("No active session. Please register first.");
          router.push(`/competition/${params.compId}`);
          return;
        }

        const session = JSON.parse(sessionStr);
        if (session.compId !== params.compId) {
          router.push(`/competition/${params.compId}`);
          return;
        }

        // Fetch Competition
        const compSnap = await getDoc(doc(db, 'competitions', params.compId));
        if (!compSnap.exists()) {
          alert("Competition not found.");
          router.push('/');
          return;
        }
        const c = { id: compSnap.id, ...compSnap.data() } as Competition;
        setComp(c);
        setTimeLeft(c.duration);

        // Fetch Participant
        const pRef = doc(db, `competitions/${c.id}/participants`, session.rollNo);
        const pSnap = await getDoc(pRef);
        
        let p: Participant;
        if (pSnap.exists()) {
          const pData = pSnap.data() as Participant;
          if (pData.hasParticipated || pData.status === 'Completed' || pData.status === 'Disqualified') {
            alert("You have already completed or submitted a test for this competition.");
            localStorage.removeItem('techmanthan_session');
            router.push('/');
            return;
          }
          p = pData;
        } else {
          p = {
            id: session.rollNo,
            rollNo: session.rollNo,
            name: session.name || 'Participant',
            class: session.class || '',
            section: '',
            isRegistered: true,
            hasParticipated: false,
            status: 'Pending',
            warnings: 0
          };
        }

        setParticipant(p);
        setWarnings(p.warnings || 0);

        // Check for existing start time to prevent refresh timer resets
        const existingStartTimeStr = localStorage.getItem(`techmanthan_start_${c.id}`);
        if (existingStartTimeStr) {
          const startTimeMs = parseInt(existingStartTimeStr, 10);
          const elapsedSecs = Math.max(0, Math.round((Date.now() - startTimeMs) / 1000));
          if (c.duration > 0 && elapsedSecs >= c.duration) {
             // Time already expired!
             alert("Your test time has already expired.");
             router.push('/');
             return;
          }
          // Adjust remaining time based on actual elapsed time
          if (c.duration > 0) {
            setTimeLeft(c.duration - elapsedSecs);
          }
          setElapsedSeconds(elapsedSecs);
          // Set ref to real start time
          startTimeRef.current = startTimeMs;
        }

        // Pick Passage & Setup Buffer
        const randomText = c.texts[Math.floor(Math.random() * c.texts.length)];
        const parsedWords = randomText.trim().split(/\s+/);
        const fullText = parsedWords.join(' ');
        setWords(parsedWords);
        wordsRef.current = parsedWords;
        fullTextRef.current = fullText;
        charStatesRef.current = new Array(fullText.length).fill('u');

        setLoading(false);
      } catch (err) {
        console.error("Error initializing test:", err);
      }
    };
    initTest();
  }, [params.compId, router]);

  // 2. Offline Pending Score Sync Handler
  const syncPendingScore = useCallback(async () => {
    const pendingStr = localStorage.getItem('techmanthan_pending_score');
    if (!pendingStr || !comp || !participant) return;

    setIsSyncing(true);
    try {
      const { finalData } = JSON.parse(pendingStr);
      const pRef = doc(db, `competitions/${comp.id}/participants`, participant.rollNo);
      await setDoc(pRef, finalData, { merge: true });
      
      localStorage.removeItem('techmanthan_pending_score');
      localStorage.removeItem('techmanthan_session');
      setIsOfflineSaved(false);
      setSyncSuccess(true);
    } catch (err) {
      console.error("Score sync failed, will retry:", err);
      setIsOfflineSaved(true);
    } finally {
      setIsSyncing(false);
    }
  }, [comp, participant]);

  // Listen for online reconnect events to auto-sync offline scores
  useEffect(() => {
    window.addEventListener('online', syncPendingScore);
    return () => window.removeEventListener('online', syncPendingScore);
  }, [syncPendingScore]);

  // 3. Score Submission with Offline Protection
  const submitScore = useCallback(async (disqualified = false) => {
    if (!comp || !participant || isFinishedRef.current) return;
    isFinishedRef.current = true;

    const now = Date.now();
    const durationLimit = comp.duration === 0 ? 99999 : comp.duration;
    const timeSpent = startTimeRef.current 
      ? Math.min(durationLimit, parseFloat(((now - startTimeRef.current) / 1000).toFixed(3)))
      : 0.001;

    const finalCorrect = correctCharsRef.current;
    const finalErrors = errorsRef.current;

    const wpm = disqualified ? 0 : (timeSpent > 0 ? Math.round((finalCorrect / 5) / (timeSpent / 60)) : 0);
    const accuracy = disqualified ? 0 : ((finalCorrect + finalErrors) > 0 ? Math.round((finalCorrect / (finalCorrect + finalErrors)) * 100) : 0);

    finalStatsRef.current = {
      wpm,
      accuracy,
      timeSpent,
      errors: finalErrors
    };

    const finalData = {
      rollNo: participant.rollNo,
      name: participant.name,
      class: participant.class || '',
      section: participant.section || '',
      isRegistered: true,
      hasParticipated: true,
      status: disqualified ? 'Disqualified' : 'Completed',
      score: {
        wpm,
        accuracy,
        errors: finalErrors,
        time: timeSpent,
        submittedAt: Date.now()
      }
    };

    // Backup score locally BEFORE network call (Zero Data Loss Protection)
    localStorage.setItem('techmanthan_pending_score', JSON.stringify({
      compId: comp.id,
      rollNo: participant.rollNo,
      finalData,
      timestamp: Date.now()
    }));

    try {
      playAudioTone(880, 'sine', 0.25);
      setTimeout(() => playAudioTone(1100, 'sine', 0.4), 250);
      const pRef = doc(db, `competitions/${comp.id}/participants`, participant.rollNo);
      await setDoc(pRef, finalData, { merge: true });
      localStorage.removeItem('techmanthan_pending_score');
      localStorage.removeItem('techmanthan_session');
      localStorage.removeItem(`techmanthan_start_${comp.id}`);
      localStorage.setItem(`techmanthan_completed_${comp.id}`, 'true');
      setSyncSuccess(true);
    } catch (err) {
      console.warn("Network submission failed. Score backed up locally in localStorage.", err);
      setIsOfflineSaved(true);
      // Even if offline, mark as completed locally so UI updates
      localStorage.removeItem(`techmanthan_start_${comp.id}`);
      localStorage.setItem(`techmanthan_completed_${comp.id}`, 'true');
    }
  }, [comp, participant]);

  // 4. Anti-Cheat Handlers & Keyboard Lockdowns
  const triggerWarning = useCallback(async () => {
    if (isFinishedRef.current || isDisqualifiedRef.current || !participant || !comp) return;

    setWarnings(prev => {
      const nextWarnings = prev + 1;
      setShowWarning(true);
      playAudioTone(180, 'sawtooth', 0.4);
      setTimeout(() => setShowWarning(false), 3000);

      // Async sync warning to DB without blocking typing engine
      const pRef = doc(db, `competitions/${comp.id}/participants`, participant.rollNo);
      setDoc(pRef, { warnings: nextWarnings }, { merge: true }).catch(console.error);

      if (nextWarnings >= 3) {
        isDisqualifiedRef.current = true;
        setIsDisqualified(true);
        submitScore(true);
      }
      return nextWarnings;
    });
  }, [comp, participant, submitScore]);

  useEffect(() => {
    if (loading || isFinished || isDisqualified) return;

    const handleVisibilityChange = () => {
      if (document.hidden) triggerWarning();
    };

    const handleWindowBlur = () => {
      triggerWarning();
    };

    // Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U, Ctrl+C, Ctrl+V
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
        (e.ctrlKey && e.key === 'u')
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [loading, isFinished, isDisqualified, triggerWarning]);

  // 5. Finish Test
  const handleFinish = useCallback(() => {
    if (isFinishedRef.current) return;
    setIsFinished(true);
    setIsTestRunning(false);
    isTestRunningRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    submitScore(false);
  }, [submitScore]);

  // Starts the interactive countdown sequence
  const startCountdown = () => {
    if (!comp) return;
    setIsCountingDown(true);
    let count = 3;
    setCountdown(3);
    playAudioTone(520, 'sine', 0.15);

    const interval = setInterval(() => {
      count -= 1;
      if (count === 0) {
        setCountdown(0);
        playAudioTone(1040, 'triangle', 0.45);
      } else if (count < 0) {
        clearInterval(interval);
        setIsCountingDown(false);
        setIsTestRunning(true);
        isTestRunningRef.current = true;
        
        // If there was an existing start time (from a refresh), don't reset it
        if (!startTimeRef.current) {
          const now = Date.now();
          startTimeRef.current = now;
          localStorage.setItem(`techmanthan_start_${comp.id}`, now.toString());
        }
        
        setTimeout(() => inputRef.current?.focus(), 50);

        // Core ticking timer thread
        timerRef.current = setInterval(() => {
          const now = Date.now();
          const elapsed = Math.round((now - startTimeRef.current!) / 1000);
          setElapsedSeconds(elapsed);

          if (comp.duration > 0) {
            setTimeLeft((prev) => {
              if (prev <= 1) {
                if (timerRef.current) clearInterval(timerRef.current);
                handleFinish();
                return 0;
              }
              return prev - 1;
            });
          }
        }, 1000);
      } else {
        setCountdown(count);
        playAudioTone(520, 'sine', 0.15);
      }
    }, 1000);
  };

  // Helper: recompute & push live stats
  const pushLiveStats = () => {
    const elapsed = startTimeRef.current ? Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000)) : 1;
    const c = correctCharsRef.current;
    const err = errorsRef.current;
    setLiveWpm(c > 0 ? Math.round((c / 5) / (elapsed / 60)) : 0);
    setLiveErrors(err);
    setLiveAccuracy(c + err > 0 ? Math.round((c / (c + err)) * 100) : 100);
  };

  // 6. Zero-Latency Keystroke Handler — flat charIndex model
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isFinishedRef.current || isDisqualifiedRef.current) return;

    const fullText = fullTextRef.current;
    const pos = charIndexRef.current;
    e.preventDefault(); // we manage all input manually

    // ── Backspace: undo last typed character ──────────────────────────
    if (e.key === 'Backspace') {
      if (pos === 0) return;
      const prev = pos - 1;
      const prevState = charStatesRef.current[prev];
      if (prevState === 'c') {
        correctCharsRef.current = Math.max(0, correctCharsRef.current - 1);
      }
      // Note: We intentionally do NOT decrement errorsRef here.
      // This ensures that mistakes permanently reduce accuracy, even if corrected.
      charStatesRef.current[prev] = 'u';
      charIndexRef.current = prev;
      setCharIndex(prev);
      pushLiveStats();
      return;
    }

    // Ignore modifier / function keys
    if (e.key.length !== 1) return;
    // Already at end
    if (pos >= fullText.length) return;

    const expected = fullText[pos];

    // ── Space position: ONLY space key is valid ───────────────────────
    if (expected === ' ') {
      if (e.key === ' ') {
        charStatesRef.current[pos] = 'c';
        correctCharsRef.current++;
        playAudioTone(880, 'sine', 0.04);
      } else {
        // Wrong key at space — play error, do NOT advance
        playAudioTone(180, 'sawtooth', 0.1);
        errorsRef.current++;
        pushLiveStats();
        return;
      }
    } else {
      // ── Letter position ───────────────────────────────────────────────
      if (e.key === ' ') {
        // Space when a letter is expected — block entirely
        playAudioTone(180, 'sawtooth', 0.1);
        return;
      } else if (e.key === expected) {
        charStatesRef.current[pos] = 'c';
        correctCharsRef.current++;
        playAudioTone(880, 'sine', 0.04);
      } else {
        charStatesRef.current[pos] = 'w';
        errorsRef.current++;
        playAudioTone(180, 'sawtooth', 0.1);
      }
    }

    // Advance cursor
    const next = pos + 1;
    charIndexRef.current = next;
    setCharIndex(next);
    pushLiveStats();

    // Auto-submit when full text is typed
    if (next >= fullText.length) handleFinish();
  };

  // 7. Scroll tracking — derive active word from charIndex
  useLayoutEffect(() => {
    const fullText = fullTextRef.current;
    if (!fullText) return;
    // Which word does charIndex fall in?
    const textBefore = fullText.slice(0, Math.max(0, charIndex));
    const wIdx = Math.min(wordsRef.current.length - 1, textBefore.split(' ').length - 1);
    const activeEl = wordSpanRefs.current[wIdx];
    if (!activeEl) return;
    const LINE_H = 48;
    setScrollY(Math.max(0, activeEl.offsetTop - LINE_H));
  }, [charIndex]);

  const preventCheat = (e: React.SyntheticEvent) => e.preventDefault();

  if (loading) return <div className="mt-10 animate-pulse text-xl text-primary font-bold">Initializing Zero-Lag Typing Engine...</div>;
  if (!comp || !participant) return null;

  const currentDisplayTime = comp.duration === 0 ? `${elapsedSeconds}s` : `${timeLeft}s`;

  return (
    <div className="w-full max-w-4xl mt-6 relative select-none flex flex-col min-h-[80vh] justify-center" onContextMenu={preventCheat}>

      {/* 3-2-1 Fullscreen Countdown Overlay */}
      {isCountingDown && (
        <div className="fixed inset-0 bg-[#0d1117] z-[200] flex flex-col items-center justify-center text-center">
          <span className="text-primary/60 text-xs font-bold tracking-[0.3em] uppercase mb-6">get ready</span>
          <div className="text-[9rem] font-black text-primary font-mono leading-none">
            {countdown === 0 ? 'GO!' : countdown}
          </div>
          <span className="text-slate-600 text-xs mt-8 tracking-wider">fingers on home row</span>
        </div>
      )}

      {/* Anti-Cheat Warning Popup */}
      {showWarning && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-red-600/90 backdrop-blur text-white px-5 py-2.5 rounded-lg shadow-2xl font-bold text-sm z-50 border border-red-400/50">
          ⚠️ Warning {warnings}/3 — switching tabs is prohibited!
        </div>
      )}

      {/* Disqualification Screen */}
      {isDisqualified && (
        <div className="fixed inset-0 bg-[#0d1117] z-50 flex flex-col items-center justify-center p-6 text-center">
          <h1 className="text-red-500 text-6xl font-black mb-4 tracking-tight">DISQUALIFIED</h1>
          <p className="text-slate-400 text-base mb-10 max-w-md leading-relaxed">
            Your session was terminated due to anti-cheat violations (tab switching).
          </p>
          <button
            onClick={() => router.push('/')}
            className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-lg font-bold transition-transform hover:scale-105"
          >
            Return to Home
          </button>
        </div>
      )}

      {/* Finished Modal */}
      {isFinished && !isDisqualified && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="glass-card p-8 md:p-12 text-center max-w-2xl w-full border border-primary/30 shadow-2xl">
            <h2 className="text-4xl font-extrabold text-primary mb-6">Test Completed!</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="glass-card p-4">
                <div className="text-4xl md:text-5xl font-black text-primary mb-1">{finalStatsRef.current.wpm}</div>
                <div className="text-foreground/60 text-xs font-semibold uppercase tracking-wider">WPM</div>
              </div>
              <div className="glass-card p-4">
                <div className="text-4xl md:text-5xl font-black text-white mb-1">{finalStatsRef.current.accuracy}%</div>
                <div className="text-foreground/60 text-xs font-semibold uppercase tracking-wider">Accuracy</div>
              </div>
              <div className="glass-card p-4">
                <div className="text-4xl md:text-5xl font-black text-red-400 mb-1">{finalStatsRef.current.errors}</div>
                <div className="text-foreground/60 text-xs font-semibold uppercase tracking-wider">Errors</div>
              </div>
              <div className="glass-card p-4">
                <div className="text-4xl md:text-5xl font-black text-white mb-1">{finalStatsRef.current.timeSpent}s</div>
                <div className="text-foreground/60 text-xs font-semibold uppercase tracking-wider">Time</div>
              </div>
            </div>

            {isOfflineSaved && (
              <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-300 text-sm">
                <p className="font-bold mb-2">⚠️ Wi-Fi Disconnected — Score Backed Up Locally</p>
                <p className="text-xs text-foreground/70 mb-3">Your score is safely saved. Click below when reconnected.</p>
                <button
                  onClick={syncPendingScore}
                  disabled={isSyncing}
                  className="bg-yellow-500 text-background px-6 py-2 rounded-md font-bold text-sm hover:bg-yellow-400 disabled:opacity-50 transition-colors"
                >
                  {isSyncing ? 'Syncing...' : 'Retry Score Sync Now'}
                </button>
              </div>
            )}

            {syncSuccess && (
              <div className="mb-6 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm font-semibold">
                ✓ Score officially recorded on live leaderboard!
              </div>
            )}

            <button
              onClick={() => router.push('/')}
              className="bg-primary text-background font-extrabold px-8 py-4 rounded-lg hover:bg-yellow-400 w-full text-xl transition-all shadow-[0_0_25px_rgba(226,183,20,0.4)] hover:scale-[1.02]"
            >
              Return to Competitions
            </button>
          </div>
        </div>
      )}

      {/* ── MonkeyType-style layout ── */}
      <div className="flex flex-col gap-8">

        {/* Slim stat row — always visible */}
        <div className="flex items-center gap-8 px-1">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold">
              {comp.duration === 0 ? 'elapsed' : 'time left'}
            </span>
            <span className="text-3xl font-black font-mono text-primary leading-none">{currentDisplayTime}</span>
          </div>
          <div className="w-px h-8 bg-slate-800" />
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold">wpm</span>
            <span className="text-3xl font-black font-mono text-slate-300 leading-none">{liveWpm}</span>
          </div>
          <div className="w-px h-8 bg-slate-800" />
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold">acc</span>
            <span className="text-3xl font-black font-mono text-slate-300 leading-none">{liveAccuracy}%</span>
          </div>
          <div className="w-px h-8 bg-slate-800" />
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold">errors</span>
            <span className="text-3xl font-black font-mono text-red-500 leading-none">{liveErrors}</span>
          </div>
        </div>

        {/* Typing area — clean, no card borders */}
        <div
          className="relative cursor-text"
          onClick={() => inputRef.current?.focus()}
        >
          {/* Start overlay */}
          {!isTestRunning && !isFinished && !isCountingDown && (
            <div className="absolute inset-0 bg-[#0d1117]/95 z-20 flex flex-col items-center justify-center rounded-xl text-center p-8">
              <div className="max-w-sm space-y-5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border border-primary/30 bg-primary/10 text-primary">
                  READY TO COMPETE
                </span>
                <h2 className="text-2xl font-extrabold text-white tracking-tight">Test Your Typing Speed</h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {comp.duration === 0
                    ? 'Untimed — auto-submits when you finish the paragraph.'
                    : `You have ${Math.floor(comp.duration / 60)} minute(s). Auto-submits when time is up.`}
                </p>
                <button
                  onClick={startCountdown}
                  className="bg-primary text-slate-950 font-extrabold text-base px-10 py-3 rounded-xl hover:bg-yellow-400 transition-all shadow-[0_0_25px_rgba(226,183,20,0.3)] hover:scale-105 inline-flex items-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" /> Start Typing Test
                </button>
              </div>
            </div>
          )}

          {/* Words display — MonkeyType 3-line scrolling window */}
          <div
            className="overflow-hidden relative"
            style={{ height: '9rem' /* exactly 3 lines × 3rem */ }}
          >
            {/* Top fade hint */}
            <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-[#0d1117] to-transparent z-10 pointer-events-none" />
            {/* Bottom fade hint */}
            <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[#0d1117] to-transparent z-10 pointer-events-none" />

            <div
              className="text-[1.55rem] font-mono w-full px-2"
              style={{
                userSelect: 'none',
                lineHeight: '3rem',
                transform: `translateY(-${scrollY}px)`,
                transition: 'transform 0.15s ease',
              }}
            >
              {words.map((word, wIdx) => {
                // Compute this word's start position in fullText
                const wordStart = wordsRef.current.slice(0, wIdx).reduce((s, w) => s + w.length + 1, 0);
                const isLastWord = wIdx === words.length - 1;

                return (
                  <span key={wIdx} className="inline-block">
                    {/* Word characters */}
                    <span
                      ref={el => { wordSpanRefs.current[wIdx] = el; }}
                      className="inline-block"
                    >
                      {word.split('').map((char, cIdx) => {
                        const pos = wordStart + cIdx;
                        const state = charStatesRef.current[pos] || 'u';
                        const isCursor = charIndex === pos;
                        return (
                          <span key={cIdx} className="relative">
                            {isCursor && (
                              <span
                                className="absolute -left-[2px] top-[5px] bottom-[5px] w-[2px] bg-primary rounded-full"
                                style={{ animation: 'blink 1s step-start infinite' }}
                              />
                            )}
                            <span className={
                              state === 'c' ? 'text-white' :
                              state === 'w' ? 'text-red-500 bg-red-500/15 rounded-[2px]' :
                              'text-slate-500'
                            }>{char}</span>
                          </span>
                        );
                      })}
                    </span>
                    {/* Space gap + cursor when space is the expected char */}
                    {!isLastWord && (() => {
                      const spacePos = wordStart + word.length;
                      const isCursorOnSpace = charIndex === spacePos;
                      return (
                        <span className="relative inline-block" style={{ width: '0.55em' }}>
                          {isCursorOnSpace && (
                            <span
                              className="absolute left-[1px] top-[5px] bottom-[5px] w-[2px] bg-primary rounded-full"
                              style={{ animation: 'blink 1s step-start infinite' }}
                            />
                          )}
                        </span>
                      );
                    })()}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Hidden keyboard capture input — focus target only, we preventDefault all keys */}
          <input
            ref={inputRef}
            type="text"
            className="opacity-0 absolute -top-20 left-0 w-1 h-1 pointer-events-none"
            value=""
            onChange={() => {}}
            onKeyDown={handleKeyDown}
            onCopy={preventCheat}
            onPaste={preventCheat}
            onCut={preventCheat}
            onDrop={preventCheat}
            autoComplete="off"
            autoCorrect="off"
            disabled={!isTestRunning}
          />
        </div>

        {/* Bottom info bar */}
        <div className="flex justify-between items-center px-1 text-xs text-slate-600">
          <span>
            {participant.name} &nbsp;·&nbsp; {participant.rollNo}
          </span>
          <span className="italic">
            {isTestRunning ? 'auto-submits on completion' : ''}
          </span>
        </div>
      </div>

      {/* Cursor blink keyframe */}
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  );
}
