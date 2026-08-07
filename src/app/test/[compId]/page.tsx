'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Competition, Participant } from '@/types';
import { useRouter } from 'next/navigation';

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

  // Typing Render State (Updated via RAF / Batched state)
  const [words, setWords] = useState<string[]>([]);
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const [inputVal, setInputVal] = useState('');

  // Stats State
  const [timeLeft, setTimeLeft] = useState(60);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [errors, setErrors] = useState(0);
  const [correctChars, setCorrectChars] = useState(0);

  // Offline & Recovery State
  const [isOfflineSaved, setIsOfflineSaved] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  // High-Performance Mutable References (0ms Input Lag Buffer)
  const inputValRef = useRef('');
  const activeWordIndexRef = useRef(0);
  const correctCharsRef = useRef(0);
  const errorsRef = useRef(0);
  const wordsRef = useRef<string[]>([]);
  const isTestRunningRef = useRef(false);
  const isFinishedRef = useRef(false);
  const isDisqualifiedRef = useRef(false);
  
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
        const c = compSnap.data() as Competition;
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
          // Construct participant from valid session data
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
      await updateDoc(pRef, finalData);
      
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

    const timeSpent = comp.duration - timeLeft;
    const finalCorrect = correctCharsRef.current;
    const finalErrors = errorsRef.current;

    const wpm = timeSpent > 0 ? Math.round((finalCorrect / 5) / (timeSpent / 60)) : 0;
    const accuracy = finalCorrect + finalErrors > 0 ? Math.round((finalCorrect / (finalCorrect + finalErrors)) * 100) : 0;

    const finalData = {
      hasParticipated: true,
      status: disqualified ? 'Disqualified' : 'Completed',
      score: {
        wpm: disqualified ? 0 : wpm,
        accuracy: disqualified ? 0 : accuracy,
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
      const pRef = doc(db, `competitions/${comp.id}/participants`, participant.rollNo);
      await updateDoc(pRef, finalData);
      localStorage.removeItem('techmanthan_pending_score');
      localStorage.removeItem('techmanthan_session');
      setSyncSuccess(true);
    } catch (err) {
      console.warn("Network submission failed. Score backed up locally in localStorage.", err);
      setIsOfflineSaved(true);
    }
  }, [comp, participant, timeLeft]);

  // 4. Anti-Cheat Handlers & Keyboard Lockdowns
  const triggerWarning = useCallback(async () => {
    if (isFinishedRef.current || isDisqualifiedRef.current || !participant || !comp) return;

    setWarnings(prev => {
      const nextWarnings = prev + 1;
      setShowWarning(true);
      setTimeout(() => setShowWarning(false), 3000);

      // Async sync warning to DB without blocking typing engine
      const pRef = doc(db, `competitions/${comp.id}/participants`, participant.rollNo);
      updateDoc(pRef, { warnings: nextWarnings }).catch(console.error);

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

  // 6. Zero-Latency Keystroke Handler (useRef Driven)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isFinishedRef.current || isDisqualifiedRef.current) return;

    // Start timer on first keystroke
    if (!isTestRunningRef.current) {
      isTestRunningRef.current = true;
      setIsTestRunning(true);

      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            handleFinish();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    const currentWord = wordsRef.current[activeWordIndexRef.current];
    if (!currentWord) return;

    if (e.key === 'Backspace') {
      // Allow backspace within current word
      return;
    }

    if (e.key.length === 1) {
      if (e.key === ' ') {
        // Spacebar checks word match
        if (inputValRef.current !== currentWord) {
          e.preventDefault(); // Block space if word incomplete/incorrect
        } else {
          e.preventDefault();
          activeWordIndexRef.current += 1;
          inputValRef.current = '';
          
          setActiveWordIndex(activeWordIndexRef.current);
          setInputVal('');

          // Check if passage complete
          if (activeWordIndexRef.current >= wordsRef.current.length) {
            handleFinish();
          }
        }
      } else {
        const expectedChar = currentWord[inputValRef.current.length];
        if (e.key !== expectedChar) {
          e.preventDefault();
          errorsRef.current += 1;
          setErrors(errorsRef.current);
        } else {
          correctCharsRef.current += 1;
          setCorrectChars(correctCharsRef.current);
        }
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\s/g, '');
    inputValRef.current = val;
    setInputVal(val);
  };

  const preventCheat = (e: React.SyntheticEvent) => e.preventDefault();

  if (loading) return <div className="mt-10 animate-pulse text-xl text-primary">Loading Zero-Lag Typing Engine...</div>;
  if (!comp || !participant) return null;

  return (
    <div className="w-full max-w-5xl mt-8 relative select-none" onContextMenu={preventCheat}>
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
                  {Math.round((correctChars / 5) / ((comp.duration - timeLeft) / 60) || 0)}
                </div>
                <div className="text-foreground/60 text-xs font-semibold uppercase tracking-wider">WPM</div>
              </div>
              <div className="glass-card p-4">
                <div className="text-4xl md:text-5xl font-black text-white mb-1">
                  {correctChars + errors > 0 ? Math.round((correctChars / (correctChars + errors)) * 100) : 0}%
                </div>
                <div className="text-foreground/60 text-xs font-semibold uppercase tracking-wider">Accuracy</div>
              </div>
              <div className="glass-card p-4">
                <div className="text-4xl md:text-5xl font-black text-red-400 mb-1">{errors}</div>
                <div className="text-foreground/60 text-xs font-semibold uppercase tracking-wider">Errors</div>
              </div>
              <div className="glass-card p-4">
                <div className="text-4xl md:text-5xl font-black text-white mb-1">{comp.duration - timeLeft}s</div>
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

      {/* Live Header Bar */}
      <div className="flex justify-between items-end mb-6 text-foreground/80 px-2">
        <div className="flex items-center gap-4">
          <div className="text-3xl font-mono font-bold text-primary bg-primary/10 border border-primary/20 px-4 py-1.5 rounded-lg">
            {timeLeft}s
          </div>
          {isTestRunning && (
            <div className="text-sm font-semibold text-green-400 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-ping"></span> Live Session
            </div>
          )}
        </div>
        <div className="text-sm text-foreground/70">
          Participant: <span className="font-bold text-white">{participant.name} ({participant.rollNo})</span>
        </div>
      </div>

      {/* Typing Card Display */}
      <div 
        className="glass-card p-8 md:p-10 relative overflow-hidden border border-white/10 shadow-2xl cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {!isTestRunning && !isFinished && (
          <div className="absolute inset-0 bg-background/85 backdrop-blur-sm z-10 flex flex-col items-center justify-center cursor-pointer transition-opacity">
            <span className="text-2xl text-primary font-extrabold mb-2 animate-pulse">Click here or start typing to begin</span>
            <span className="text-xs text-foreground/60">Timer starts automatically on your first keypress</span>
          </div>
        )}

        <div className="text-2xl md:text-3xl leading-relaxed font-mono tracking-wide" style={{ userSelect: 'none' }}>
          {words.map((word, wIdx) => {
            const isPast = wIdx < activeWordIndex;
            const isActive = wIdx === activeWordIndex;

            return (
              <span 
                key={wIdx} 
                className={`inline-block mr-3 mb-3 transition-colors ${
                  isPast ? 'text-foreground/40' : isActive ? 'text-primary font-bold' : 'text-foreground/70'
                }`}
              >
                {word.split('').map((char, cIdx) => {
                  let colorClass = '';
                  if (isActive) {
                    if (cIdx < inputVal.length) {
                      colorClass = inputVal[cIdx] === char 
                        ? 'text-white border-b-2 border-green-400' 
                        : 'text-red-400 bg-red-500/20 rounded';
                    } else if (cIdx === inputVal.length) {
                      colorClass = 'border-b-2 border-primary animate-pulse text-primary'; // GPU Caret
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
          autoCapitalize="off"
          spellCheck="false"
        />
      </div>
    </div>
  );
}
