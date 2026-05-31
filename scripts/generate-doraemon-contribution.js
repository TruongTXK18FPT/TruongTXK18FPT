const fs = require('fs');
const path = require('path');
const https = require('https');

// Paths
const doremonPath = path.join(__dirname, '../assets/doremon.png');
const cakePath = path.join(__dirname, '../assets/cake.png');

// Read and Base64 encode the sprite sheets
const doremonBase64 = fs.readFileSync(doremonPath).toString('base64');
const cakeBase64 = fs.readFileSync(cakePath).toString('base64');

// Fallback Mock Contribution Data in case API is unavailable
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
      // Create some nice patterns and commit density
      let count = 0;
      let level = 0;
      
      const rand = Math.random();
      if (rand > 0.65) {
        count = Math.floor(Math.random() * 10) + 1;
        if (count < 3) level = 1;
        else if (count < 6) level = 2;
        else if (count < 9) level = 3;
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
  return weeks;
}

// Fetch contribution data from GitHub GraphQL API
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
          const weeks = json.data.user.contributionsCollection.contributionCalendar.weeks;
          resolve(weeks);
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

// Generate the customized SVG
function generateSVG(weeks, isDark) {
  // Theme styling configurations
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

  // Extract all cells with contributions > 0
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

  // Select target cells to hunt.
  // To keep the SVG animation size optimized and look highly engaging,
  // we select the 12 most recent active cells.
  let targets = [];
  if (activeCells.length >= 5) {
    // Sort by date descending and grab recent 12, then sort them chronologically/spatially for a smooth path
    const sorted = [...activeCells]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 12);
    // Sort by week and day so Doraemon has a natural spatial route
    targets = sorted.sort((a, b) => (a.w !== b.w) ? a.w - b.w : a.d - b.d);
  } else {
    // Default mock path in case there are too few commits
    targets = [
      { w: 5, d: 2, level: 3 }, { w: 10, d: 5, level: 4 }, { w: 15, d: 1, level: 2 },
      { w: 22, d: 4, level: 3 }, { w: 30, d: 0, level: 4 }, { w: 38, d: 6, level: 2 },
      { w: 45, d: 3, level: 3 }, { w: 50, d: 1, level: 4 }
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

  const totalDuration = currentTime;

  // Generate CSS Keyframes for Doraemon's Movement
  let doremonMoveKeyframes = `@keyframes doremon-move {\n`;
  let doremonSpriteKeyframes = `@keyframes doremon-sprite {\n`;

  timeline.forEach((point) => {
    const pct = ((point.time / totalDuration) * 100).toFixed(2);
    
    // Position keyframe
    doremonMoveKeyframes += `  ${pct}% { transform: translate(${point.x}px, ${point.y}px); }\n`;

    // Sprite Selection keyframe (step-end)
    let frameIdx = 0;
    if (point.state === 'walk') {
      // Toggle walk frames 1 and 2 every 0.15s
      const walkCycle = Math.floor(point.time / 0.15) % 2;
      frameIdx = walkCycle === 0 ? 1 : 2;
    } else if (point.state === 'eat') {
      frameIdx = 3; // Eat (open mouth)
    } else if (point.state === 'chew') {
      // Cycle chew frames 8, 9, 10, 11
      const chewCycle = Math.floor((point.time - point.eatStart) / 0.175) % 4;
      frameIdx = 8 + chewCycle;
    } else {
      frameIdx = 0; // Idle
    }
    
    const spriteTranslateX = -(frameIdx * 20);
    doremonSpriteKeyframes += `  ${pct}% { transform: translate(${spriteTranslateX}px, 0); }\n`;
  });
  doremonMoveKeyframes += `}`;
  doremonSpriteKeyframes += `}`;

  // Generate CSS keyframes for each target Dorayaki (donut)
  let targetDonutCSS = '';
  targets.forEach((cell, idx) => {
    // Find when this target is eaten.
    // The target is eaten when Doraemon arrives at this index.
    const eatEvent = timeline.find(p => p.targetIdx === idx && (p.state === 'eat' || p.state === 'chew'));
    
    if (eatEvent && eatEvent.eatStart !== undefined) {
      const eatStart = eatEvent.eatStart;
      const eatEnd = eatStart + 0.3;
      
      const eatStartPct = (eatStart / totalDuration) * 100;
      const eatEndPct = (eatEnd / totalDuration) * 100;

      let keyframes = `@keyframes donut-sprite-${idx} {\n`;
      
      // Idle state: cycle full donut frames (0, 1, 2, 3)
      // We sample points from 0 to eatStart every 1s
      let t = 0;
      while (t < eatStart) {
        const pct = ((t / totalDuration) * 100).toFixed(2);
        const frame = Math.floor(t / 0.25) % 4;
        keyframes += `  ${pct}% { transform: translate(-${frame * 12}px, 0); }\n`;
        t += 0.5;
      }
      
      // Right before eating starts
      keyframes += `  ${(eatStartPct - 0.01).toFixed(2)}% { transform: translate(-${(Math.floor(eatStart / 0.25) % 4) * 12}px, 0); }\n`;
      
      // Eating frames (8, 9, 10, 11, 12, 13, 14, 15)
      const eatStep = 0.3 / 8;
      for (let f = 0; f < 8; f++) {
        const timeOffset = eatStart + f * eatStep;
        const pct = ((timeOffset / totalDuration) * 100).toFixed(2);
        const frameIdx = f < 4 ? (8 + f) : (12 + (f - 4));
        keyframes += `  ${pct}% { transform: translate(-${frameIdx * 12}px, 0); }\n`;
      }
      
      // Fully eaten (invisible frame at index 12 in our donut sprite layout, translating -144px)
      keyframes += `  ${eatEndPct.toFixed(2)}% { transform: translate(-144px, 0); }\n`;
      keyframes += `  99.99% { transform: translate(-144px, 0); }\n`;
      keyframes += `  100% { transform: translate(0, 0); }\n`;
      keyframes += `}\n`;

      targetDonutCSS += keyframes;
      targetDonutCSS += `.donut-target-${idx} { animation: donut-sprite-${idx} ${totalDuration}s step-end infinite; }\n`;
    }
  });

  // Sparkles/Stars animation CSS
  let starCSS = `
  @keyframes sparkle-glow {
    0%, 100% { opacity: 0; transform: scale(0); }
    50% { opacity: 1; transform: scale(1.2); }
  }
  .sparkle-star {
    transform-origin: center;
  }
  `;

  // Draw the contribution grid cells
  let gridCells = '';
  weeks.forEach((week, w) => {
    week.contributionDays.forEach((day) => {
      const x = 2 + w * 12;
      const y = 2 + day.weekday * 12;
      
      // Determine background color of the cell
      let cellColor = theme.gridEmpty;
      if (day.contributionCount > 0) {
        // If it's a target, we draw it empty underneath since there is a donut on top of it.
        // Otherwise, it gets a beautiful soft color corresponding to commit level
        if (day.level === 1) cellColor = isDark ? '#262930' : '#f5e0dc';
        else if (day.level === 2) cellColor = isDark ? '#2a354f' : '#f5c2e7';
        else if (day.level === 3) cellColor = isDark ? '#31416b' : '#cba6f7';
        else cellColor = isDark ? '#394d87' : '#89b4fa';
      }
      
      gridCells += `<rect x="${x}" y="${y}" width="10" height="10" rx="2" fill="${cellColor}" />\n`;
    });
  });

  // Draw the Donuts (Dorayakis) on active cells
  let gridDonuts = '';
  activeCells.forEach((cell) => {
    const x = 2 + cell.w * 12 - 1;
    const y = 2 + cell.d * 12 - 1;
    
    // Check if this cell is one of our animated targets
    const targetIdx = targets.findIndex(t => t.w === cell.w && t.d === cell.d);
    
    if (targetIdx !== -1) {
      // Dynamic animated donut
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
      // Static/breathing general donut
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

  // Calculate grid dimensions
  const gridWidth = 53 * 12 + 2;
  const gridHeight = 7 * 12 + 2;

  // Final SVG Construction
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
    
    /* Doraemon Movement & Sprite Animations */
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
    <!-- Single instances of high-res sprite sheet images to prevent redundant base64 replication -->
    <image id="doremon-spritesheet" href="data:image/png;base64,${doremonBase64}" width="1024" height="835"/>
    <image id="cake-spritesheet" href="data:image/png;base64,${cakeBase64}" width="1254" height="1254"/>

    <!-- Sprite definitions cropped via viewboxes referencing the single images above -->
    <!-- Doraemon Sprite frames (20x22 SVG canvas) -->
    <!-- Row 0 -->
    <g id="doremon-frame-0"><svg width="20" height="22" viewBox="0 0 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-1"><svg width="20" height="22" viewBox="256 0 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-2"><svg width="20" height="22" viewBox="512 0 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-3"><svg width="20" height="22" viewBox="768 0 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <!-- Row 1 -->
    <g id="doremon-frame-4"><svg width="20" height="22" viewBox="0 278 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-5"><svg width="20" height="22" viewBox="256 278 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-6"><svg width="20" height="22" viewBox="512 278 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-7"><svg width="20" height="22" viewBox="768 278 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <!-- Row 2 -->
    <g id="doremon-frame-8"><svg width="20" height="22" viewBox="0 556 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-9"><svg width="20" height="22" viewBox="256 556 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-10"><svg width="20" height="22" viewBox="512 556 256 278"><use href="#doremon-spritesheet"/></svg></g>
    <g id="doremon-frame-11"><svg width="20" height="22" viewBox="768 556 256 278"><use href="#doremon-spritesheet"/></svg></g>

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
  <text class="text-title" x="30" y="32">✦ Doraemon's Contribution Journey ✦</text>
  <text class="text-subtitle" x="30" y="47">Doraemon is eating actual code contributions (Dorayakis) one-by-one!</text>

  <!-- Contribution Grid Section -->
  <g class="grid-container">
    <!-- Base grid cells -->
    ${gridCells}

    <!-- Overlay Donuts (Dorayakis) -->
    ${gridDonuts}

    <!-- Doraemon Pixel Mascot character -->
    <g class="doremon-mascot">
      <svg width="20" height="22" viewBox="0 0 20 22" style="overflow: hidden;">
        <g class="doremon-sprite-sheet">
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
      </svg>
    </g>
  </g>
</svg>
`;
}

// Main Execution
async function main() {
  const token = process.env.GITHUB_TOKEN;
  // Get owner from env or default to TruongTXK18FPT
  const repo = process.env.GITHUB_REPOSITORY || "TruongTXK18FPT/TruongTXK18FPT";
  const owner = repo.split('/')[0];

  console.log(`Starting custom Doraemon contribution generator for owner: ${owner}...`);

  const weeks = await fetchContributions(owner, token);

  const lightSVG = generateSVG(weeks, false);
  const darkSVG = generateSVG(weeks, true);

  const distDir = path.join(__dirname, '../dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  fs.writeFileSync(path.join(distDir, 'github-doraemon-contribution.svg'), lightSVG);
  console.log("Successfully generated: dist/github-doraemon-contribution.svg");

  fs.writeFileSync(path.join(distDir, 'github-doraemon-contribution-dark.svg'), darkSVG);
  console.log("Successfully generated: dist/github-doraemon-contribution-dark.svg");
}

main().catch(console.error);
