'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Competition, Participant } from '@/types';
import { useRouter } from 'next/navigation';

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
        console.error(err);
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
    
    if (uniqueId !== comp.password) {
      setErrorMsg('Invalid Unique ID (Password).');
      return;
    }

    setVerifying(true);
    try {
      // Check if participant exists in subcollection
      const participantRef = doc(db, `competitions/${comp.id}/participants`, rollNo.toUpperCase());
      const pSnap = await getDoc(participantRef);
      
      if (!pSnap.exists()) {
        setErrorMsg('Roll Number not found. You are not registered for this competition.');
        setVerifying(false);
        return;
      }

      const pData = pSnap.data() as Participant;

      if (pData.hasParticipated || pData.status === 'Completed' || pData.status === 'Disqualified') {
        setErrorMsg('This Roll Number has already participated or is locked out.');
        setVerifying(false);
        return;
      }

      // Success! Lock them in (optional, but better to lock upon test completion).
      // Save session info to local storage so the test page knows who is playing.
      localStorage.setItem('techmanthan_session', JSON.stringify({
        compId: comp.id,
        rollNo: pData.rollNo,
        name: pData.name
      }));

      // Redirect to test engine
      router.push(`/test/${comp.id}`);

    } catch (err) {
      console.error(err);
      setErrorMsg('An error occurred during verification.');
      setVerifying(false);
    }
  };

  if (loading) return <div className="animate-pulse mt-10">Loading Details...</div>;
  if (!comp) return <div className="mt-10 text-error">Competition not found.</div>;

  return (
    <div className="w-full max-w-4xl glass-card overflow-hidden mt-8">
      {comp.imageUrl && (
        <div 
          className="w-full h-64 bg-cover bg-center"
          style={{ backgroundImage: `url(${comp.imageUrl})` }}
        />
      )}
      <div className="p-8 md:p-12 text-center">
        <button onClick={() => router.push('/')} className="mb-6 px-4 py-2 border border-foreground/20 rounded hover:border-primary hover:text-primary transition-colors self-start text-sm">
          ← Back to Competitions
        </button>
        
        <h1 className="text-3xl md:text-5xl font-bold text-primary mb-4">{comp.name}</h1>
        <p className="text-lg text-foreground/90 mb-8 max-w-2xl mx-auto leading-relaxed">
          {comp.description}
        </p>
        
        <div className="text-sm text-foreground/60 mb-8">
          <p>Coordinator: <span className="font-bold text-foreground">{comp.coordinator}</span></p>
          <p>Status: <span className="text-green-400 font-bold">{comp.status}</span></p>
          <p>Duration: {Math.floor(comp.duration / 60)} Minutes</p>
        </div>

        {comp.status === 'Live' ? (
          <button 
            onClick={() => setShowModal(true)}
            className="bg-primary text-background font-bold text-xl px-12 py-4 rounded-lg hover:bg-yellow-400 transition-transform hover:scale-105 shadow-[0_0_20px_rgba(226,183,20,0.4)]"
          >
            Participate Now
          </button>
        ) : (
          <div className="px-6 py-4 bg-error/20 border border-error/50 rounded text-error inline-block font-bold">
            This competition is not currently Live.
          </div>
        )}
      </div>

      {/* Registration Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md p-8 relative">
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-2xl text-foreground/50 hover:text-error transition-colors">×</button>
            <h2 className="text-2xl font-bold text-primary mb-2 text-center">Join Competition</h2>
            <p className="text-foreground/70 text-sm text-center mb-6">Enter your pre-registered Roll Number and the Unique ID to begin.</p>
            
            <form onSubmit={handleParticipate} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm mb-1 text-foreground/80">Roll Number</label>
                <input 
                  type="text" 
                  required 
                  className="w-full bg-background/50 border border-white/10 rounded p-3 text-foreground outline-none focus:border-primary transition-colors"
                  placeholder="e.g. 101"
                  value={rollNo}
                  onChange={(e) => setRollNo(e.target.value)}
                />
              </div>
              
              <div>
                <label className="block text-sm mb-1 text-foreground/80">Unique ID (Password)</label>
                <input 
                  type="password" 
                  required 
                  className="w-full bg-background/50 border border-white/10 rounded p-3 text-foreground outline-none focus:border-primary transition-colors"
                  value={uniqueId}
                  onChange={(e) => setUniqueId(e.target.value)}
                />
              </div>

              {errorMsg && <div className="text-error text-center text-sm font-bold bg-error/10 p-2 rounded">{errorMsg}</div>}

              <button 
                type="submit" 
                disabled={verifying}
                className="w-full bg-primary text-background font-bold py-3 rounded mt-4 hover:bg-yellow-400 disabled:opacity-50 transition-colors"
              >
                {verifying ? 'Verifying...' : 'Start Typing Test'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
