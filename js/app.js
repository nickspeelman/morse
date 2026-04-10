/********************************************************************
 * CONFIG
 * Hardcoded for now, but intentionally isolated so later these can
 * come from an admin panel or backend settings.
 ********************************************************************/
const APP_CONFIG = {
  targetPhrase: "HELLO WORLD",
  timing: {
    minPressDurationMs: 30,  // debounce
    dotMaxMs: 240,           // <= this is a dot
    dashMaxMs: 600,          // > dotMaxMs and <= dashMaxMs is a dash
    letterGapMs: 450,        // silence >= this finalizes a current Morse letter
    wordGapMs: 900,          // silence >= this finalizes a space
    errorFlashMs: 800
  },
  teams: [
    { id: "A", key: "a", label: "Team A", active: true },
    { id: "S", key: "s", label: "Team S", active: true },
    { id: "D", key: "d", label: "Team D", active: true },
    { id: "F", key: "f", label: "Team F", active: true },
    { id: "J", key: "j", label: "Team J", active: true },
    { id: "K", key: "k", label: "Team K", active: true },
    { id: "L", key: "l", label: "Team L", active: true },
    { id: "SEMICOLON", key: ";", label: "Team ;", active: true },
    { id: "G", key: "g", label: "Team G", active: true },
    { id: "H", key: "h", label: "Team H", active: true }
  ]
};

/********************************************************************
 * MORSE TABLES
 ********************************************************************/
const MORSE_MAP = {
  ".-": "A",
  "-...": "B",
  "-.-.": "C",
  "-..": "D",
  ".": "E",
  "..-.": "F",
  "--.": "G",
  "....": "H",
  "..": "I",
  ".---": "J",
  "-.-": "K",
  ".-..": "L",
  "--": "M",
  "-.": "N",
  "---": "O",
  ".--.": "P",
  "--.-": "Q",
  ".-.": "R",
  "...": "S",
  "-": "T",
  "..-": "U",
  "...-": "V",
  ".--": "W",
  "-..-": "X",
  "-.--": "Y",
  "--..": "Z",
  "-----": "0",
  ".----": "1",
  "..---": "2",
  "...--": "3",
  "....-": "4",
  ".....": "5",
  "-....": "6",
  "--...": "7",
  "---..": "8",
  "----.": "9"
};

/********************************************************************
 * TEAM STATE MANAGEMENT
 * Each team is a completely independent interpreter.
 ********************************************************************/
function createInitialTeamState(teamConfig) {
  return {
    id: teamConfig.id,
    key: teamConfig.key,
    label: teamConfig.label,
    active: teamConfig.active,

    isPressed: false,
    pressStartTime: null,
    lastReleaseTime: null,

    currentSymbolBuffer: "",
    decodedText: "",
    currentTargetIndex: 0,

    status: "idle", // idle | active | error | complete
    errorMessage: "",

    lastInterpretedSymbol: "",
    pendingGapHandled: false
  };
}

const teams = APP_CONFIG.teams
  .filter(team => team.active)
  .map(createInitialTeamState);

const teamMapByKey = new Map(
  teams.map(team => [team.key.toLowerCase(), team])
);

/********************************************************************
 * DOM REFERENCES
 ********************************************************************/
const teamsContainer = document.getElementById("teamsContainer");
const targetPhraseDisplay = document.getElementById("targetPhraseDisplay");
const timingSummary = document.getElementById("timingSummary");
const globalResetBtn = document.getElementById("globalResetBtn");

/********************************************************************
 * RENDERING
 ********************************************************************/
function renderApp() {
  targetPhraseDisplay.textContent = APP_CONFIG.targetPhrase;
  timingSummary.textContent =
    `dot≤${APP_CONFIG.timing.dotMaxMs}ms | dash≤${APP_CONFIG.timing.dashMaxMs}ms | ` +
    `letter gap≥${APP_CONFIG.timing.letterGapMs}ms | word gap≥${APP_CONFIG.timing.wordGapMs}ms`;

  teamsContainer.innerHTML = teams.map(renderTeamCard).join("");

  teams.forEach(team => {
    const btn = document.getElementById(`reset-${team.id}`);
    if (btn) {
      btn.addEventListener("click", () => {
        resetTeam(team);
      });
    }
  });
}

function renderTeamCard(team) {
  const cardClasses = [
    "team-card",
    team.isPressed ? "pressed" : "",
    team.status === "error" ? "error" : "",
    team.status === "complete" ? "complete" : ""
  ].join(" ").trim();

  const statusClass = `status-${team.status}`;
  const orbClass = team.isPressed ? "signal-orb pressed" : "signal-orb";
  const comparisonHtml = buildComparisonHtml(team);

  return `
    <div class="${cardClasses}">
      <div class="team-header">
        <div>
          <div class="team-title">
            ${escapeHtml(team.label)} <span class="kbd">${escapeHtml(team.key.toUpperCase())}</span>
          </div>
        </div>
        <div class="topbar-right">
          <span class="status-pill ${statusClass}">${escapeHtml(team.status)}</span>
          <button id="reset-${team.id}">Reset</button>
        </div>
      </div>

      <div class="signal-wrap">
        <div class="${orbClass}" aria-hidden="true"></div>
      </div>

      <div class="field-grid">
        <div class="field-label">Buffer</div>
        <div class="mono buffer">${escapeHtml(team.currentSymbolBuffer || "—")}</div>

        <div class="field-label">Decoded</div>
        <div class="mono">${escapeHtml(team.decodedText || "—")}</div>

        <div class="field-label">Last</div>
        <div class="mono">${escapeHtml(team.lastInterpretedSymbol || "—")}</div>

        <div class="field-label">Progress</div>
        <div>${team.currentTargetIndex} / ${APP_CONFIG.targetPhrase.length}</div>
      </div>

      <div class="target-row">
        <div class="field-label">Target progress</div>
        <div class="comparison">${comparisonHtml}</div>
        <div class="error-text">${escapeHtml(team.errorMessage)}</div>
      </div>
    </div>
  `;
}


function buildComparisonHtml(team) {
  const target = APP_CONFIG.targetPhrase;
  const logicalIndex = team.currentTargetIndex;

  let html = "";

  for (let i = 0; i < target.length; i += 1) {
    const char = target[i];

    // Already completed
    if (i < logicalIndex) {
      if (char === " ") {
        html += `<span class="done space-done">·</span>`;
      } else {
        html += `<span class="done">${escapeHtml(char)}</span>`;
      }
      continue;
    }

    // Current actual logical cursor
    if (i === logicalIndex) {
      if (char === " ") {
        html += `<span class="next space-pending">·</span>`;
      } else {
        html += `<span class="next">${escapeHtml(char)}</span>`;
      }
      continue;
    }

    // Remaining characters
    if (char === " ") {
      html += `<span class="remaining space-remaining">·</span>`;
    } else {
      html += `<span class="remaining">${escapeHtml(char)}</span>`;
    }
  }

  return html;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/********************************************************************
 * RESET LOGIC
 ********************************************************************/
function resetTeam(team) {
  team.isPressed = false;
  team.pressStartTime = null;
  team.lastReleaseTime = null;
  team.currentSymbolBuffer = "";
  team.decodedText = "";
  team.currentTargetIndex = 0;
  team.status = "idle";
  team.errorMessage = "";
  team.lastInterpretedSymbol = "";
  team.pendingGapHandled = false;
  renderApp();
}

function resetAllTeams() {
  teams.forEach(resetTeam);
}

/********************************************************************
 * MORSE DECODING + VALIDATION
 ********************************************************************/

/**
 * Called when a press ends. Converts press duration into dot/dash and
 * appends it to the team's current symbol buffer.
 */
function handlePressEnd(team, pressDurationMs) {
  const {
    minPressDurationMs,
    dotMaxMs,
    dashMaxMs
  } = APP_CONFIG.timing;

  if (pressDurationMs < minPressDurationMs) {
    return;
  }

  let symbol = null;

  if (pressDurationMs <= dotMaxMs) {
    symbol = ".";
  } else if (pressDurationMs <= dashMaxMs) {
    symbol = "-";
  } else {
    triggerTeamError(team, `Press too long (${Math.round(pressDurationMs)}ms)`);
    return;
  }

  team.currentSymbolBuffer += symbol;
  team.lastInterpretedSymbol = symbol;
  team.pendingGapHandled = false;

  if (team.status !== "complete") {
    team.status = "active";
  }
}

/**
 * Finalizes the current Morse buffer into a letter after a letter gap.
 * Validation happens immediately per letter against the next expected
 * character in the target phrase.
 */
function finalizeLetter(team) {
  if (!team.currentSymbolBuffer) {
    return;
  }

  const morse = team.currentSymbolBuffer;
  const decodedLetter = MORSE_MAP[morse];

  if (!decodedLetter) {
    triggerTeamError(team, `Invalid Morse sequence: ${morse}`);
    return;
  }

  const expectedChar = APP_CONFIG.targetPhrase[team.currentTargetIndex];

  if (decodedLetter !== expectedChar) {
    triggerTeamError(
      team,
      `Expected "${expectedChar}" but received "${decodedLetter}"`
    );
    return;
  }

  team.decodedText += decodedLetter;
  team.currentTargetIndex += 1;
  team.currentSymbolBuffer = "";
  team.lastInterpretedSymbol = decodedLetter;
  team.pendingGapHandled = true;

  if (team.currentTargetIndex >= APP_CONFIG.targetPhrase.length) {
    team.status = "complete";
    team.errorMessage = "";
  } else {
    team.status = "idle";
    team.errorMessage = "";
  }
}

/**
 * Finalizes a word gap as a literal space. Spaces matter and must match
 * the target phrase exactly.
 */
function finalizeSpace(team) {
  if (team.currentSymbolBuffer) {
    finalizeLetter(team);
    if (team.status === "error" || team.status === "complete") {
      return;
    }
  }

  const expectedChar = APP_CONFIG.targetPhrase[team.currentTargetIndex];

  if (expectedChar !== " ") {
    triggerTeamError(
      team,
      `Expected "${expectedChar}" but received [space]`
    );
    return;
  }

  team.decodedText += " ";
  team.currentTargetIndex += 1;
  team.lastInterpretedSymbol = "[space]";
  team.pendingGapHandled = true;

  // IMPORTANT:
  // Treat the consumed space as a fresh timing boundary so the user gets
  // a full response window before any further gap-based interpretation.
  team.lastReleaseTime = performance.now();

  if (team.currentTargetIndex >= APP_CONFIG.targetPhrase.length) {
    team.status = "complete";
    team.errorMessage = "";
  } else {
    team.status = "idle";
    team.errorMessage = "";
  }
}

function triggerTeamError(team, message) {
  team.status = "error";
  team.errorMessage = message;
  renderApp();

  window.setTimeout(() => {
    resetTeam(team);
  }, APP_CONFIG.timing.errorFlashMs);
}

/********************************************************************
 * TIMING ENGINE
 *
 * Each team is checked independently for elapsed gap time. This is what
 * turns a raw stream of symbols into letters and spaces.
 ********************************************************************/
function processTeamGap(team, now) {
  if (team.isPressed) {
    return;
  }

  if (team.status === "error" || team.status === "complete") {
    return;
  }

  if (team.lastReleaseTime === null) {
    return;
  }

  const gapMs = now - team.lastReleaseTime;
  const { wordGapMs, letterGapMs } = APP_CONFIG.timing;

  // A word gap should be able to advance onto/past a space even if
  // a letter gap was already handled for this same silence window.
  if (gapMs >= wordGapMs) {
    finalizeSpace(team);
    return;
  }

  // For letter gaps, only finalize once.
  if (team.pendingGapHandled) {
    return;
  }

  if (gapMs >= letterGapMs) {
    finalizeLetter(team);
  }
}

/********************************************************************
 * INPUT HANDLING
 *
 * Each assigned key controls exactly one team. Repeated keydown events
 * are ignored so holding a key does not generate multiple presses.
 ********************************************************************/
function handleKeyDown(event) {
  const key = event.key.toLowerCase();
  const team = teamMapByKey.get(key);

  if (!team) {
    return;
  }

  if (event.repeat) {
    return;
  }

  if (team.status === "complete") {
    return;
  }

  if (team.isPressed) {
    return;
  }

  team.isPressed = true;
  team.pressStartTime = performance.now();
  team.errorMessage = "";

  if (team.status !== "error" && team.status !== "complete") {
    team.status = "active";
  }

  renderApp();
}

function handleKeyUp(event) {
  const key = event.key.toLowerCase();
  const team = teamMapByKey.get(key);

  if (!team) {
    return;
  }

  if (!team.isPressed || team.pressStartTime === null) {
    return;
  }

  const now = performance.now();
  const pressDurationMs = now - team.pressStartTime;

  team.isPressed = false;
  team.pressStartTime = null;
  team.lastReleaseTime = now;

  handlePressEnd(team, pressDurationMs);
  renderApp();
}

/********************************************************************
 * MAIN LOOP
 *
 * A light polling loop watches for letter gaps and word gaps across all
 * teams in parallel.
 ********************************************************************/
function tick() {
  const now = performance.now();

  teams.forEach(team => {
    processTeamGap(team, now);
  });

  renderApp();
  window.requestAnimationFrame(tick);
}

/********************************************************************
 * INIT
 ********************************************************************/
function init() {
  globalResetBtn.addEventListener("click", resetAllTeams);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  renderApp();
  window.requestAnimationFrame(tick);
}

init();