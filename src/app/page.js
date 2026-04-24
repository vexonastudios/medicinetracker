'use client';
import { useState, useEffect } from 'react';

const DEFAULT_MEDS = [
  { id: 'trileptal', name: 'Trileptal', dosage: 'Prescribed dose', times: ['19:30'], isOptional: false },
  { id: 'multivitamin', name: 'Multivitamin', dosage: '1 dose', times: ['08:00', '19:30'], isOptional: false },
  { id: 'b2', name: 'B2 Vitamin', dosage: '1 dose', times: ['08:00'], isOptional: false },
  { id: 'magnesium', name: 'Magnesium Oxide', dosage: '1 dose', times: ['08:00'], isOptional: false },
  { id: 'clinoril', name: 'Clinoril', dosage: '1 dose', times: ['08:00', '19:00'], isOptional: false },
  { id: 'benadryl', name: 'Benadryl', dosage: 'As needed', times: ['As Needed'], isOptional: true }
];

const formatTime = (time) => {
  if (time === 'As Needed') return 'As Needed';
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const formattedHour = hour % 12 || 12;
  return `${formattedHour}:${m} ${ampm}`;
};

// Helper to get strictly Central Standard Time (Texas)
const getCSTDate = () => {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
};

export default function Home() {
  const [activeTab, setActiveTab] = useState('today');
  const [medicines, setMedicines] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentTime, setCurrentTime] = useState(null);
  
  useEffect(() => {
    const savedMeds = localStorage.getItem('meds_v2');
    const savedLogs = localStorage.getItem('logs_v2');
    
    if (savedMeds) {
      setMedicines(JSON.parse(savedMeds));
    } else {
      setMedicines(DEFAULT_MEDS);
    }
    
    if (savedLogs) {
      setLogs(JSON.parse(savedLogs));
    }
    
    // Register PWA service worker
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }

    setCurrentTime(getCSTDate());
    const clockInterval = setInterval(() => {
      setCurrentTime(getCSTDate());
    }, 60000); // Update the clock every minute

    setIsLoaded(true);

    return () => clearInterval(clockInterval);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('meds_v2', JSON.stringify(medicines));
    }
  }, [medicines, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('logs_v2', JSON.stringify(logs));
    }
  }, [logs, isLoaded]);

  const handleTakeMed = (medId, timeString) => {
    const newLog = {
      id: Date.now().toString(),
      medId,
      timeString,
      takenAt: getCSTDate().toISOString() // Log in CST just to be consistent
    };
    setLogs([newLog, ...logs]);
  };

  const isTakenToday = (medId, timeString) => {
    const today = getCSTDate().toLocaleDateString();
    return logs.some(log => {
      // Compare the logged date in CST to today's CST date
      const logDate = new Date(log.takenAt).toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
      return log.medId === medId && log.timeString === timeString && logDate === today;
    });
  };

  if (!isLoaded || !currentTime) return null;

  // Generate a flat list of schedule items
  const scheduleItems = [];
  medicines.forEach(med => {
    med.times.forEach(time => {
      scheduleItems.push({ med, time });
    });
  });

  // Sort them
  scheduleItems.sort((a, b) => {
    if (a.time === 'As Needed') return 1;
    if (b.time === 'As Needed') return -1;
    return a.time.localeCompare(b.time);
  });

  // Group items by time
  const groupedSchedule = {};
  scheduleItems.forEach(item => {
    if (!groupedSchedule[item.time]) {
      groupedSchedule[item.time] = [];
    }
    groupedSchedule[item.time].push(item);
  });

  // Calculate statuses for headers
  const getGroupStatus = (time) => {
    if (time === 'As Needed') return null;
    
    const itemsInGroup = groupedSchedule[time];
    const allTaken = itemsInGroup.every(item => isTakenToday(item.med.id, time));
    
    const target = getCSTDate();
    const [h, m] = time.split(':').map(Number);
    target.setHours(h, m, 0, 0);
    
    const diffMs = target - currentTime;
    const diffMins = Math.floor(diffMs / 60000);
    
    return {
      allTaken,
      diffMins,
      isOverdue: diffMins < 0 && !allTaken,
      isUpcoming: diffMins >= 0 && !allTaken
    };
  };

  // Find the single next group to show
  const pendingGroups = Object.keys(groupedSchedule)
    .filter(time => time !== 'As Needed')
    .map(time => ({ time, status: getGroupStatus(time) }))
    .filter(g => !g.status.allTaken);

  let nextGroup = null;
  let laterGroups = [];
  if (pendingGroups.length > 0) {
    // Sort by diffMins ascending. The most negative (most overdue) comes first. 
    // If none are overdue, the one with the smallest positive diffMins (closest upcoming) comes first.
    pendingGroups.sort((a, b) => a.status.diffMins - b.status.diffMins);
    nextGroup = pendingGroups[0];
    // Keep the rest so we can show a summary
    laterGroups = pendingGroups.slice(1);
    // Sort laterGroups chronologically for the summary
    laterGroups.sort((a, b) => a.time.localeCompare(b.time));
  }

  return (
    <>
      <header className="top-nav">
        <div>
          <h1>MedTracker</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Texas Time: {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => alert('Settings menu coming soon!')}>
          ⚙️
        </button>
      </header>

      <div className="tabs">
        <div className={`tab ${activeTab === 'today' ? 'active' : ''}`} onClick={() => setActiveTab('today')}>
          Today's Schedule
        </div>
        <div className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          History
        </div>
      </div>

      {activeTab === 'today' && (
        <div className="schedule-list animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {!nextGroup && (
            <div style={{
              background: "rgba(16, 185, 129, 0.15)",
              border: "1px solid var(--success)",
              padding: '30px 20px',
              borderRadius: '16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ fontSize: '2.5rem' }}>🎉</div>
              <h2 style={{ color: 'var(--success)', fontSize: '1.4rem' }}>All Caught Up!</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>You've completed all scheduled medications for today.</p>
            </div>
          )}

          {nextGroup && (() => {
            const time = nextGroup.time;
            const items = groupedSchedule[time];
            const status = nextGroup.status;

            const absMins = Math.abs(status.diffMins);
            const hrs = Math.floor(absMins / 60);
            const mins = absMins % 60;
            const timeString = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

            let bannerText = "";
            let bannerColor = "";
            if (status.isOverdue) {
              bannerText = `⚠️ Overdue by ${timeString}`;
              bannerColor = "var(--danger)";
            } else {
              bannerText = `⏳ Due in ${timeString}`;
              bannerColor = "var(--accent-secondary)";
            }

            return (
              <div key={time} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h2 style={{ 
                  fontSize: '1.25rem', 
                  color: 'var(--text-main)', 
                  borderBottom: '1px solid var(--border-color)', 
                  paddingBottom: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: 'var(--accent-primary)', padding: '4px 10px', borderRadius: '8px', fontSize: '0.9rem', color: '#fff' }}>Next Up</span>
                    {formatTime(time)}
                  </span>
                </h2>
                
                {items.map((item, index) => {
                  const { med, time: itemTime } = item;
                  const taken = isTakenToday(med.id, itemTime);
                  
                  return (
                    <div 
                      key={`${med.id}-${itemTime}`} 
                      className="glass-panel" 
                      style={{ 
                        padding: '20px', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        animationDelay: `${index * 0.05}s`,
                        opacity: taken ? 0.6 : 1,
                        transform: taken ? 'scale(0.98)' : 'scale(1)',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      <div>
                        <h3 style={{ fontSize: '1.25rem', marginBottom: '4px', fontWeight: '600', textDecoration: taken ? 'line-through' : 'none' }}>
                          {med.name}
                        </h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                          {med.dosage}
                        </p>
                        {!taken && (
                          <div style={{ marginTop: '6px', fontSize: '0.85rem', color: bannerColor, fontWeight: '500' }}>
                            {bannerText}
                          </div>
                        )}
                        {taken && (
                          <div style={{ marginTop: '6px', fontSize: '0.85rem', color: 'var(--success)', fontWeight: '500' }}>
                            ✓ Taken for {formatTime(time)}
                          </div>
                        )}
                      </div>
                      {taken ? (
                        <button className="btn btn-success" disabled style={{ opacity: 0.8, cursor: 'default' }}>
                          ✓ Taken
                        </button>
                      ) : (
                        <button 
                          className="btn btn-primary" 
                          onClick={() => handleTakeMed(med.id, itemTime)}
                        >
                          Take
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* UPCOMING LATER SUMMARY */}
          {laterGroups.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
              <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
                Coming Up Later
              </h3>
              {laterGroups.map(group => {
                const names = groupedSchedule[group.time].map(i => i.med.name).join(', ');
                return (
                  <div key={group.time} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '500', color: 'var(--text-main)', fontSize: '0.95rem' }}>{formatTime(group.time)}</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'right', maxWidth: '65%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{names}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* AS NEEDED SECTION */}
          {groupedSchedule['As Needed'] && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
              <h2 style={{ 
                fontSize: '1.05rem', 
                color: 'var(--text-muted)', 
                borderBottom: '1px dashed var(--border-color)', 
                paddingBottom: '8px'
              }}>
                Optional / As Needed
              </h2>
              {groupedSchedule['As Needed'].map((item, index) => {
                const { med, time: itemTime } = item;
                const taken = isTakenToday(med.id, itemTime);
                
                return (
                  <div 
                    key={`${med.id}-${itemTime}`} 
                    className="glass-panel" 
                    style={{ 
                      padding: '16px 20px', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      background: 'rgba(255,255,255,0.02)'
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: '1.1rem', marginBottom: '2px', fontWeight: '500', color: 'var(--text-muted)' }}>
                        {med.name}
                      </h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        {med.dosage}
                      </p>
                    </div>
                    <button 
                      className="btn btn-ghost" 
                      style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}
                      onClick={() => {
                        handleTakeMed(med.id, itemTime);
                        alert(`Logged ${med.name}!`);
                      }}
                    >
                      {taken ? '+ Log Again' : 'Take'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="history-list animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {logs.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>
              No medication logs yet.
            </p>
          )}
          {logs.map(log => {
            const med = medicines.find(m => m.id === log.medId) || { name: 'Unknown Medicine', dosage: '' };
            return (
              <div key={log.id} className="glass-panel" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <strong style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>✓</span> Taken {log.timeString !== 'As Needed' ? `(${formatTime(log.timeString)})` : ''}
                  </strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {new Date(log.takenAt).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
                <div>
                  <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>{med.name}</span> 
                  <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>{med.dosage}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
