'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Competition, Participant } from '@/types';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, UserCheck, ShieldAlert, KeyRound, User, Sparkles, X } from 'lucide-react';

export default function CompetitionDetails({ params }: { params: { compId: string } }) {
  const router = useRouter();
  const [comp, setComp] = useState<Competition | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  // Form State
  const [rollNo, setRollNo] = useState('');
  const [uniqueId, setUniqueId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const fetchComp = async () => {
      try {
        const docRef = doc(db, 'competitions', params.compId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setComp({ id: docSnap.id, ...docSnap.data() } as Competition);
        }
      } catch (err) {
        console.error("Error fetching competition details:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchComp();
  }, [params.compId]);

  const handleParticipate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    
    if (!comp) return;
    
    if (uniqueId.trim() !== comp.password.trim()) {
      setErrorMsg('Invalid Unique ID (Password). Please verify with your contest coordinator.');
      return;
    }

    setVerifying(true);
    try {
      const participantRef = doc(db, `competitions/${comp.id}/participants`, rollNo.trim().toUpperCase());
      const pSnap = await getDoc(participantRef);
      
      if (!pSnap.exists()) {
        setErrorMsg('Roll Number not found. Ensure your school/college registered you for this contest.');
        setVerifying(false);
        return;
      }

      const pData = pSnap.data() as Participant;

      if (pData.hasParticipated || pData.status === 'Completed' || pData.status === 'Disqualified') {
        setErrorMsg('This Roll Number has already submitted a test or is locked out.');
        setVerifying(false);
        return;
      }

      // Save verified session info locally
      localStorage.setItem('techmanthan_session', JSON.stringify({
        compId: comp.id,
        rollNo: pData.rollNo,
        name: pData.name
      }));

      // Redirect to test engine
      router.push(`/test/${comp.id}`);

    } catch (err) {
      console.error(err);
      setErrorMsg('An error occurred during Roll Number verification.');
      setVerifying(false);
    }
  };

  if (loading) return <div className="animate-pulse mt-12 text-xl text-primary font-bold">Loading Competition Details...</div>;
  if (!comp) return <div className="mt-12 text-red-400 font-bold text-xl">Competition not found.</div>;

  return (
    <div className="w-full max-w-4xl mt-6">
      <Link 
        href="/" 
        className="inline-flex items-center gap-2 text-foreground/60 hover:text-primary mb-6 transition-colors text-sm font-medium"
      >
        <ArrowLeft className="w-4 h-4" /> Back to All Competitions
      </Link>

      <div className="glass-card overflow-hidden border border-white/10 shadow-2xl relative">
        {/* Banner Section */}
        <div 
          className="w-full h-72 bg-cover bg-center relative flex items-end p-8"
          style={{ 
            backgroundImage: comp.imageUrl 
              ? `url(${comp.imageUrl})` 
              : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' 
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
          
          <div className="relative z-10 w-full flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-3 border ${
                comp.status === 'Live' 
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse' 
                  : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
              }`}>
                <span className={`w-2 h-2 rounded-full ${comp.status === 'Live' ? 'bg-emerald-400' : 'bg-cyan-400'}`} />
                {comp.status === 'Live' ? 'CONTEST IS LIVE NOW' : 'UPCOMING CONTEST'}
              </span>

              <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight">{comp.name}</h1>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono text-foreground/70 bg-slate-950/80 p-3 rounded-xl border border-white/10 backdrop-blur-md">
              <div>
                <span className="text-foreground/40 block">DURATION</span>
                <span className="text-white font-bold text-sm">{Math.floor(comp.duration / 60)} Mins</span>
              </div>
              <div className="h-6 w-px bg-white/10" />
              <div>
                <span className="text-foreground/40 block">COORDINATOR</span>
                <span className="text-primary font-bold text-sm">{comp.coordinator}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="p-8 md:p-10 space-y-8">
          <div>
            <h2 className="text-lg font-bold text-white mb-2">About This Competition</h2>
            <p className="text-foreground/80 leading-relaxed text-sm md:text-base">
              {comp.description}
            </p>
          </div>

          {/* Guidelines Box */}
          <div className="glass-card p-6 border border-white/10 space-y-4">
            <h3 className="text-sm font-bold text-primary uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> Competition Rules & Anti-Cheat Policy
            </h3>
            
            <ul className="space-y-2.5 text-xs md:text-sm text-foreground/80">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">•</span>
                <span>Each registered participant has exactly <strong>one attempt</strong>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">•</span>
                <span>Timer starts automatically when you type your first keystroke.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 font-bold">•</span>
                <span><strong>Anti-cheat warning:</strong> Do not switch tabs, unfocus the browser window, or open Developer Tools. 3 warnings result in immediate disqualification.</span>
              </li>
            </ul>
          </div>

          {/* Action CTA Button */}
          <div className="pt-4 text-center">
            {comp.status === 'Live' ? (
              <button 
                onClick={() => setShowModal(true)}
                className="bg-primary text-slate-950 font-extrabold text-xl px-12 py-4 rounded-xl hover:bg-yellow-400 transition-all duration-200 shadow-[0_0_30px_rgba(226,183,20,0.4)] hover:scale-105 inline-flex items-center gap-3"
              >
                <Sparkles className="w-6 h-6" /> Join & Start Typing Test
              </button>
            ) : (
              <div className="px-8 py-4 bg-slate-900 border border-white/10 rounded-xl text-foreground/70 inline-block font-semibold">
                ⏳ This competition is not currently Live. Please await coordinator announcement.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Registration Verification Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md p-8 relative border border-primary/30 shadow-2xl animate-fadeIn">
            <button 
              onClick={() => setShowModal(false)} 
              className="absolute top-4 right-4 text-foreground/50 hover:text-red-400 transition-colors p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mb-3">
                <UserCheck className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">Verify Registration</h2>
              <p className="text-xs text-foreground/70">Enter your Roll Number & Contest Password to unlock the test</p>
            </div>
            
            <form onSubmit={handleParticipate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-foreground/80 mb-1.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-primary" /> Roll Number / Student ID
                </label>
                <input 
                  type="text" 
                  required 
                  className="w-full glass-input rounded-lg p-3 text-sm outline-none uppercase font-mono tracking-wider"
                  placeholder="e.g. 101 or CS2026-04"
                  value={rollNo}
                  onChange={(e) => setRollNo(e.target.value)}
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-foreground/80 mb-1.5 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-primary" /> Unique ID (Password)
                </label>
                <input 
                  type="password" 
                  required 
                  className="w-full glass-input rounded-lg p-3 text-sm outline-none font-mono"
                  placeholder="Enter contest password"
                  value={uniqueId}
                  onChange={(e) => setUniqueId(e.target.value)}
                />
              </div>

              {errorMsg && (
                <div className="text-red-400 text-center text-xs font-semibold bg-red-500/10 border border-red-500/30 p-3 rounded-lg">
                  {errorMsg}
                </div>
              )}

              <button 
                type="submit" 
                disabled={verifying}
                className="w-full bg-primary text-slate-950 font-bold py-3.5 rounded-lg mt-2 hover:bg-yellow-400 disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(226,183,20,0.3)]"
              >
                {verifying ? 'Verifying Student Registration...' : 'Unlock & Start Test Engine'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
