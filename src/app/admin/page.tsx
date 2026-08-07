'use client';

import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Competition } from '@/types';
import Link from 'next/link';

export default function AdminDashboard() {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [coord, setCoord] = useState('');
  const [password, setPassword] = useState('');
  const [duration, setDuration] = useState(60);
  const [texts, setTexts] = useState(['', '', '', '', '']);

  useEffect(() => {
    // Basic Auth Check (In production, use Firebase Auth)
    const isAdmin = sessionStorage.getItem('admin_auth');
    if (!isAdmin) {
      const pass = prompt('Enter Admin Password:');
      if (pass === 'speedtyping26') { // Kept original password
        sessionStorage.setItem('admin_auth', 'true');
      } else {
        window.location.href = '/';
      }
    }

    const q = query(collection(db, 'competitions'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const compsData: Competition[] = [];
      snapshot.forEach((doc) => compsData.push({ id: doc.id, ...doc.data() } as Competition));
      setCompetitions(compsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (texts.some(t => t.trim() === '')) {
      alert("All 5 text passages must be filled out.");
      return;
    }

    try {
      await addDoc(collection(db, 'competitions'), {
        name,
        description: desc,
        coordinator: coord,
        password,
        duration: Number(duration),
        status: 'Upcoming',
        texts,
        createdAt: serverTimestamp()
      });
      setShowModal(false);
      // Reset form
      setName(''); setDesc(''); setCoord(''); setPassword('');
      setTexts(['', '', '', '', '']);
    } catch (err) {
      console.error(err);
      alert("Error creating competition.");
    }
  };

  if (loading) return <div className="text-xl animate-pulse mt-10">Loading Dashboard...</div>;

  return (
    <div className="w-full max-w-6xl mt-4">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-primary">Admin Dashboard</h1>
        <button onClick={() => setShowModal(true)} className="bg-primary text-background font-bold px-6 py-3 rounded hover:bg-yellow-400 shadow-lg">
          + Host Competition
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {competitions.map(comp => (
          <div key={comp.id} className="glass-card p-6 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-white">{comp.name}</h3>
              <span className={`px-2 py-1 text-xs font-bold rounded ${
                comp.status === 'Live' ? 'bg-green-500/20 text-green-400' : 
                comp.status === 'Ended' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
              }`}>
                {comp.status}
              </span>
            </div>
            <p className="text-sm text-foreground/70 mb-6 flex-grow">{comp.description}</p>
            <div className="flex justify-between items-center pt-4 border-t border-white/10">
              <span className="text-xs text-primary font-mono">{comp.password}</span>
              <Link href={`/admin/${comp.id}`}>
                <button className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded text-sm transition-colors">
                  Manage
                </button>
              </Link>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="glass-card w-full max-w-2xl p-8 my-8 relative">
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-2xl text-foreground/50 hover:text-error transition-colors">×</button>
            <h2 className="text-2xl font-bold text-primary mb-6">Host New Competition</h2>
            
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1 text-foreground/80">Competition Name</label>
                  <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full bg-background/50 border border-white/10 rounded p-3 outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm mb-1 text-foreground/80">Coordinator Name</label>
                  <input type="text" required value={coord} onChange={e => setCoord(e.target.value)} className="w-full bg-background/50 border border-white/10 rounded p-3 outline-none focus:border-primary" />
                </div>
              </div>
              
              <div>
                <label className="block text-sm mb-1 text-foreground/80">Description</label>
                <input type="text" required value={desc} onChange={e => setDesc(e.target.value)} className="w-full bg-background/50 border border-white/10 rounded p-3 outline-none focus:border-primary" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1 text-foreground/80">Unique ID (Password)</label>
                  <input type="text" required value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-background/50 border border-white/10 rounded p-3 outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm mb-1 text-foreground/80">Test Duration (Seconds)</label>
                  <select value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full bg-background/50 border border-white/10 rounded p-3 outline-none focus:border-primary">
                    <option value={30}>30 Seconds</option>
                    <option value={60}>1 Minute</option>
                    <option value={120}>2 Minutes</option>
                    <option value={180}>3 Minutes</option>
                  </select>
                </div>
              </div>

              <h3 className="text-primary mt-6 mb-2">Typing Passages (Exactly 5)</h3>
              {texts.map((t, idx) => (
                <textarea
                  key={idx}
                  required
                  placeholder={`Passage ${idx + 1}`}
                  value={t}
                  onChange={e => {
                    const newTexts = [...texts];
                    newTexts[idx] = e.target.value;
                    setTexts(newTexts);
                  }}
                  className="w-full bg-background/50 border border-white/10 rounded p-3 outline-none focus:border-primary h-20 resize-y"
                />
              ))}

              <button type="submit" className="w-full bg-primary text-background font-bold py-4 rounded mt-4 hover:bg-yellow-400 transition-colors">
                Create Competition
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
