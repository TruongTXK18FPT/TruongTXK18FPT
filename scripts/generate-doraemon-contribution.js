const fs = require('fs');
const path = require('path');
const https = require('https');

// Paths
const doremonPath = path.join(__dirname, '../assets/doremon.png');
const dorayakiPath = path.join(__dirname, '../assets/dorayaki.png');
const fatdoremonPath = path.join(__dirname, '../assets/fatdoremon.png');

// Read and Base64 encode the sprite sheets
const doremonBase64 = fs.readFileSync(doremonPath).toString('base64');
const dorayakiBase64 = fs.readFileSync(dorayakiPath).toString('base64');
const fatdoremonBase64 = fs.readFileSync(fatdoremonPath).toString('base64');

// Fallback Mock Contribution Data for the rolling year
function generateMockContributions() {
  console.log("Generating mock contribution calendar as fallback...");
  const weeks = [];
  const now = new Date();
  const startDate = new Date(now.getTime() - 364 * 24 * 60 * 60 * 1000); // 52 weeks ago
  
  // Align to Sunday
  const startDay = startDate.getDay();
  startDate.setDate(startDate.getDate() - startDay);

  let currentDate = new Date(startDate);
  for (let w = 0; w < 53; w++) {
    const contributionDays = [];
    for (let d = 0; d < 7; d++) {
      let count = 0;
      let level = 0;
      
      const rand = Math.random();
      if (rand > 0.65) {
        count = Math.floor(Math.random() * 8) + 1;
        if (count < 3) level = 1;
        else if (count < 5) level = 2;
        else if (count < 8) level = 3;
        else level = 4;
      }
      
      contributionDays.push({
        date: currentDate.toISOString().split('T')[0],
        contributionCount: count,
        level: level,
        weekday: d
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    weeks.push({ contributionDays });
  }

  let total = 0;
  weeks.forEach(w => w.contributionDays.forEach(d => {
    total += d.contributionCount;
  }));

  return { weeks, total };
}

// Fetch unified contribution data from GitHub GraphQL API
function fetchContributions(owner, token) {
  return new Promise((resolve) => {
    if (!token) {
      console.warn("No GITHUB_TOKEN found. Using mock data.");
      return resolve(generateMockContributions());
    }

    const query = JSON.stringify({
      query: `
        query($login: String!) {
          user(login: $login) {
            contributionsCollection {
              contributionCalendar {
                totalContributions
                weeks {
                  contributionDays {
                    contributionCount
                    level
                    weekday
                    date
                  }
                }
              }
            }
          }
        }
      `,
      variables: { login: owner }
    });

    const options = {
      hostname: 'api.github.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Doraemon-Contribution-Journey-Generator',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(query)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.errors || !json.data || !json.data.user) {
            console.error("GraphQL API errors or empty response, falling back to mock data:", json.errors || json);
            return resolve(generateMockContributions());
          }
          const calendar = json.data.user.contributionsCollection.contributionCalendar;
          resolve({
            weeks: calendar.weeks,
            total: calendar.totalContributions
          });
        } catch (e) {
          console.error("Error parsing API response, falling back:", e);
          resolve(generateMockContributions());
        }
      });
    });

    req.on('error', (e) => {
      console.error("HTTP request error, falling back:", e);
      resolve(generateMockContributions());
    });

    req.write(query);
    req.end();
  });
}

// Generate the animated SVG
function generateSVG(weeks, totalCommits, isDark) {
  const theme = isDark ? {
    bg: '#0d1117',
    gridEmpty: '#161622',
    textColor: '#cdd6f4',
    subTextColor: '#a6adc8',
    borderColor: '#313244',
    titleColor: '#89b4fa'
  } : {
    bg: '#ffffff',
    gridEmpty: '#ebedf0',
    textColor: '#24292e',
    subTextColor: '#586069',
    borderColor: '#e1e4e6',
    titleColor: '#0366d6'
  };

  // Find all cells with contributions > 0
  const activeCells = [];
  weeks.forEach((week, w) => {
    week.contributionDays.forEach((day) => {
      if (day.contributionCount > 0) {
        activeCells.push({
          w: w,
          d: day.weekday,
          count: day.contributionCount,
          level: day.level,
          date: day.date
        });
      }
    });
  });

  // Target paths - Doraemon MUST hunt ALL commits in chronological order!
  let targets = [];
  if (activeCells.length > 0) {
    // Sort chronologically (oldest to newest)
    targets = [...activeCells].sort((a, b) => new Date(a.date) - new Date(b.date));
  } else {
    // Default fallback path if no commits
    targets = [
      { w: 5, d: 2, level: 3 }, { w: 15, d: 5, level: 4 }, { w: 25, d: 1, level: 2 },
      { w: 35, d: 4, level: 3 }, { w: 45, d: 1, level: 4 }
    ];
  }

  // Calculate cumulative movement timeline
  const timeline = [];
  let currentTime = 0;
  
  const startCell = targets[0];
  const startX = 2 + startCell.w * 12 - 4;
  const startY = 2 + startCell.d * 12 - 5;

  timeline.push({
    time: 0,
    x: startX,
    y: startY,
    state: 'idle',
    targetIdx: 0
  });

  const stepTime = 0.15; // Time to walk one cell (12px)

  for (let i = 0; i < targets.length; i++) {
    const cellA = targets[i];
    const cellB = targets[(i + 1) % targets.length];

    const xA = 2 + cellA.w * 12 - 4;
    const yA = 2 + cellA.d * 12 - 5;
    const xB = 2 + cellB.w * 12 - 4;
    const yB = 2 + cellB.d * 12 - 5;

    // 1. Walk horizontally
    if (cellA.w !== cellB.w) {
      const steps = Math.abs(cellB.w - cellA.w);
      currentTime += steps * stepTime;
      timeline.push({
        time: currentTime,
        x: xB,
        y: yA,
        state: 'walk',
        targetIdx: i
      });
    }

    // 2. Walk vertically
    if (cellA.d !== cellB.d) {
      const steps = Math.abs(cellB.d - cellA.d);
      currentTime += steps * stepTime;
      timeline.push({
        time: currentTime,
        x: xB,
        y: yB,
        state: 'walk',
        targetIdx: i
      });
    }

    // 3. Arrive and Eat (0.3s)
    const eatStart = currentTime;
    currentTime += 0.3;
    timeline.push({
      time: currentTime,
      x: xB,
      y: yB,
      state: 'eat',
      targetIdx: (i + 1) % targets.length,
      eatStart: eatStart
    });

    // 4. Chew (0.7s)
    currentTime += 0.7;
    timeline.push({
      time: currentTime,
      x: xB,
      y: yB,
      state: 'chew',
      targetIdx: (i + 1) % targets.length,
      eatStart: eatStart
    });
  }

  // After eating all dorayakis: Doraemon pauses, gets fat, falls down, sleeps, and wakes up!
  const finalX = 2 + targets[targets.length - 1].w * 12 - 4;
  const finalY = 2 + targets[targets.length - 1].d * 12 - 5;

  const pauseStart = currentTime;

  // Storyboard timeline additions (Total Pause: 8.5 seconds)
  // 1. Happy Full (1.5s)
  currentTime += 1.5;
  timeline.push({ time: currentTime, x: finalX, y: finalY, state: 'happy_full', eatStart: pauseStart });

  // 2. Stuffed sitting (1.5s)
  currentTime += 1.5;
  timeline.push({ time: currentTime, x: finalX, y: finalY, state: 'fat_idle', eatStart: pauseStart });

  // 3. Fall 1 (0.5s)
  currentTime += 0.5;
  timeline.push({ time: currentTime, x: finalX, y: finalY, state: 'fall_1', eatStart: pauseStart });

  // 4. Fall 2 (0.5s)
  currentTime += 0.5;
  timeline.push({ time: currentTime, x: finalX, y: finalY, state: 'fall_2', eatStart: pauseStart });

  // 5. Sleep (3.0s)
  currentTime += 3.0;
  timeline.push({ time: currentTime, x: finalX, y: finalY, state: 'sleep', eatStart: pauseStart });

  // 6. Wake up (1.5s)
  currentTime += 1.5;
  timeline.push({ time: currentTime, x: finalX, y: finalY, state: 'wake_up', eatStart: pauseStart });

  const totalDuration = currentTime;

  // Generate CSS Keyframes for Doraemon's Position
  let doremonMoveKeyframes = `@keyframes doremon-move {\n`;
  let doremonSpriteKeyframes = `@keyframes doremon-sprite {\n`;

  timeline.forEach((point) => {
    const pct = ((point.time / totalDuration) * 100).toFixed(2);
    
    // Position keyframe
    doremonMoveKeyframes += `  ${pct}% { transform: translate(${point.x}px, ${point.y}px); }\n`;

    // Sprite Selection keyframe (step-end)
    let frameSpec = ''; // 'normal-[idx]' or 'fat-[idx]'
    
    if (point.state === 'walk') {
      const walkCycle = Math.floor(point.time / 0.15) % 2;
      // Cycle frames 1 and 2 from doremon.png
      frameSpec = `normal-${walkCycle === 0 ? 1 : 2}`;
    } else if (point.state === 'eat') {
      frameSpec = 'normal-3'; // Eat mouth open from doremon.png
    } else if (point.state === 'chew') {
      const chewCycle = Math.floor((point.time - point.eatStart) / 0.175) % 4;
      frameSpec = `normal-${8 + chewCycle}`; // Chew cycle from doremon.png
    } else if (point.state === 'happy_full') {
      frameSpec = 'fat-3'; // Happy Full (fatdoremon.png frame 3)
    } else if (point.state === 'fat_idle') {
      frameSpec = 'fat-4'; // Stuffed sitting (fatdoremon.png frame 4)
    } else if (point.state === 'fall_1') {
      frameSpec = 'fat-5'; // Tipping over (fatdoremon.png frame 5)
    } else if (point.state === 'fall_2') {
      frameSpec = 'fat-6'; // Ground (fatdoremon.png frame 6)
    } else if (point.state === 'sleep') {
      const sleepCycle = Math.floor((point.time - (point.eatStart + 4.0)) / 0.5) % 4;
      // Cycle frames 7, 8, 9, 10 from fatdoremon.png
      frameSpec = `fat-${7 + Math.max(0, Math.min(3, sleepCycle))}`;
    } else if (point.state === 'wake_up') {
      frameSpec = 'fat-11'; // Wake up startled (fatdoremon.png frame 11)
    } else {
      frameSpec = 'normal-0'; // Idle
    }

    // Convert frameSpec to translation inside the crop SVG
    const isFat = frameSpec.startsWith('fat-');
    const idx = parseInt(frameSpec.split('-')[1]);
    
    // In our combined layout:
    // normal sprites row: y = 0, x = idx * 20
    // fat sprites row: y = -22, x = idx * 20
    const spriteTranslateX = -(idx * 20);
    const spriteTranslateY = isFat ? -22 : 0;

    doremonSpriteKeyframes += `  ${pct}% { transform: translate(${spriteTranslateX}px, ${spriteTranslateY}px); }\n`;
  });
  doremonMoveKeyframes += `}`;
  doremonSpriteKeyframes += `}`;

  // Generate CSS keyframes for each target Dorayaki
  let targetDonutCSS = '';
  targets.forEach((cell, idx) => {
    const eatEvent = timeline.find(p => p.targetIdx === idx && (p.state === 'eat' || p.state === 'chew'));
    
    if (eatEvent && eatEvent.eatStart !== undefined) {
      const eatStart = eatEvent.eatStart;
      const eatEnd = eatStart + 0.3;
      
      const eatStartPct = (eatStart / totalDuration) * 100;
      const eatEndPct = (eatEnd / totalDuration) * 100;

      let keyframes = `@keyframes donut-sprite-${idx} {\n`;
      
      let t = 0;
      while (t < eatStart) {
        const pct = ((t / totalDuration) * 100).toFixed(2);
        const frame = Math.floor(t / 0.25) % 4;
        keyframes += `  ${pct}% { transform: translate(-${frame * 12}px, 0); }\n`;
        t += 0.5;
      }
      
      keyframes += `  ${(eatStartPct - 0.01).toFixed(2)}% { transform: translate(-${(Math.floor(eatStart / 0.25) % 4) * 12}px, 0); }\n`;
      
      const eatStep = 0.3 / 8;
      for (let f = 0; f < 8; f++) {
        const timeOffset = eatStart + f * eatStep;
        const pct = ((timeOffset / totalDuration) * 100).toFixed(2);
        const frameIdx = f < 4 ? (8 + f) : (12 + (f - 4));
        keyframes += `  ${pct}% { transform: translate(-${frameIdx * 12}px, 0); }\n`;
      }
      
      keyframes += `  ${eatEndPct.toFixed(2)}% { transform: translate(-144px, 0); }\n`;
      keyframes += `  99.99% { transform: translate(-144px, 0); }\n`;
      keyframes += `  100% { transform: translate(0, 0); }\n`;
      keyframes += `}\n`;

      targetDonutCSS += keyframes;
      targetDonutCSS += `.donut-target-${idx} { animation: donut-sprite-${idx} ${totalDuration}s step-end infinite; }\n`;
    }
  });

  // Sparkles
  let starCSS = `
  @keyframes sparkle-glow {
    0%, 100% { opacity: 0; transform: scale(0); }
    50% { opacity: 1; transform: scale(1.2); }
  }
  .sparkle-star {
    transform-origin: center;
  }
  `;

  // Draw cells
  let gridCells = '';
  weeks.forEach((week, w) => {
    week.contributionDays.forEach((day) => {
      const x = 2 + w * 12;
      const y = 2 + day.weekday * 12;
      
      let cellColor = theme.gridEmpty;
      if (day.contributionCount > 0) {
        if (day.level === 1) cellColor = isDark ? '#262930' : '#f5e0dc';
        else if (day.level === 2) cellColor = isDark ? '#2a354f' : '#f5c2e7';
        else if (day.level === 3) cellColor = isDark ? '#31416b' : '#cba6f7';
        else cellColor = isDark ? '#394d87' : '#89b4fa';
      }
      
      gridCells += `<rect x="${x}" y="${y}" width="10" height="10" rx="2" fill="${cellColor}" />\n`;
    });
  });

  // Draw Dorayakis
  let gridDonuts = '';
  activeCells.forEach((cell) => {
    const x = 2 + cell.w * 12 - 1;
    const y = 2 + cell.d * 12 - 1;
    
    const targetIdx = targets.findIndex(t => t.w === cell.w && t.d === cell.d);
    
    if (targetIdx !== -1) {
      gridDonuts += `
      <g transform="translate(${x}, ${y})">
        <svg width="12" height="12" viewBox="0 0 12 12" style="overflow: hidden;">
          <g class="donut-target-${targetIdx}">
            <g transform="translate(0, 0)"><use href="#donut-frame-0"/></g>
            <g transform="translate(12, 0)"><use href="#donut-frame-1"/></g>
            <g transform="translate(24, 0)"><use href="#donut-frame-2"/></g>
            <g transform="translate(36, 0)"><use href="#donut-frame-3"/></g>
            <g transform="translate(48, 0)"><use href="#donut-frame-8"/></g>
            <g transform="translate(60, 0)"><use href="#donut-frame-9"/></g>
            <g transform="translate(72, 0)"><use href="#donut-frame-10"/></g>
            <g transform="translate(84, 0)"><use href="#donut-frame-11"/></g>
            <g transform="translate(96, 0)"><use href="#donut-frame-12"/></g>
            <g transform="translate(108, 0)"><use href="#donut-frame-13"/></g>
            <g transform="translate(120, 0)"><use href="#donut-frame-14"/></g>
            <g transform="translate(132, 0)"><use href="#donut-frame-15"/></g>
            <g transform="translate(144, 0)"><rect width="12" height="12" fill="none"/></g>
          </g>
        </svg>
      </g>\n`;
    } else {
      const randomOffset = Math.floor(Math.random() * 4);
      gridDonuts += `
      <g transform="translate(${x}, ${y})">
        <svg width="12" height="12" viewBox="0 0 12 12" style="overflow: hidden;">
          <g style="animation: donut-spin 1.5s step-end infinite; animation-delay: -${randomOffset * 0.3}s;">
            <g transform="translate(0, 0)"><use href="#donut-frame-0"/></g>
            <g transform="translate(12, 0)"><use href="#donut-frame-1"/></g>
            <g transform="translate(24, 0)"><use href="#donut-frame-2"/></g>
            <g transform="translate(36, 0)"><use href="#donut-frame-3"/></g>
          </g>
        </svg>
      </g>\n`;
    }
  });

  return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 740 180" width="100%" height="100%">
  <style>
    .background {
      fill: ${theme.bg};
      rx: 16px;
    }
    .text-title {
      font-family: 'JetBrains Mono', monospace, 'Courier New', Courier;
      font-weight: 700;
      font-size: 16px;
      fill: ${theme.titleColor};
    }
    .text-subtitle {
      font-family: 'JetBrains Mono', monospace, sans-serif;
      font-weight: 500;
      font-size: 11px;
      fill: ${theme.subTextColor};
    }
    .grid-container {
      transform: translate(30px, 60px);
    }
    
    /* Doraemon Movement and Sprite Animations */
    ${doremonMoveKeyframes}
    ${doremonSpriteKeyframes}
    
    .doremon-mascot {
      animation: doremon-move ${totalDuration}s linear infinite;
    }
    .doremon-sprite-sheet {
      animation: doremon-sprite ${totalDuration}s step-end infinite;
    }
    
    /* Target Donuts eating animations */
    ${targetDonutCSS}
    
    /* General Spinning donut animation */
    @keyframes donut-spin {
      0% { transform: translate(0, 0); }
      25% { transform: translate(-12px, 0); }
      50% { transform: translate(-24px, 0); }
      75% { transform: translate(-36px, 0); }
    }
    
    /* Retro stars animations */
    ${starCSS}
    
    image {
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }
  </style>

  <defs>
    <!-- Single instances of high-res sprite sheets to prevent redundant base64 replication -->
    <image id="doremon-spritesheet" href="data:image/png;base64,${doremonBase64}" width="1024" height="835"/>
    <image id="cake-spritesheet" href="data:image/png;base64,${dorayakiBase64}" width="1254" height="1254"/>
    <image id="fatdoremon-spritesheet" href="data:image/png;base64,${fatdoremonBase64}" width="1536" height="1024"/>

    <!-- Sprite definitions cropped via viewboxes referencing the single images above -->
    <!-- Doraemon Sprite frames (20x22 SVG canvas) -->
    <!-- Row 0 (doremon.png) -->
    <g id="doremon-frame-0"><svg width="20" height="22" viewBox="0 0 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-1"><svg width="20" height="22" viewBox="256 0 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-2"><svg width="20" height="22" viewBox="512 0 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-3"><svg width="20" height="22" viewBox="768 0 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <!-- Row 1 (doremon.png) -->
    <g id="doremon-frame-4"><svg width="20" height="22" viewBox="0 278 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-5"><svg width="20" height="22" viewBox="256 278 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-6"><svg width="20" height="22" viewBox="512 278 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-7"><svg width="20" height="22" viewBox="768 278 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <!-- Row 2 (doremon.png) -->
    <g id="doremon-frame-8"><svg width="20" height="22" viewBox="0 556 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-9"><svg width="20" height="22" viewBox="256 556 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-10"><svg width="20" height="22" viewBox="512 556 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-11"><svg width="20" height="22" viewBox="768 556 256 278"><use href="#doremon-spritesheet"/></svg></g>

    <!-- Fat Doraemon Sprite frames (20x22 SVG canvas) -->
    <!-- Row 0 (fatdoremon.png) -->
    <g id="fatdoremon-frame-0"><svg width="20" height="22" viewBox="0 0 384 341.33"><use href="#fatdoremon-spritesheet"/></svg></g>
    <g id="fatdoremon-frame-1"><svg width="20" height="22" viewBox="384 0 384 341.33"><use href="#fatdoremon-spritesheet"/></svg></g>
    <g id="fatdoremon-frame-2"><svg width="20" height="22" viewBox="768 0 384 341.33"><use href="#fatdoremon-spritesheet"/></svg></g>
    <g id="fatdoremon-frame-3"><svg width="20" height="22" viewBox="1152 0 384 341.33"><use href="#fatdoremon-spritesheet"/></svg></g>
    <!-- Row 1 (fatdoremon.png) -->
    <g id="fatdoremon-frame-4"><svg width="20" height="22" viewBox="0 341.33 384 341.33"><use href="#fatdoremon-spritesheet"/></svg></g>
    <g id="fatdoremon-frame-5"><svg width="20" height="22" viewBox="384 341.33 384 341.33"><use href="#fatdoremon-spritesheet"/></svg></g>
    <g id="fatdoremon-frame-6"><svg width="20" height="22" viewBox="768 341.33 384 341.33"><use href="#fatdoremon-spritesheet"/></svg></g>
    <g id="fatdoremon-frame-7"><svg width="20" height="22" viewBox="1152 341.33 384 341.33"><use href="#fatdoremon-spritesheet"/></svg></g>
    <!-- Row 2 (fatdoremon.png) -->
    <g id="fatdoremon-frame-8"><svg width="20" height="22" viewBox="0 682.66 384 341.33"><use href="#fatdoremon-spritesheet"/></svg></g>
    <g id="fatdoremon-frame-9"><svg width="20" height="22" viewBox="384 682.66 384 341.33"><use href="#fatdoremon-spritesheet"/></svg></g>
    <g id="fatdoremon-frame-10"><svg width="20" height="22" viewBox="768 682.66 384 341.33"><use href="#fatdoremon-spritesheet"/></svg></g>
    <g id="fatdoremon-frame-11"><svg width="20" height="22" viewBox="1152 682.66 384 341.33"><use href="#fatdoremon-spritesheet"/></svg></g>

    <!-- Donut Sprite frames (12x12 SVG canvas) -->
    <!-- Row 0 (Full) -->
    <g id="donut-frame-0"><svg width="12" height="12" viewBox="0 0 313.5 313.5"><use href="#cake-spritesheet"/></svg></g>
    <g id="donut-frame-1"><svg width="12" height="12" viewBox="313.5 0 313.5 313.5"><use href="#cake-spritesheet"/></svg></g>
    <g id="donut-frame-2"><svg width="12" height="12" viewBox="627 0 313.5 313.5"><use href="#cake-spritesheet"/></svg></g>
    <g id="donut-frame-3"><svg width="12" height="12" viewBox="940.5 0 313.5 313.5"><use href="#cake-spritesheet"/></svg></g>
    <!-- Row 2 (Bites) -->
    <g id="donut-frame-8"><svg width="12" height="12" viewBox="0 627 313.5 313.5"><use href="#cake-spritesheet"/></svg></g>
    <g id="donut-frame-9"><svg width="12" height="12" viewBox="313.5 627 313.5 313.5"><use href="#cake-spritesheet"/></svg></g>
    <g id="donut-frame-10"><svg width="12" height="12" viewBox="627 627 313.5 313.5"><use href="#cake-spritesheet"/></svg></g>
    <g id="donut-frame-11"><svg width="12" height="12" viewBox="940.5 627 313.5 313.5"><use href="#cake-spritesheet"/></svg></g>
    <!-- Row 3 (Crumbs) -->
    <g id="donut-frame-12"><svg width="12" height="12" viewBox="0 940.5 313.5 313.5"><use href="#cake-spritesheet"/></svg></g>
    <g id="donut-frame-13"><svg width="12" height="12" viewBox="313.5 940.5 313.5 313.5"><use href="#cake-spritesheet"/></svg></g>
    <g id="donut-frame-14"><svg width="12" height="12" viewBox="627 940.5 313.5 313.5"><use href="#cake-spritesheet"/></svg></g>
    <g id="donut-frame-15"><svg width="12" height="12" viewBox="940.5 940.5 313.5 313.5"><use href="#cake-spritesheet"/></svg></g>
  </defs>

  <!-- Background -->
  <rect class="background" width="100%" height="100%" />

  <!-- Titles -->
  <text class="text-title" x="30" y="32">✨ Contributions ✨</text>
  <text class="text-subtitle" x="30" y="47">Total contributions: ${totalCommits} commits in the last 365 days</text>

  <!-- Contribution Grid Section -->
  <g class="grid-container">
    <!-- Base grid cells -->
    ${gridCells}

    <!-- Overlay Donuts (Dorayakis) -->
    ${gridDonuts}

    <!-- Doraemon Pixel Mascot character -->
    <g class="doremon-mascot">
      <svg width="20" height="44" viewBox="0 0 20 44" style="overflow: hidden;">
        <!-- Two rows stacked: row 0 = normal doremon, row 1 = fat doremon -->
        <g class="doremon-sprite-sheet" transform="translate(0, 0)">
          <!-- Normal Doraemon Row (y = 0) -->
          <g transform="translate(0, 0)">
            <g transform="translate(0, 0)"><use href="#doremon-frame-0"/></g>
            <g transform="translate(20, 0)"><use href="#doremon-frame-1"/></g>
            <g transform="translate(40, 0)"><use href="#doremon-frame-2"/></g>
            <g transform="translate(60, 0)"><use href="#doremon-frame-3"/></g>
            <g transform="translate(80, 0)"><use href="#doremon-frame-4"/></g>
            <g transform="translate(100, 0)"><use href="#doremon-frame-5"/></g>
            <g transform="translate(120, 0)"><use href="#doremon-frame-6"/></g>
            <g transform="translate(140, 0)"><use href="#doremon-frame-7"/></g>
            <g transform="translate(160, 0)"><use href="#doremon-frame-8"/></g>
            <g transform="translate(180, 0)"><use href="#doremon-frame-9"/></g>
            <g transform="translate(200, 0)"><use href="#doremon-frame-10"/></g>
            <g transform="translate(220, 0)"><use href="#doremon-frame-11"/></g>
          </g>
          <!-- Fat Doraemon Row (y = 22) -->
          <g transform="translate(0, 22)">
            <g transform="translate(0, 0)"><use href="#fatdoremon-frame-0"/></g>
            <g transform="translate(20, 0)"><use href="#fatdoremon-frame-1"/></g>
            <g transform="translate(40, 0)"><use href="#fatdoremon-frame-2"/></g>
            <g transform="translate(60, 0)"><use href="#fatdoremon-frame-3"/></g>
            <g transform="translate(80, 0)"><use href="#fatdoremon-frame-4"/></g>
            <g transform="translate(100, 0)"><use href="#fatdoremon-frame-5"/></g>
            <g transform="translate(120, 0)"><use href="#fatdoremon-frame-6"/></g>
            <g transform="translate(140, 0)"><use href="#fatdoremon-frame-7"/></g>
            <g transform="translate(160, 0)"><use href="#fatdoremon-frame-8"/></g>
            <g transform="translate(180, 0)"><use href="#fatdoremon-frame-9"/></g>
            <g transform="translate(200, 0)"><use href="#fatdoremon-frame-10"/></g>
            <g transform="translate(220, 0)"><use href="#fatdoremon-frame-11"/></g>
          </g>
        </g>
      </svg>
    </g>
  </g>
</svg>
`;
}

// Update the README.md dynamically with interactive details tags and commit counters
function updateReadme(totalCommits) {
  const readmePath = path.join(__dirname, '../README.md');
  if (!fs.existsSync(readmePath)) return;

  const content = fs.readFileSync(readmePath, 'utf8');
  const repoOwner = process.env.GITHUB_REPOSITORY || "TruongTXK18FPT/TruongTXK18FPT";
  
  // Custom interactive details layout
  const newDetailsSection = `
**Total Contributions: ${totalCommits}**

<p align="center">
  <img
    width="100%"
    src="https://raw.githubusercontent.com/${repoOwner}/output/github-doraemon-contribution-dark.svg?v=3"
    alt="Doraemon eating dorayaki contributions animation"
  />
</p>
`;

  // Standard string replacement between comments
  const startIndex = content.indexOf('<!-- DORAEMON_CONTRIBUTION_START -->');
  const endIndex = content.indexOf('<!-- DORAEMON_CONTRIBUTION_END -->');

  if (startIndex !== -1 && endIndex !== -1) {
    const updatedContent = content.substring(0, startIndex + '<!-- DORAEMON_CONTRIBUTION_START -->'.length) +
      newDetailsSection +
      content.substring(endIndex);
    fs.writeFileSync(readmePath, updatedContent);
    console.log("Successfully updated README.md with unified contribution layout and total commits!");
  } else {
    console.warn("Could not find DORAEMON_CONTRIBUTION placeholders in README.md.");
  }
}

// Main Execution
async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY || "TruongTXK18FPT/TruongTXK18FPT";
  const owner = repo.split('/')[0];

  console.log(`Starting unified Doraemon contribution generator for owner: ${owner}...`);

  const { weeks, total } = await fetchContributions(owner, token);

  const distDir = path.join(__dirname, '../dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const lightSVG = generateSVG(weeks, total, false);
  const darkSVG = generateSVG(weeks, total, true);

  fs.writeFileSync(path.join(distDir, 'github-doraemon-contribution.svg'), lightSVG);
  fs.writeFileSync(path.join(distDir, 'github-doraemon-contribution-dark.svg'), darkSVG);
  console.log(`Successfully generated unified SVGs (Total contributions: ${total})`);

  // Update the README
  updateReadme(total);
}

main().catch(console.error);
