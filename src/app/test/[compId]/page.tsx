'use client';

import { useEffect, useState, useRef } from 'react';
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

  // Typing State
  const [words, setWords] = useState<string[]>([]);
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const [activeCharIndex, setActiveCharIndex] = useState(0);
  const [inputVal, setInputVal] = useState('');
  
  // Stats
  const [timeLeft, setTimeLeft] = useState(60);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [errors, setErrors] = useState(0);
  const [correctChars, setCorrectChars] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Initial Load & Verification
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
        if (!pSnap.exists() || pSnap.data().hasParticipated) {
          alert("Invalid session or you have already participated.");
          localStorage.removeItem('techmanthan_session');
          router.push('/');
          return;
        }
        const p = pSnap.data() as Participant;
        setParticipant(p);
        setWarnings(p.warnings || 0);

        // Pick Random Text
        const randomText = c.texts[Math.floor(Math.random() * c.texts.length)];
        setWords(randomText.trim().split(/\s+/));
        
        setLoading(false);
      } catch (err) {
        console.error(err);
      }
    };
    initTest();
  }, [params.compId, router]);

  // 2. Anti-Cheat Handlers (Visibility & Blur)
  useEffect(() => {
    if (loading || isFinished || isDisqualified) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerWarning();
      }
    };

    const handleWindowBlur = () => {
      triggerWarning();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [loading, isFinished, isDisqualified, warnings]);

  const triggerWarning = async () => {
    if (isFinished || isDisqualified || !participant || !comp) return;
    
    const newWarnings = warnings + 1;
    setWarnings(newWarnings);
    setShowWarning(true);
    setTimeout(() => setShowWarning(false), 3000);

    // Sync warning to DB
    const pRef = doc(db, `competitions/${comp.id}/participants`, participant.rollNo);
    await updateDoc(pRef, { warnings: newWarnings });

    if (newWarnings >= 3) {
      setIsDisqualified(true);
      await submitScore(true); // Submit as disqualified
    }
  };

  // 3. Typing Logic
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isTestRunning && !isFinished && !isDisqualified) {
      setIsTestRunning(true);
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            handleFinish();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    if (e.key === 'Backspace') return; // Allow backspace

    const currentWord = words[activeWordIndex];
    
    // Strict Accuracy: Block incorrect keystrokes
    if (e.key.length === 1) {
      if (e.key === ' ') {
        if (inputVal !== currentWord) {
          e.preventDefault();
        } else {
          setActiveWordIndex(idx => idx + 1);
          setInputVal('');
          if (activeWordIndex === words.length - 1) {
            handleFinish(); // Finished the whole passage
          }
        }
      } else {
        const expectedChar = currentWord[inputVal.length];
        if (e.key !== expectedChar) {
          e.preventDefault();
          setErrors(e => e + 1);
        } else {
          setCorrectChars(c => c + 1);
        }
      }
    }
  };

  // 4. Finish & Submit
  const handleFinish = async () => {
    if (isFinished) return;
    setIsFinished(true);
    setIsTestRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
    await submitScore(false);
  };

  const submitScore = async (disqualified = false) => {
    if (!comp || !participant) return;

    const timeSpent = comp.duration - timeLeft;
    const wpm = timeSpent > 0 ? Math.round((correctChars / 5) / (timeSpent / 60)) : 0;
    const accuracy = correctChars + errors > 0 ? Math.round((correctChars / (correctChars + errors)) * 100) : 0;

    const pRef = doc(db, `competitions/${comp.id}/participants`, participant.rollNo);
    
    const finalData = {
      hasParticipated: true,
      status: disqualified ? 'Disqualified' : 'Completed',
      score: {
        wpm: disqualified ? 0 : wpm,
        accuracy: disqualified ? 0 : accuracy,
        errors,
        time: timeSpent,
        submittedAt: Date.now()
      }
    };

    try {
      await updateDoc(pRef, finalData);
      localStorage.removeItem('techmanthan_session'); // Clear session
    } catch (err) {
      console.error("Failed to submit score", err);
    }
  };

  // 5. Prevent Cheating via Events
  const preventCheat = (e: any) => e.preventDefault();

  if (loading) return <div className="mt-10 animate-pulse text-xl">Loading Typing Engine...</div>;
  if (!comp || !participant) return null;

  return (
    <div className="w-full max-w-5xl mt-10 relative">
      {showWarning && (
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded shadow-2xl font-bold animate-bounce z-50">
          ⚠️ Warning {warnings}/3: Do not switch tabs or minimize the window!
        </div>
      )}

      {isDisqualified && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
          <h1 className="text-error text-5xl font-bold mb-4">DISQUALIFIED</h1>
          <p className="text-xl text-foreground mb-8">You have violated the anti-cheat policies too many times.</p>
          <button onClick={() => router.push('/')} className="btn bg-error text-white px-8 py-3 rounded">Return Home</button>
        </div>
      )}

      {isFinished && !isDisqualified && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="glass-card p-12 text-center max-w-2xl w-full border border-primary/30">
            <h2 className="text-4xl font-bold text-primary mb-8">Test Completed!</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
              <div>
                <div className="text-5xl font-bold text-primary mb-2">{Math.round((correctChars / 5) / ((comp.duration - timeLeft) / 60) || 0)}</div>
                <div className="text-foreground/60 text-sm uppercase">WPM</div>
              </div>
              <div>
                <div className="text-5xl font-bold text-white mb-2">{correctChars + errors > 0 ? Math.round((correctChars / (correctChars + errors)) * 100) : 0}%</div>
                <div className="text-foreground/60 text-sm uppercase">Accuracy</div>
              </div>
              <div>
                <div className="text-5xl font-bold text-error mb-2">{errors}</div>
                <div className="text-foreground/60 text-sm uppercase">Errors</div>
              </div>
              <div>
                <div className="text-5xl font-bold text-white mb-2">{comp.duration - timeLeft}s</div>
                <div className="text-foreground/60 text-sm uppercase">Time</div>
              </div>
            </div>
            <button onClick={() => router.push('/')} className="bg-primary text-background font-bold px-8 py-4 rounded hover:bg-yellow-400 w-full text-xl transition-transform hover:scale-105">
              Return Home
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-end mb-6 text-foreground/80">
        <div className="text-2xl font-bold text-primary">{timeLeft}s</div>
        <div className="text-sm">Logged in as: <span className="font-bold text-white">{participant.name} ({participant.rollNo})</span></div>
      </div>

      <div className="glass-card p-8 relative overflow-hidden" onClick={() => inputRef.current?.focus()}>
        
        {!isTestRunning && !isFinished && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center cursor-pointer transition-opacity">
            <span className="text-xl text-primary font-bold animate-pulse">Click here or start typing to begin</span>
          </div>
        )}

        <div className="text-2xl leading-relaxed font-mono opacity-80" style={{ userSelect: 'none' }}>
          {words.map((word, wIdx) => {
            const isPast = wIdx < activeWordIndex;
            const isActive = wIdx === activeWordIndex;
            
            return (
              <span key={wIdx} className={`inline-block mr-2 mb-2 ${isPast ? 'text-white' : isActive ? 'text-primary' : 'text-gray-500'}`}>
                {word.split('').map((char, cIdx) => {
                  let colorClass = '';
                  if (isActive) {
                    if (cIdx < inputVal.length) {
                      colorClass = inputVal[cIdx] === char ? 'text-white' : 'text-error bg-error/20';
                    } else if (cIdx === inputVal.length) {
                      colorClass = 'border-b-2 border-primary animate-pulse'; // Caret
                    }
                  }
                  return <span key={cIdx} className={colorClass}>{char}</span>;
                })}
              </span>
            );
          })}
        </div>

        <input
          ref={inputRef}
          type="text"
          className="opacity-0 absolute -top-10"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value.replace(/\s/g, ''))} // Prevent spaces passing to value
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
