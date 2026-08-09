'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Competition } from '@/types';
import Link from 'next/link';
import { Trophy, Users, Zap, Clock, Search, ArrowRight, ShieldCheck } from 'lucide-react';

export default function HomePage() {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredCompetitions = competitions.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.coordinator.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full flex flex-col items-center gap-12">
      {/* Hero Banner Section */}
      <section className="w-full text-center max-w-4xl pt-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-bold uppercase tracking-widest mb-6">
          <Zap className="w-4 h-4" /> TECH-MANTHAN 6.0
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold text-white tracking-tight leading-tight mb-6">
          AKSHARA <span className="bg-gradient-to-r from-primary via-amber-400 to-cyan-400 bg-clip-text text-transparent">VEGA</span>
        </h1>

        {/* Feature Badges Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-2xl mx-auto mb-8">
          <div className="glass-card p-4 flex items-center justify-center gap-3">
            <Users className="w-5 h-5 text-cyan-400" />
            <div className="text-left">
              <div className="text-sm font-bold text-white">80+ Concurrent</div>
              <div className="text-[11px] text-foreground/60">Simultaneous Typists</div>
            </div>
          </div>

          <div className="glass-card p-4 flex items-center justify-center gap-3">
            <Zap className="w-5 h-5 text-primary" />
            <div className="text-left">
              <div className="text-sm font-bold text-white">0ms Input Lag</div>
              <div className="text-[11px] text-foreground/60">Keystroke Engine</div>
            </div>
          </div>

          <div className="glass-card p-4 flex items-center justify-center gap-3 col-span-2 md:col-span-1">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div className="text-left">
              <div className="text-sm font-bold text-white">Anti-Cheat</div>
              <div className="text-[11px] text-foreground/60">Proctored Validation</div>
            </div>
          </div>
        </div>
      </section>

      {/* Competitions Listing Section */}
      <section className="w-full max-w-6xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Trophy className="w-6 h-6 text-primary" /> Active Competitions
            </h2>
            <p className="text-sm text-foreground/60">Select an upcoming or live competition to participate</p>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-foreground/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Search competition..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full glass-input pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none placeholder:text-foreground/30"
            />
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(n => (
              <div key={n} className="glass-card h-64 animate-pulse p-6 flex flex-col justify-between">
                <div className="h-6 bg-white/10 rounded w-2/3"></div>
                <div className="h-16 bg-white/5 rounded w-full"></div>
                <div className="h-8 bg-white/10 rounded w-1/3"></div>
              </div>
            ))}
          </div>
        ) : filteredCompetitions.length === 0 ? (
          <div className="glass-card text-center p-12 max-w-xl mx-auto border border-white/10">
            <Trophy className="w-12 h-12 text-foreground/30 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">No Active Competitions Found</h3>
            <p className="text-sm text-foreground/60">There are no live or upcoming typing competitions matching your query right now.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCompetitions.map((comp) => (
              <Link href={`/competition/${comp.id}`} key={comp.id} className="group">
                <div className="glass-card flex flex-col h-full overflow-hidden transition-all duration-300 group-hover:-translate-y-1.5 group-hover:border-primary/50 group-hover:shadow-[0_15px_35px_rgba(226,183,20,0.15)] relative">
                  
                  {/* Banner Image or Gradient */}
                  <div 
                    className={`w-full h-44 bg-cover bg-center relative ${!comp.imageUrl ? 'bg-hero-pattern' : ''}`}
                    style={comp.imageUrl ? { backgroundImage: `url(${comp.imageUrl})` } : {}}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
                    
                    {/* Status Badge */}
                    <div className="absolute top-4 right-4">
                      <span className={`px-3 py-1 text-xs font-bold rounded-full backdrop-blur-md flex items-center gap-1.5 border ${
                        comp.status === 'Live' 
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse' 
                          : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${comp.status === 'Live' ? 'bg-emerald-400' : 'bg-cyan-400'}`} />
                        {comp.status === 'Live' ? 'LIVE NOW' : 'UPCOMING'}
                      </span>
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-6 flex flex-col flex-grow">
                    <h3 className="text-xl font-bold text-white group-hover:text-primary transition-colors mb-2 line-clamp-1">
                      {comp.name}
                    </h3>
                    
                    <p className="text-xs text-foreground/70 flex-grow mb-6 line-clamp-2 leading-relaxed">
                      {comp.description}
                    </p>

                    <div className="pt-4 border-t border-white/5 text-xs text-foreground/60 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-primary" />
                        <span>{comp.duration === 0 ? 'No Time Limit' : `${Math.floor(comp.duration / 60)} Minute Test`}</span>
                      </div>

                      <div className="flex items-center gap-1 text-primary font-semibold group-hover:translate-x-1 transition-transform">
                        Participate <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
