/**
 * @file generate-doraemon-contribution.js
 * @description Fetches GitHub contribution data for the user and generates pixel-art 
 * animated SVGs themed around Doraemon eating dorayakis. Can be run locally or in GitHub Actions.
 * 
 * Usage:
 * - In GitHub Actions: Automatically run by workflow, GITHUB_TOKEN is supplied via env.
 * - Locally: node scripts/generate-doraemon-contribution.js [GITHUB_TOKEN]
 */

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

  // 1. Normal Size Celebrate (1.5s) - Normal Doraemon celebrates
  currentTime += 1.5;
  timeline.push({ time: currentTime, x: finalX, y: finalY, state: 'normal_celebrate', celebrateStart: pauseStart });

  // 2. Belly Expands (1.2s) - Transitions from normal to fat (grows frame by frame)
  const expandStart = currentTime;
  currentTime += 1.2;
  timeline.push({ time: currentTime, x: finalX, y: finalY, state: 'belly_expand', expandStart: expandStart });

  // 3. Stuffed Sitting (1.5s) - Heavy stuffed idle sitting
  const stuffedStart = currentTime;
  currentTime += 1.5;
  timeline.push({ time: currentTime, x: finalX, y: finalY, state: 'fat_idle', stuffedStart: stuffedStart });

  // 4. Fall 1 (0.5s) - Tipping over
  const fall1Start = currentTime;
  currentTime += 0.5;
  timeline.push({ time: currentTime, x: finalX, y: finalY, state: 'fall_1', fall1Start: fall1Start });

  // 5. Fall 2 (0.5s) - On the ground
  const fall2Start = currentTime;
  currentTime += 0.5;
  timeline.push({ time: currentTime, x: finalX, y: finalY, state: 'fall_2', fall2Start: fall2Start });

  // 6. Sleep (3.0s) - Snoozing on back
  const sleepStart = currentTime;
  currentTime += 3.0;
  timeline.push({ time: currentTime, x: finalX, y: finalY, state: 'sleep', sleepStart: sleepStart });

  // 7. Wake Up (1.5s) - Startled wake up
  const wakeStart = currentTime;
  currentTime += 1.5;
  timeline.push({ time: currentTime, x: finalX, y: finalY, state: 'wake_up', wakeStart: wakeStart });

  const totalDuration = currentTime;

  // Generate CSS Keyframes for Doraemon's Position and Sprite with 20 FPS sampling
  let doremonMoveKeyframes = `@keyframes doremon-move {\n`;
  let doremonSpriteKeyframes = `@keyframes doremon-sprite {\n`;

  const sampleStep = 0.05; // 20 FPS sampling for perfectly smooth animation

  for (let j = 0; j < timeline.length - 1; j++) {
    const p1 = timeline[j];
    const p2 = timeline[j + 1];
    
    const tStart = p1.time;
    const tEnd = p2.time;
    const duration = tEnd - tStart;
    
    let t = tStart;
    while (t < tEnd) {
      const pct = ((t / totalDuration) * 100).toFixed(2);
      const ratio = duration > 0 ? (t - tStart) / duration : 0;
      const x = (p1.x + (p2.x - p1.x) * ratio).toFixed(1);
      const y = (p1.y + (p2.y - p1.y) * ratio).toFixed(1);
      
      doremonMoveKeyframes += `  ${pct}% { transform: translate(${x}px, ${y}px); }\n`;
      
      let frameSpec = '';
      if (p2.state === 'walk') {
        const walkCycle = Math.floor(t / 0.15) % 2;
        frameSpec = `normal-${walkCycle === 0 ? 1 : 2}`;
      } else if (p2.state === 'eat') {
        frameSpec = 'normal-3';
      } else if (p2.state === 'chew') {
        const chewCycle = Math.floor((t - p2.eatStart) / 0.175) % 4;
        frameSpec = `normal-${8 + chewCycle}`;
      } else if (p2.state === 'normal_celebrate') {
        const celebCycle = Math.floor((t - p2.celebrateStart) / 0.3) % 4;
        frameSpec = `normal-${4 + celebCycle}`;
      } else if (p2.state === 'belly_expand') {
        const expandCycle = Math.floor((t - p2.expandStart) / 0.3) % 4;
        frameSpec = `fat-${expandCycle}`;
      } else if (p2.state === 'fat_idle') {
        frameSpec = 'fat-4';
      } else if (p2.state === 'fall_1') {
        frameSpec = 'fat-5';
      } else if (p2.state === 'fall_2') {
        frameSpec = 'fat-6';
      } else if (p2.state === 'sleep') {
        const sleepCycle = Math.floor((t - p2.sleepStart) / 0.5) % 4;
        frameSpec = `fat-${7 + sleepCycle}`;
      } else if (p2.state === 'wake_up') {
        frameSpec = 'fat-11';
      } else {
        frameSpec = 'normal-0';
      }
      
      const isFat = frameSpec.startsWith('fat-');
      const idx = parseInt(frameSpec.split('-')[1]);
      const spriteTranslateX = -(idx * 20);
      const spriteTranslateY = isFat ? -22 : 0;
      
      doremonSpriteKeyframes += `  ${pct}% { transform: translate(${spriteTranslateX}px, ${spriteTranslateY}px); }\n`;
      
      t += sampleStep;
    }
  }

  // Final 100% state
  const lastPoint = timeline[timeline.length - 1];
  doremonMoveKeyframes += `  100% { transform: translate(${lastPoint.x}px, ${lastPoint.y}px); }\n}`;

  let finalFrameSpec = 'normal-0';
  if (lastPoint.state === 'wake_up') {
    finalFrameSpec = 'fat-11';
  }
  const isFat = finalFrameSpec.startsWith('fat-');
  const idx = parseInt(finalFrameSpec.split('-')[1]);
  doremonSpriteKeyframes += `  100% { transform: translate(${-(idx * 20)}px, ${isFat ? -22 : 0}px); }\n}`;

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
  <defs>
    <!-- Single instances of high-res sprite sheets to prevent redundant base64 replication -->
    <image id="doremon-spritesheet" href="data:image/png;base64,${doremonBase64}" width="1024" height="835"/>
    <image id="cake-spritesheet" href="data:image/png;base64,${dorayakiBase64}" width="1024" height="1024"/>
    <image id="fatdoremon-spritesheet" href="data:image/png;base64,${fatdoremonBase64}" width="1536" height="1024"/>

    <!-- Gradient for beautiful header title -->
    <linearGradient id="title-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      ${isDark ? `
      <stop offset="0%" stop-color="#89b4fa" />
      <stop offset="50%" stop-color="#cba6f7" />
      <stop offset="100%" stop-color="#f9e2af" />
      ` : `
      <stop offset="0%" stop-color="#0366d6" />
      <stop offset="50%" stop-color="#6f42c1" />
      <stop offset="100%" stop-color="#d73a49" />
      `}
    </linearGradient>

    <!-- Sprite definitions cropped via viewboxes referencing the single images above -->
    <!-- Doraemon Sprite frames (20x22 SVG canvas) -->
    <!-- Row 0 (doremon.png) -->
    <g id="doremon-frame-0"><svg width="20" height="22" viewBox="0 0 256 278" overflow="hidden"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-1"><svg width="20" height="22" viewBox="256 0 256 278" overflow="hidden"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-2"><svg width="20" height="22" viewBox="512 0 256 278" overflow="hidden"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-3"><svg width="20" height="22" viewBox="768 0 256 278" overflow="hidden"><use href="#doremon-spritesheet"/></svg></g>
    <!-- Row 1 (doremon.png) -->
    <g id="doremon-frame-4"><svg width="20" height="22" viewBox="0 278 256 278" overflow="hidden"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-5"><svg width="20" height="22" viewBox="256 278 256 278" overflow="hidden"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-6"><svg width="20" height="22" viewBox="512 278 256 278" overflow="hidden"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-7"><svg width="20" height="22" viewBox="768 278 256 278" overflow="hidden"><use href="#doremon-spritesheet"/></svg></g>
    <!-- Row 2 (doremon.png) -->
    <g id="doremon-frame-8"><svg width="20" height="22" viewBox="0 556 256 278" overflow="hidden"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-9"><svg width="20" height="22" viewBox="256 556 256 278" overflow="hidden"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-10"><svg width="20" height="22" viewBox="512 556 256 278" overflow="hidden"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-11"><svg width="20" height="22" viewBox="768 556 256 278" overflow="hidden"><use href="#doremon-spritesheet"/></svg></g>

    <!-- Fat Doraemon Sprite frames (20x22 SVG canvas) -->
    <!-- Row 0 (fatdoremon.png) -->
    <g id="fatdoremon-frame-0"><svg width="20" height="22" viewBox="0 0 384 341.33" overflow="hidden"><use href="#fatdoremon-spritesheet"/></svg></g>
    <g id="fatdoremon-frame-1"><svg width="20" height="22" viewBox="384 0 384 341.33" overflow="hidden"><use href="#fatdoremon-spritesheet"/></svg></g>
    <g id="fatdoremon-frame-2"><svg width="20" height="22" viewBox="768 0 384 341.33" overflow="hidden"><use href="#fatdoremon-spritesheet"/></svg></g>
    <g id="fatdoremon-frame-3"><svg width="20" height="22" viewBox="1152 0 384 341.33" overflow="hidden"><use href="#fatdoremon-spritesheet"/></svg></g>
    <!-- Row 1 (fatdoremon.png) -->
    <g id="fatdoremon-frame-4"><svg width="20" height="22" viewBox="0 341.33 384 341.33" overflow="hidden"><use href="#fatdoremon-spritesheet"/></svg></g>
    <g id="fatdoremon-frame-5"><svg width="20" height="22" viewBox="384 341.33 384 341.33" overflow="hidden"><use href="#fatdoremon-spritesheet"/></svg></g>
    <g id="fatdoremon-frame-6"><svg width="20" height="22" viewBox="768 341.33 384 341.33" overflow="hidden"><use href="#fatdoremon-spritesheet"/></svg></g>
    <g id="fatdoremon-frame-7"><svg width="20" height="22" viewBox="1152 341.33 384 341.33" overflow="hidden"><use href="#fatdoremon-spritesheet"/></svg></g>
    <!-- Row 2 (fatdoremon.png) -->
    <g id="fatdoremon-frame-8"><svg width="20" height="22" viewBox="0 682.66 384 341.33" overflow="hidden"><use href="#fatdoremon-spritesheet"/></svg></g>
    <g id="fatdoremon-frame-9"><svg width="20" height="22" viewBox="384 682.66 384 341.33" overflow="hidden"><use href="#fatdoremon-spritesheet"/></svg></g>
    <g id="fatdoremon-frame-10"><svg width="20" height="22" viewBox="768 682.66 384 341.33" overflow="hidden"><use href="#fatdoremon-spritesheet"/></svg></g>
    <g id="fatdoremon-frame-11"><svg width="20" height="22" viewBox="1152 682.66 384 341.33" overflow="hidden"><use href="#fatdoremon-spritesheet"/></svg></g>

    <!-- Donut Sprite frames (12x12 SVG canvas) -->
    <!-- Row 0 (Full) -->
    <g id="donut-frame-0"><svg width="12" height="12" viewBox="0 0 256 256" overflow="hidden"><use href="#cake-spritesheet"/></svg></g>
    <g id="donut-frame-1"><svg width="12" height="12" viewBox="256 0 256 256" overflow="hidden"><use href="#cake-spritesheet"/></svg></g>
    <g id="donut-frame-2"><svg width="12" height="12" viewBox="512 0 256 256" overflow="hidden"><use href="#cake-spritesheet"/></svg></g>
    <g id="donut-frame-3"><svg width="12" height="12" viewBox="768 0 256 256" overflow="hidden"><use href="#cake-spritesheet"/></svg></g>
    <!-- Row 2 (Bites) -->
    <g id="donut-frame-8"><svg width="12" height="12" viewBox="0 512 256 256" overflow="hidden"><use href="#cake-spritesheet"/></svg></g>
    <g id="donut-frame-9"><svg width="12" height="12" viewBox="256 512 256 256" overflow="hidden"><use href="#cake-spritesheet"/></svg></g>
    <g id="donut-frame-10"><svg width="12" height="12" viewBox="512 512 256 256" overflow="hidden"><use href="#cake-spritesheet"/></svg></g>
    <g id="donut-frame-11"><svg width="12" height="12" viewBox="768 512 256 256" overflow="hidden"><use href="#cake-spritesheet"/></svg></g>
    <!-- Row 3 (Crumbs) -->
    <g id="donut-frame-12"><svg width="12" height="12" viewBox="0 768 256 256" overflow="hidden"><use href="#cake-spritesheet"/></svg></g>
    <g id="donut-frame-13"><svg width="12" height="12" viewBox="256 768 256 256" overflow="hidden"><use href="#cake-spritesheet"/></svg></g>
    <g id="donut-frame-14"><svg width="12" height="12" viewBox="512 768 256 256" overflow="hidden"><use href="#cake-spritesheet"/></svg></g>
    <g id="donut-frame-15"><svg width="12" height="12" viewBox="768 768 256 256" overflow="hidden"><use href="#cake-spritesheet"/></svg></g>
  </defs>

  <style>
    .background {
      fill: ${theme.bg};
      rx: 16px;
    }
    .text-title {
      font-family: 'JetBrains Mono', monospace, 'Courier New', Courier;
      font-weight: 800;
      font-size: 18px;
      fill: url(#title-grad);
      filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.15));
      animation: pulse-glow 3s ease-in-out infinite alternate;
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
    
    /* Title Glow Animation */
    @keyframes pulse-glow {
      0% { filter: drop-shadow(0 0 1px ${isDark ? 'rgba(137, 180, 250, 0.2)' : 'rgba(3, 102, 214, 0.2)'}); }
      100% { filter: drop-shadow(0 0 8px ${isDark ? 'rgba(203, 166, 247, 0.6)' : 'rgba(111, 66, 193, 0.6)'}); }
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
    @keyframes star-twinkle-1 {
      0%, 100% { opacity: 0.2; transform: scale(0.8) rotate(0deg); }
      50% { opacity: 1; transform: scale(1.3) rotate(90deg); }
    }
    @keyframes star-twinkle-2 {
      0%, 100% { opacity: 1; transform: scale(1.2) rotate(45deg); }
      50% { opacity: 0.3; transform: scale(0.7) rotate(135deg); }
    }
    .twinkle-star-1 {
      animation: star-twinkle-1 3s infinite ease-in-out;
      transform-origin: center;
    }
    .twinkle-star-2 {
      animation: star-twinkle-2 2.5s infinite ease-in-out;
      transform-origin: center;
    }
    
    svg {
      overflow: hidden;
    }
    image {
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }
  </style>

  <!-- Background -->
  <rect class="background" width="100%" height="100%" />

  <!-- Twinkling Sparkles / Retro Stars in Title Area -->
  <!-- Star 1 -->
  <g class="twinkle-star-1" transform="translate(195, 26)">
    <path d="M 0,-5 L 1,-1 L 5,0 L 1,1 L 0,5 L -1,1 L -5,0 L -1,-1 Z" fill="#f9e2af" />
  </g>
  <!-- Star 2 -->
  <g class="twinkle-star-2" transform="translate(25, 24)">
    <path d="M 0,-4 L 1,-1 L 4,0 L 1,1 L 0,4 L -1,1 L -4,0 L -1,-1 Z" fill="#a6e3a1" />
  </g>

  <!-- Titles -->
  <text class="text-title" x="40" y="32">✨ Contributions ✨</text>
  <text class="text-subtitle" x="40" y="47">Total contributions: ${totalCommits} commits in the last 365 days</text>

  <!-- Contribution Grid Section -->
  <g class="grid-container">
    <!-- Base grid cells -->
    ${gridCells}

    <!-- Overlay Donuts (Dorayakis) -->
    ${gridDonuts}

    <!-- Doraemon Pixel Mascot character -->
    <g class="doremon-mascot">
      <svg width="20" height="22" viewBox="0 0 20 22" style="overflow: hidden;" overflow="hidden">
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

// Helper to parse date strings (YYYY-MM-DD) consistently in local timezone
function parseLocalDate(dateStr) {
  const parts = dateStr.split('-');
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

// Helper to format date ranges cleanly
function formatRange(startStr, endStr) {
  if (!startStr || !endStr) return "No contributions";
  const startParts = startStr.split('-');
  const endParts = endStr.split('-');
  if (startParts.length !== 3 || endParts.length !== 3) return `${startStr} - ${endStr}`;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const startMonth = months[parseInt(startParts[1], 10) - 1];
  const startDay = parseInt(startParts[2], 10);
  const startYear = startParts[0];

  const endMonth = months[parseInt(endParts[1], 10) - 1];
  const endDay = parseInt(endParts[2], 10);
  const endYear = endParts[0];

  if (startYear !== endYear) {
    return `${startMonth} ${startDay}, ${startYear} - ${endMonth} ${endDay}, ${endYear}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

// Calculate GitHub contribution streak statistics
function calculateStreakStats(weeks) {
  const days = [];
  weeks.forEach(w => {
    if (w.contributionDays) {
      days.push(...w.contributionDays);
    }
  });

  // Sort chronologically (oldest to newest)
  days.sort((a, b) => a.date.localeCompare(b.date));

  // Filter out future days
  const now = new Date();
  const utc7Time = new Date(now.getTime() + (7 * 60 * 60 * 1000));
  const todayStr = utc7Time.toISOString().split('T')[0];

  const pastAndTodayDays = days.filter(d => d.date <= todayStr);

  // Total contributions
  let totalContributions = 0;
  pastAndTodayDays.forEach(d => {
    totalContributions += d.contributionCount;
  });

  // Calculate current streak
  let currentStreak = 0;
  let currentStreakStart = "";
  let currentStreakEnd = "";

  const todayDateObj = parseLocalDate(todayStr);
  let startIdx = -1;

  // Walk backwards to find the latest day with contributions
  for (let i = pastAndTodayDays.length - 1; i >= 0; i--) {
    const d = pastAndTodayDays[i];
    if (d.contributionCount > 0) {
      const dDateObj = parseLocalDate(d.date);
      const diffTime = todayDateObj - dDateObj;
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      
      // If the last active day is today (diff <= 0.5) or yesterday (diff <= 1.5), streak is active
      if (diffDays <= 1.5) {
        startIdx = i;
      }
      break;
    }
  }

  if (startIdx !== -1) {
    currentStreakEnd = pastAndTodayDays[startIdx].date;
    let i = startIdx;
    while (i >= 0 && pastAndTodayDays[i].contributionCount > 0) {
      currentStreak++;
      currentStreakStart = pastAndTodayDays[i].date;
      i--;
    }
  }

  // Calculate longest streak
  let longestStreak = 0;
  let longestStreakStart = "";
  let longestStreakEnd = "";

  let tempStreak = 0;
  let tempStart = "";

  for (let i = 0; i < pastAndTodayDays.length; i++) {
    const d = pastAndTodayDays[i];
    if (d.contributionCount > 0) {
      if (tempStreak === 0) {
        tempStart = d.date;
      }
      tempStreak++;
    } else {
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
        longestStreakStart = tempStart;
        longestStreakEnd = pastAndTodayDays[i - 1].date;
      }
      tempStreak = 0;
    }
  }

  if (tempStreak > longestStreak) {
    longestStreak = tempStreak;
    longestStreakStart = tempStart;
    longestStreakEnd = pastAndTodayDays[pastAndTodayDays.length - 1].date;
  }

  return {
    totalContributions,
    currentStreak,
    currentStreakStart,
    currentStreakEnd,
    longestStreak,
    longestStreakStart,
    longestStreakEnd
  };
}

// Generate the animated Streak SVG
function generateStreakSVG(stats, isDark) {
  const theme = isDark ? {
    bg: '#1e1e2e',
    textMain: '#cdd6f4',
    textLabel: '#89b4fa',
    textDate: '#a6adc8',
    chartColor: '#89b4fa',
    flameColor: '#f38ba8',
    trophyColor: '#f9e2af',
    border: '#313244',
    glowOpacity: 0.1
  } : {
    bg: '#ffffff',
    textMain: '#24292e',
    textLabel: '#0366d6',
    textDate: '#586069',
    chartColor: '#0366d6',
    flameColor: '#d73a49',
    trophyColor: '#d18000',
    border: '#e1e4e6',
    glowOpacity: 0.05
  };

  const formattedCurrentRange = formatRange(stats.currentStreakStart, stats.currentStreakEnd);
  const formattedLongestRange = formatRange(stats.longestStreakStart, stats.longestStreakEnd);

  return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 495 195" width="495" height="195">
  <defs>
    <radialGradient id="current-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${theme.flameColor}" stop-opacity="${theme.glowOpacity}" />
      <stop offset="100%" stop-color="${theme.bg}" stop-opacity="0" />
    </radialGradient>
  </defs>

  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Outfit:wght@600;800&display=swap');
    
    .background {
      fill: ${theme.bg};
      rx: 10px;
    }
    .stat-label {
      font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-weight: 600;
      font-size: 12px;
      fill: ${theme.textLabel};
      letter-spacing: 0.5px;
    }
    .stat-value {
      font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-weight: 800;
      font-size: 30px;
      fill: ${theme.textMain};
    }
    .stat-date {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-weight: 400;
      font-size: 11px;
      fill: ${theme.textDate};
    }
    .divider {
      stroke: ${theme.border};
      stroke-width: 1px;
      opacity: 0.8;
    }
    
    @keyframes fire-glow {
      0%, 100% { filter: drop-shadow(0 0 2px ${theme.flameColor}66); transform: scale(1); }
      50% { filter: drop-shadow(0 0 6px ${theme.flameColor}aa); transform: scale(1.08); }
    }
    .fire-icon {
      animation: fire-glow 2s infinite ease-in-out;
      transform-origin: 12px 12px;
    }
  </style>

  <!-- Background -->
  <rect class="background" width="100%" height="100%" />

  <!-- Radial Glow behind Current Streak -->
  <rect x="166" y="10" width="163" height="175" fill="url(#current-glow)" rx="8" />

  <!-- Divider Lines -->
  <line class="divider" x1="165" y1="30" x2="165" y2="165" />
  <line class="divider" x1="330" y1="30" x2="330" y2="165" />

  <!-- COLUMN 1: Total Contributions -->
  <g transform="translate(70.5, 35)" stroke="${theme.chartColor}">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  </g>
  <text x="82.5" y="82" class="stat-label" text-anchor="middle">TOTAL CONTRIBUTIONS</text>
  <text x="82.5" y="125" class="stat-value" text-anchor="middle">${stats.totalContributions}</text>
  <text x="82.5" y="155" class="stat-date" text-anchor="middle">Last 365 Days</text>

  <!-- COLUMN 2: Current Streak -->
  <g class="fire-icon" transform="translate(235.5, 35)" stroke="${theme.flameColor}">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  </g>
  <text x="247.5" y="82" class="stat-label" text-anchor="middle">CURRENT STREAK</text>
  <text x="247.5" y="125" class="stat-value" text-anchor="middle" fill="${theme.flameColor}">${stats.currentStreak}</text>
  <text x="247.5" y="155" class="stat-date" text-anchor="middle">${formattedCurrentRange}</text>

  <!-- COLUMN 3: Longest Streak -->
  <g transform="translate(400.5, 35)" stroke="${theme.trophyColor}">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34" />
      <path d="M12 2a6 6 0 0 1 6 6v5a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z" />
    </svg>
  </g>
  <text x="412.5" y="82" class="stat-label" text-anchor="middle">LONGEST STREAK</text>
  <text x="412.5" y="125" class="stat-value" text-anchor="middle">${stats.longestStreak}</text>
  <text x="412.5" y="155" class="stat-date" text-anchor="middle">${formattedLongestRange}</text>
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
  const token = process.env.GITHUB_TOKEN || process.argv[2];
  const repo = process.env.GITHUB_REPOSITORY || "TruongTXK18FPT/TruongTXK18FPT";
  const owner = repo.split('/')[0];

  console.log(`Starting unified Doraemon contribution generator for owner: ${owner}...`);

  const { weeks, total } = await fetchContributions(owner, token);

  const distDir = path.join(__dirname, '../dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // 1. Generate Doraemon contribution SVGs
  const lightSVG = generateSVG(weeks, total, false);
  const darkSVG = generateSVG(weeks, total, true);

  fs.writeFileSync(path.join(distDir, 'github-doraemon-contribution.svg'), lightSVG);
  fs.writeFileSync(path.join(distDir, 'github-doraemon-contribution-dark.svg'), darkSVG);
  console.log(`Successfully generated Doraemon contribution SVGs`);

  // 2. Calculate and generate GitHub streak stats cards
  const streakStats = calculateStreakStats(weeks);
  console.log("Calculated Streak Stats:", streakStats);

  const streakLightSVG = generateStreakSVG(streakStats, false);
  const streakDarkSVG = generateStreakSVG(streakStats, true);

  fs.writeFileSync(path.join(distDir, 'github-streak-stats.svg'), streakLightSVG);
  fs.writeFileSync(path.join(distDir, 'github-streak-stats-dark.svg'), streakDarkSVG);
  console.log(`Successfully generated streak stats SVGs`);

  // Update the README
  updateReadme(total);
}

main().catch(console.error);
