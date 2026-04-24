'use client';
import { useState, useEffect, useRef } from 'react';

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

const getCSTDate = () => {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
};

export default function Home() {
  const [activeTab, setActiveTab] = useState('today');
  const [medicines, setMedicines] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentTime, setCurrentTime] = useState(null);
  
  // Settings State
  const [newMed, setNewMed] = useState({ name: '', dosage: '', times: '', isOptional: false });
  const notifiedTimes = useRef(new Set());
  
  useEffect(() => {
    // Upgraded keys to handle new schema (skipped status)
    const savedMeds = localStorage.getItem('meds_v4');
    const savedLogs = localStorage.getItem('logs_v4');
    
    if (savedMeds) {
      setMedicines(JSON.parse(savedMeds));
    } else {
      setMedicines(DEFAULT_MEDS);
    }
    
    if (savedLogs) {
      setLogs(JSON.parse(savedLogs));
    } else {
      // Migrate previous logs
      const oldLogs = localStorage.getItem('logs_v2');
      if (oldLogs) setLogs(JSON.parse(oldLogs).map(l => ({...l, status: l.status || 'taken'})));
    }
    
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }

    setCurrentTime(getCSTDate());
    const clockInterval = setInterval(() => {
      setCurrentTime(getCSTDate());
    }, 60000);

    setIsLoaded(true);
    return () => clearInterval(clockInterval);
  }, []);

  useEffect(() => {
    if (isLoaded) localStorage.setItem('meds_v4', JSON.stringify(medicines));
  }, [medicines, isLoaded]);

  useEffect(() => {
    if (isLoaded) localStorage.setItem('logs_v4', JSON.stringify(logs));
  }, [logs, isLoaded]);

  // Notifications Check
  useEffect(() => {
    if (!currentTime || !isLoaded) return;
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      const h = currentTime.getHours().toString().padStart(2, '0');
      const m = currentTime.getMinutes().toString().padStart(2, '0');
      const timeStr = `${h}:${m}`;
      
      if (!notifiedTimes.current.has(timeStr)) {
        const hasMedsNow = medicines.some(med => med.times.includes(timeStr));
        if (hasMedsNow) {
          new Notification("MedTracker Alert", { 
            body: `It's ${formatTime(timeStr)}! Time for medication.`,
            icon: '/icon-192x192.png'
          });
          notifiedTimes.current.add(timeStr);
        }
      }
      
      // Clear tracking at midnight
      if (h === '00' && m === '00') notifiedTimes.current.clear();
    }
  }, [currentTime, medicines, isLoaded]);

  const requestNotifications = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') alert("Push Notifications enabled!");
      else alert("Notifications were denied.");
    } else {
      alert("Push notifications are not supported on this browser.");
    }
  };

  const handleActionMed = (medId, timeString, actionStatus) => {
    const newLog = {
      id: Date.now().toString(),
      medId,
      timeString,
      status: actionStatus, // 'taken' or 'skipped'
      takenAt: getCSTDate().toISOString()
    };
    setLogs([newLog, ...logs]);
  };

  const getLogForToday = (medId, timeString) => {
    const today = getCSTDate().toLocaleDateString();
    return logs.find(log => {
      const logDate = new Date(log.takenAt).toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
      return log.medId === medId && log.timeString === timeString && logDate === today;
    });
  };

  if (!isLoaded || !currentTime) return null;

  // Generate Schedule
  const scheduleItems = [];
  medicines.forEach(med => {
    med.times.forEach(time => {
      scheduleItems.push({ med, time });
    });
  });

  scheduleItems.sort((a, b) => {
    if (a.time === 'As Needed') return 1;
    if (b.time === 'As Needed') return -1;
    return a.time.localeCompare(b.time);
  });

  const groupedSchedule = {};
  scheduleItems.forEach(item => {
    if (!groupedSchedule[item.time]) groupedSchedule[item.time] = [];
    groupedSchedule[item.time].push(item);
  });

  const getGroupStatus = (time) => {
    if (time === 'As Needed') return null;
    const itemsInGroup = groupedSchedule[time];
    // Group is handled if EVERY req medicine has a log (taken or skipped)
    const allHandled = itemsInGroup.every(item => getLogForToday(item.med.id, time));
    
    const target = getCSTDate();
    const [h, m] = time.split(':').map(Number);
    target.setHours(h, m, 0, 0);
    
    const diffMs = target - currentTime;
    const diffMins = Math.floor(diffMs / 60000);
    
    return {
      allHandled,
      diffMins,
      isOverdue: diffMins < 0 && !allHandled,
      isUpcoming: diffMins >= 0 && !allHandled
    };
  };

  const pendingGroups = Object.keys(groupedSchedule)
    .filter(time => time !== 'As Needed')
    .map(time => ({ time, status: getGroupStatus(time) }))
    .filter(g => !g.status.allHandled);

  let nextGroup = null;
  let laterGroups = [];
  if (pendingGroups.length > 0) {
    pendingGroups.sort((a, b) => a.status.diffMins - b.status.diffMins);
    nextGroup = pendingGroups[0];
    laterGroups = pendingGroups.slice(1);
    laterGroups.sort((a, b) => a.time.localeCompare(b.time));
  }

  // Analytics
  const adherenceDays = [];
  for (let i = 0; i < 7; i++) {
    const d = getCSTDate();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString();
    
    // Required items for a standard day
    const requiredItems = scheduleItems.filter(item => !item.med.isOptional && item.time !== 'As Needed');
    const logsForDay = logs.filter(l => new Date(l.takenAt).toLocaleDateString('en-US', { timeZone: 'America/Chicago' }) === dateStr);
    
    const takenCount = logsForDay.filter(l => l.status === 'taken' && !medicines.find(m => m.id === l.medId)?.isOptional).length;
    
    adherenceDays.push({
      dateStr: d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
      taken: takenCount,
      total: requiredItems.length,
      percent: requiredItems.length > 0 ? Math.round((takenCount / requiredItems.length) * 100) : 100
    });
  }

  // Settings Handlers
  const handleAddMed = () => {
    if (!newMed.name || !newMed.dosage || !newMed.times) return alert("Please fill out all fields.");
    const timesArray = newMed.times.split(',').map(s => s.trim());
    const med = {
      id: Date.now().toString(),
      name: newMed.name,
      dosage: newMed.dosage,
      times: timesArray,
      isOptional: newMed.isOptional
    };
    setMedicines([...medicines, med]);
    setNewMed({ name: '', dosage: '', times: '', isOptional: false });
  };
  const handleDeleteMed = (id) => setMedicines(medicines.filter(m => m.id !== id));

  return (
    <>
      <header className="top-nav">
        <div>
          <h1>MedTracker</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Texas Time: {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <button 
          className="btn btn-ghost" 
          onClick={() => setActiveTab('settings')}
          style={{ padding: '8px', opacity: activeTab === 'settings' ? 1 : 0.6 }}
        >
          ⚙️
        </button>
      </header>

      <div className="tabs">
        <div className={`tab ${activeTab === 'today' ? 'active' : ''}`} onClick={() => setActiveTab('today')}>Today</div>
        <div className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>History</div>
      </div>

      {activeTab === 'today' && (
        <div className="schedule-list animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {!nextGroup && (
            <div style={{ background: "rgba(16, 185, 129, 0.15)", border: "1px solid var(--success)", padding: '30px 20px', borderRadius: '16px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                <h2 style={{ fontSize: '1.25rem', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: 'var(--accent-primary)', padding: '4px 10px', borderRadius: '8px', fontSize: '0.9rem', color: '#fff' }}>Next Up</span>
                    {formatTime(time)}
                  </span>
                </h2>
                
                {items.map((item, index) => {
                  const { med, time: itemTime } = item;
                  const logForToday = getLogForToday(med.id, itemTime);
                  const isHandled = !!logForToday;
                  
                  return (
                    <div 
                      key={`${med.id}-${itemTime}`} 
                      className="glass-panel" 
                      style={{ 
                        padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        animationDelay: `${index * 0.05}s`,
                        opacity: isHandled ? 0.6 : 1, transform: isHandled ? 'scale(0.98)' : 'scale(1)', transition: 'all 0.3s ease'
                      }}
                    >
                      <div>
                        <h3 style={{ fontSize: '1.25rem', marginBottom: '4px', fontWeight: '600', textDecoration: isHandled ? 'line-through' : 'none' }}>
                          {med.name}
                        </h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{med.dosage}</p>
                        {!isHandled && (
                          <div style={{ marginTop: '6px', fontSize: '0.85rem', color: bannerColor, fontWeight: '500' }}>
                            {bannerText}
                          </div>
                        )}
                        {isHandled && (
                          <div style={{ marginTop: '6px', fontSize: '0.85rem', color: logForToday.status === 'skipped' ? 'var(--text-muted)' : 'var(--success)', fontWeight: '500' }}>
                            {logForToday.status === 'skipped' ? '⏭️ Skipped' : `✓ Taken for ${formatTime(time)}`}
                          </div>
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {isHandled ? (
                          <button className={`btn ${logForToday.status === 'skipped' ? 'btn-ghost' : 'btn-success'}`} disabled style={{ opacity: 0.8, cursor: 'default' }}>
                            {logForToday.status === 'skipped' ? 'Skipped' : '✓ Taken'}
                          </button>
                        ) : (
                          <>
                            <button className="btn btn-ghost" style={{ padding: '10px 14px', border: '1px solid var(--border-color)', fontSize: '0.9rem' }} onClick={() => handleActionMed(med.id, itemTime, 'skipped')}>
                              Skip
                            </button>
                            <button className="btn btn-primary" onClick={() => handleActionMed(med.id, itemTime, 'taken')}>
                              Take
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {laterGroups.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
              <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Coming Up Later</h3>
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

          {groupedSchedule['As Needed'] && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
              <h2 style={{ fontSize: '1.05rem', color: 'var(--text-muted)', borderBottom: '1px dashed var(--border-color)', paddingBottom: '8px' }}>Optional / As Needed</h2>
              {groupedSchedule['As Needed'].map((item, index) => {
                const { med, time: itemTime } = item;
                const logForToday = getLogForToday(med.id, itemTime);
                
                return (
                  <div key={`${med.id}-${itemTime}`} className="glass-panel" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', marginBottom: '2px', fontWeight: '500', color: 'var(--text-muted)' }}>{med.name}</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{med.dosage}</p>
                    </div>
                    <button className="btn btn-ghost" style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-main)' }} onClick={() => { handleActionMed(med.id, itemTime, 'taken'); alert(`Logged ${med.name}!`); }}>
                      {logForToday ? '+ Log Again' : 'Take'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="history-list animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '20px', color: 'var(--text-main)', textAlign: 'center' }}>7-Day Adherence Tracker</h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '120px', gap: '6px' }}>
              {adherenceDays.slice().reverse().map((day, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '8px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-main)', fontWeight: '600' }}>{day.percent}%</span>
                  <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'flex-end', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                    <div style={{ 
                      width: '100%', 
                      height: `${Math.min(100, day.percent)}%`, 
                      background: day.percent >= 100 ? 'var(--success)' : (day.percent > 0 ? 'var(--accent-secondary)' : 'transparent'),
                      borderRadius: '6px',
                      transition: 'height 0.8s ease'
                    }}></div>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{day.dateStr.split(',')[0]}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: '1.05rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '12px' }}>Recent Logs</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {logs.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '20px' }}>No logs yet.</p>}
              {logs.map(log => {
                const med = medicines.find(m => m.id === log.medId) || { name: 'Unknown Medicine', dosage: '' };
                const isSkipped = log.status === 'skipped';
                return (
                  <div key={log.id} className="glass-panel" style={{ padding: '16px', borderLeft: `4px solid ${isSkipped ? 'var(--text-muted)' : 'var(--success)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <strong style={{ color: isSkipped ? 'var(--text-muted)' : 'var(--success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{isSkipped ? '⏭️' : '✓'}</span> {isSkipped ? 'Skipped' : 'Taken'} {log.timeString !== 'As Needed' ? `(${formatTime(log.timeString)})` : ''}
                      </strong>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {new Date(log.takenAt).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontWeight: '600', color: isSkipped ? 'var(--text-muted)' : 'var(--text-main)' }}>{med.name}</span> 
                      <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>{med.dosage}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="settings-list animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '12px', color: 'var(--accent-primary)' }}>Push Notifications</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px', lineHeight: '1.5' }}>
              Receive standard browser alerts when it's time to take medication. (Note: True lock-screen notifications require a cloud server).
            </p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={requestNotifications}>
              🔔 Enable Device Notifications
            </button>
          </div>

          <div className="glass-panel" style={{ padding: '20px' }}>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '16px', color: 'var(--accent-primary)' }}>Manage Schedule</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              {medicines.map(med => (
                <div key={med.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '12px 16px', borderRadius: '12px' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '1.05rem', marginBottom: '4px' }}>{med.name} {med.isOptional && <span style={{fontSize:'0.75rem', color:'var(--text-muted)', fontWeight:'normal'}}>(Optional)</span>}</strong>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{med.dosage} • {med.times.join(', ')}</span>
                  </div>
                  <button className="btn btn-ghost" style={{ color: 'var(--danger)', padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => handleDeleteMed(med.id)}>Remove</button>
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: '1.05rem', marginBottom: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>Add New Prescription</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="text" placeholder="Name (e.g. Tylenol)" value={newMed.name} onChange={e => setNewMed({...newMed, name: e.target.value})} style={{ padding: '14px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none' }} />
              <input type="text" placeholder="Dosage (e.g. 5ml)" value={newMed.dosage} onChange={e => setNewMed({...newMed, dosage: e.target.value})} style={{ padding: '14px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none' }} />
              <input type="text" placeholder="Times (e.g. 08:00, 19:30 or As Needed)" value={newMed.times} onChange={e => setNewMed({...newMed, times: e.target.value})} style={{ padding: '14px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none' }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.95rem', margin: '8px 0', color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={newMed.isOptional} onChange={e => setNewMed({...newMed, isOptional: e.target.checked})} style={{ width: '18px', height: '18px' }} />
                Mark as "As Needed" / Optional
              </label>
              <button className="btn btn-success" onClick={handleAddMed} style={{ marginTop: '8px' }}>+ Add to Schedule</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
