'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Competition } from '@/types';
import Link from 'next/link';

export default function HomePage() {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only fetch 'Live' or 'Upcoming' competitions
    const q = query(
      collection(db, 'competitions'),
      where('status', 'in', ['Upcoming', 'Live'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const compsData: Competition[] = [];
      snapshot.forEach((doc) => {
        compsData.push({ id: doc.id, ...doc.data() } as Competition);
      });
      setCompetitions(compsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching competitions:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="text-foreground animate-pulse text-xl">Loading Competitions...</div>;
  }

  if (competitions.length === 0) {
    return (
      <div className="text-center mt-10 text-foreground">
        <h2 className="text-2xl font-bold mb-4">No Active Competitions</h2>
        <p className="text-gray-400">Please check back later or contact your coordinator.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl">
      <h2 className="text-2xl font-bold text-center text-foreground mb-8">Select a Competition</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {competitions.map((comp) => (
          <Link href={`/competition/${comp.id}`} key={comp.id}>
            <div className="glass-card flex flex-col h-full cursor-pointer hover:-translate-y-2 hover:shadow-[0_15px_40px_rgba(226,183,20,0.2)] hover:border-primary/50 transition-all duration-300 overflow-hidden">
              <div 
                className="w-full h-40 bg-gray-800 bg-cover bg-center"
                style={{ backgroundImage: comp.imageUrl ? 'url(' + comp.imageUrl + ')' : 'linear-gradient(45deg, #1e2022, #323437)' }}
              />
              <div className="p-6 flex flex-col flex-grow">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-xl font-bold text-primary">{comp.name}</h3>
                  <span className={`px-2 py-1 text-xs font-bold rounded ${comp.status === 'Live' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                    {comp.status}
                  </span>
                </div>
                <p className="text-sm text-foreground/80 flex-grow mb-4">{comp.description}</p>
                <div className="pt-4 border-t border-white/5 text-xs text-foreground/60 flex justify-between">
                  <span>Coordinator: {comp.coordinator}</span>
                  <span>{Math.floor(comp.duration / 60)}m Test</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
