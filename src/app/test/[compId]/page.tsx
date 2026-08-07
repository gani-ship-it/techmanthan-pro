'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Competition, Participant } from '@/types';
import { useRouter } from 'next/navigation';
import { Clock, Play, AlertTriangle, ShieldAlert, CheckCircle2, RotateCcw, Activity, Award } from 'lucide-react';

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
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const [inputVal, setInputVal] = useState('');

  // Countdown State
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [countdown, setCountdown] = useState(3);

  // Live Telemetry Stats (Updated reactively in real time)
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

  // High-Performance Mutable References
  const inputValRef = useRef('');
  const activeWordIndexRef = useRef(0);
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

        // Pick Passage & Setup Buffer
        const randomText = c.texts[Math.floor(Math.random() * c.texts.length)];
        const parsedWords = randomText.trim().split(/\s+/);
        setWords(parsedWords);
        wordsRef.current = parsedWords;

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
      ? Math.max(1, Math.min(durationLimit, Math.round((now - startTimeRef.current) / 1000)))
      : 1;

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
      setSyncSuccess(true);
    } catch (err) {
      console.warn("Network submission failed. Score backed up locally in localStorage.", err);
      setIsOfflineSaved(true);
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
        startTimeRef.current = Date.now();
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

  // 6. Zero-Latency Keystroke Handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isFinishedRef.current || isDisqualifiedRef.current) return;

    const currentWord = wordsRef.current[activeWordIndexRef.current];
    if (!currentWord) return;

    if (e.key === 'Backspace') {
      return;
    }

    if (e.key.length === 1) {
      if (e.key === ' ') {
        if (inputValRef.current !== currentWord) {
          e.preventDefault();
          playAudioTone(180, 'sawtooth', 0.1);
        } else {
          e.preventDefault();
          activeWordIndexRef.current += 1;
          inputValRef.current = '';
          
          setActiveWordIndex(activeWordIndexRef.current);
          setInputVal('');

          // Auto-submit if all words completely typed
          if (activeWordIndexRef.current >= wordsRef.current.length) {
            handleFinish();
          }
        }
      } else {
        const expectedChar = currentWord[inputValRef.current.length];
        if (e.key !== expectedChar) {
          e.preventDefault();
          errorsRef.current += 1;
          setLiveErrors(errorsRef.current);
          playAudioTone(180, 'sawtooth', 0.1);
        } else {
          correctCharsRef.current += 1;
          playAudioTone(880, 'sine', 0.04);
        }

        // Live stats computation
        const elapsed = startTimeRef.current ? Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000)) : 1;
        const currentCorrect = correctCharsRef.current;
        const currentErrors = errorsRef.current;
        
        setLiveWpm(Math.round((currentCorrect / 5) / (elapsed / 60)));
        setLiveAccuracy(currentCorrect + currentErrors > 0 ? Math.round((currentCorrect / (currentCorrect + currentErrors)) * 100) : 100);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\s/g, '');
    inputValRef.current = val;
    setInputVal(val);
  };

  const preventCheat = (e: React.SyntheticEvent) => e.preventDefault();

  if (loading) return <div className="mt-10 animate-pulse text-xl text-primary font-bold">Initializing Zero-Lag Typing Engine...</div>;
  if (!comp || !participant) return null;

  const currentDisplayTime = comp.duration === 0 ? `${elapsedSeconds}s` : `${timeLeft}s`;

  return (
    <div className="w-full max-w-5xl mt-6 relative select-none bg-slate-950/98 p-6 rounded-2xl border border-white/5 shadow-2xl min-h-[85vh] flex flex-col justify-center" onContextMenu={preventCheat}>
      
      {/* 3-2-1 Fullscreen Countdown Overlay */}
      {isCountingDown && (
        <div className="fixed inset-0 bg-slate-950/98 z-[200] flex flex-col items-center justify-center text-center animate-fadeIn">
          <span className="text-primary/70 text-sm font-bold tracking-widest uppercase mb-4 animate-pulse">Get Ready to Type</span>
          <div className="text-8xl md:text-9xl font-black text-primary animate-ping duration-1000 font-mono">
            {countdown === 0 ? 'GO!' : countdown}
          </div>
          <span className="text-foreground/50 text-xs mt-8">Place your fingers on the home row keys.</span>
        </div>
      )}

      {/* Anti-Cheat Warning Popup */}
      {showWarning && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-lg shadow-2xl font-bold animate-bounce z-50 border border-red-400">
          ⚠️ Warning {warnings}/3: Switching tabs or unfocusing the window is prohibited!
        </div>
      )}

      {/* Disqualification Screen */}
      {isDisqualified && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-6 text-center">
          <h1 className="text-red-500 text-5xl font-extrabold mb-4">DISQUALIFIED</h1>
          <p className="text-xl text-foreground/80 mb-8 max-w-lg">
            Your exam session was terminated due to anti-cheat policy violations (tab switching / window unfocusing).
          </p>
          <button 
            onClick={() => router.push('/')} 
            className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-lg font-bold text-lg transition-transform hover:scale-105"
          >
            Return to Home
          </button>
        </div>
      )}

      {/* Finished Modal */}
      {isFinished && !isDisqualified && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="glass-card p-8 md:p-12 text-center max-w-2xl w-full border border-primary/30 shadow-2xl">
            <h2 className="text-4xl font-extrabold text-primary mb-6">Test Completed!</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="glass-card p-4">
                <div className="text-4xl md:text-5xl font-black text-primary mb-1">
                  {finalStatsRef.current.wpm}
                </div>
                <div className="text-foreground/60 text-xs font-semibold uppercase tracking-wider">WPM</div>
              </div>
              <div className="glass-card p-4">
                <div className="text-4xl md:text-5xl font-black text-white mb-1">
                  {finalStatsRef.current.accuracy}%
                </div>
                <div className="text-foreground/60 text-xs font-semibold uppercase tracking-wider">Accuracy</div>
              </div>
              <div className="glass-card p-4">
                <div className="text-4xl md:text-5xl font-black text-red-400 mb-1">
                  {finalStatsRef.current.errors}
                </div>
                <div className="text-foreground/60 text-xs font-semibold uppercase tracking-wider">Errors</div>
              </div>
              <div className="glass-card p-4">
                <div className="text-4xl md:text-5xl font-black text-white mb-1">
                  {finalStatsRef.current.timeSpent}s
                </div>
                <div className="text-foreground/60 text-xs font-semibold uppercase tracking-wider">Time</div>
              </div>
            </div>

            {/* Offline Sync Status Banner */}
            {isOfflineSaved && (
              <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-300 text-sm">
                <p className="font-bold mb-2">⚠️ Wi-Fi Disconnected - Score Backed Up Locally</p>
                <p className="text-xs text-foreground/70 mb-3">Your score is safely saved on this computer. Click below when reconnected to submit.</p>
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

      {/* Live Telemetry dashboard grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="glass-card p-4 flex items-center justify-between border border-white/5 relative overflow-hidden">
          <div>
            <span className="text-[10px] uppercase font-bold text-foreground/45 tracking-wider block">Live Speed</span>
            <span className="text-2xl font-black text-primary font-mono">{liveWpm} <span className="text-xs text-foreground/50">WPM</span></span>
          </div>
          <Activity className="w-8 h-8 text-primary/10 absolute right-4 bottom-4" />
        </div>

        <div className="glass-card p-4 flex items-center justify-between border border-white/5 relative overflow-hidden">
          <div>
            <span className="text-[10px] uppercase font-bold text-foreground/45 tracking-wider block">Accuracy</span>
            <span className="text-2xl font-black text-white font-mono">{liveAccuracy}%</span>
          </div>
          <Award className="w-8 h-8 text-white/10 absolute right-4 bottom-4" />
        </div>

        <div className="glass-card p-4 flex items-center justify-between border border-white/5 relative overflow-hidden">
          <div>
            <span className="text-[10px] uppercase font-bold text-foreground/45 tracking-wider block">Typo Errors</span>
            <span className="text-2xl font-black text-red-400 font-mono">{liveErrors}</span>
          </div>
          <AlertTriangle className="w-8 h-8 text-red-500/10 absolute right-4 bottom-4" />
        </div>

        <div className="glass-card p-4 flex items-center justify-between border border-white/5 relative overflow-hidden bg-primary/5 border-primary/20">
          <div>
            <span className="text-[10px] uppercase font-bold text-primary/70 tracking-wider block">{comp.duration === 0 ? 'Stopwatch' : 'Time Left'}</span>
            <span className="text-2xl font-black text-primary font-mono">{currentDisplayTime}</span>
          </div>
          <Clock className="w-8 h-8 text-primary/15 absolute right-4 bottom-4" />
        </div>
      </div>

      {/* Typing Card Display Container */}
      <div 
        className="glass-card p-8 md:p-10 relative overflow-hidden border border-white/15 shadow-2xl cursor-text bg-slate-950 flex-grow flex items-center rounded-2xl relative min-h-[40vh]"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Startup Launch Card Overlay */}
        {!isTestRunning && !isFinished && !isCountingDown && (
          <div className="absolute inset-0 bg-slate-950/95 z-20 flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
            <div className="max-w-md space-y-5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border border-primary/30 bg-primary/10 text-primary">
                READY TO COMPETE
              </span>
              <h2 className="text-3xl font-extrabold text-white tracking-tight">Test Your Typing Speed</h2>
              <p className="text-xs text-foreground/70 leading-relaxed">
                {comp.duration === 0 
                  ? "This competition is untimed. The stopwatch counts up, and your test ends immediately when you completely finish typing the paragraph." 
                  : `You have exactly ${Math.floor(comp.duration / 60)} Minute(s) to type as much as possible.`}
              </p>
              
              <button 
                onClick={startCountdown}
                className="bg-primary text-slate-950 font-extrabold text-lg px-10 py-3.5 rounded-xl hover:bg-yellow-400 transition-all duration-200 shadow-[0_0_30px_rgba(226,183,20,0.3)] hover:scale-105 inline-flex items-center gap-2"
              >
                <Play className="w-5 h-5 fill-current" /> Start Typing Test
              </button>
            </div>
          </div>
        )}

        <div className="text-2xl md:text-3xl leading-relaxed font-mono tracking-wide w-full" style={{ userSelect: 'none' }}>
          {words.map((word, wIdx) => {
            const isPast = wIdx < activeWordIndex;
            const isActive = wIdx === activeWordIndex;

            return (
              <span 
                key={wIdx} 
                className={`inline-block mr-4 mb-3 transition-colors px-1 py-0.5 rounded ${
                  isPast ? 'text-foreground/45' : isActive ? 'bg-primary/10 border border-primary/20 text-primary font-bold shadow-[0_0_10px_rgba(226,183,20,0.1)]' : 'text-foreground/80'
                }`}
              >
                {word.split('').map((char, cIdx) => {
                  let colorClass = '';
                  if (isActive) {
                    if (cIdx < inputVal.length) {
                      colorClass = inputVal[cIdx] === char 
                        ? 'text-white border-b-2 border-green-400' 
                        : 'text-red-500 bg-red-500/25 font-extrabold border-b-2 border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)] animate-pulse rounded px-0.5';
                    } else if (cIdx === inputVal.length) {
                      colorClass = 'border-b-2 border-primary animate-pulse text-primary';
                    }
                  }
                  return <span key={cIdx} className={colorClass}>{char}</span>;
                })}
              </span>
            );
          })}
        </div>

        {/* Hidden Input for Keyboard Capture */}
        <input
          ref={inputRef}
          type="text"
          className="opacity-0 absolute -top-20 left-0 w-1 h-1 pointer-events-none"
          value={inputVal}
          onChange={handleInputChange}
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

      <div className="flex justify-between items-center mt-6 px-2 text-xs text-foreground/50">
        <div>
          Candidate: <span className="font-bold text-foreground/80">{participant.name} ({participant.rollNo})</span>
        </div>
        {isTestRunning && (
          <button
            onClick={handleFinish}
            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <ShieldAlert className="w-4 h-4" /> End & Submit Early
          </button>
        )}
      </div>
    </div>
  );
}
