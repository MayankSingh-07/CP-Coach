import React from 'react';

const CFBadge = ({ rating, handle }) => {
  let color = 'text-gray-400';
  let rank = 'Newbie';
  let isLGM = false;

  if (rating < 1200) { color = 'text-gray-400'; rank = 'Newbie'; }
  else if (rating < 1400) { color = 'text-green-500'; rank = 'Pupil'; }
  else if (rating < 1600) { color = 'text-cyan-400'; rank = 'Specialist'; }
  else if (rating < 1900) { color = 'text-blue-500'; rank = 'Expert'; }
  else if (rating < 2100) { color = 'text-purple-500'; rank = 'Candidate Master'; }
  else if (rating < 2300) { color = 'text-orange-400'; rank = 'Master'; }
  else if (rating < 2400) { color = 'text-orange-500'; rank = 'International Master'; }
  else if (rating < 2600) { color = 'text-red-500'; rank = 'Grandmaster'; }
  else if (rating < 3000) { color = 'text-red-600'; rank = 'International Grandmaster'; }
  else { color = 'text-black'; rank = 'Legendary Grandmaster'; isLGM = true; }

  if (isLGM && handle && handle.length > 0) {
    return (
      <div className="flex flex-col items-start">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: '#ff0000' }}>{rank}</span>
          <span className="text-xs text-textMuted font-mono">({rating})</span>
        </div>
        <div className="font-bold text-2xl flex font-mono">
          <span className="text-black" style={{ textShadow: '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff' }}>{handle[0]}</span>
          <span className="text-red-600">{handle.slice(1)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold ${color}`}>{rank}</span>
        <span className="text-xs text-textMuted font-mono">({rating})</span>
      </div>
      <h3 className={`text-2xl font-bold font-mono ${color}`}>{handle || 'Unknown'}</h3>
    </div>
  );
};

export default CFBadge;
