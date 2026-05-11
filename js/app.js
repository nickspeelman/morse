/********************************************************************
 * CONFIG
 * Hardcoded for now, but intentionally isolated so later these can
 * come from an admin panel or backend settings.
 ********************************************************************/
const APP_CONFIG = {
  targetPhrase: "HELLO",
  timing: {
    minPressDurationMs: 30,
    dotMaxMs: 240,
    dashMaxMs: 900,
    letterGapMs: 700,
    wordGapMs: 1400,
    errorFlashMs: 2500
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

const APP_START_TIME = performance.now();

function getSyncedAnimationStyle(durationMs) {
  const elapsed = performance.now() - APP_START_TIME;
  const offset = -(elapsed % durationMs);
  return `style="--sync-delay: ${offset}ms;"`;
}

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
    lastDecodedDisplay: "",
    currentTargetIndex: 0,

    status: "idle", // idle | active | error | complete
    errorMessage: "",

    lastInterpretedSymbol: "",
    livePressSymbol: "",
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
// const globalResetBtn = document.getElementById("globalResetBtn");

/********************************************************************
 * RENDERING
 ********************************************************************/
function renderApp() {
  targetPhraseDisplay.textContent = APP_CONFIG.targetPhrase;
  timingSummary.textContent =
    `dot≤${APP_CONFIG.timing.dotMaxMs}ms | dash≤${APP_CONFIG.timing.dashMaxMs}ms | ` +
    `letter gap≥${APP_CONFIG.timing.letterGapMs}ms | word gap≥${APP_CONFIG.timing.wordGapMs}`;

  teamsContainer.innerHTML = teams.map(renderTeamCard).join("");
  window.requestAnimationFrame(() => fitAllOneLineText(teamsContainer));
}

function renderSingleTeam(team) {
  const existingCard = document.getElementById(`team-card-${team.id}`);

  if (!existingCard) {
    teamsContainer.insertAdjacentHTML("beforeend", renderTeamCard(team));
    return;
  }

  existingCard.outerHTML = renderTeamCard(team);

  const newCard = document.getElementById(`team-card-${team.id}`);
  window.requestAnimationFrame(() => fitAllOneLineText(newCard));
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
  const orbSymbol =
    team.livePressSymbol ||
    (
      team.lastInterpretedSymbol === "." ||
      team.lastInterpretedSymbol === "-"
    ? team.lastInterpretedSymbol
    : "");
  const comparisonHtml = buildComparisonHtml(team);

  const decodedClass =
  team.lastDecodedDisplay === "⊗"
    ? "mono decoded decoded-error"
    : "mono decoded";

  const errorSizeClass = "";

  const cardBodyHtml = team.status === "complete"
    ? `
      <div class="success-wrap" aria-label="Code successfully transmitted">
        <div class="success-check" ${getSyncedAnimationStyle(1600)}>✓</div>
      </div>
    `
    : `
      <div class="signal-wrap">
        <div class="${orbClass}" aria-hidden="true">
          <span class="orb-symbol">${escapeHtml(orbSymbol)}</span>
        </div>
      </div>

      <div class="field-grid">
        <div class="readout-box">
          <div class="readout-label">Buffer</div>
          <div class="mono buffer fit-one-line ${team.currentSymbolBuffer ? "" : "ghost-ellipsis"}" data-fit-min="10" data-fit-max="42" ${team.currentSymbolBuffer ? "" : getSyncedAnimationStyle(1100)}>
            ${team.currentSymbolBuffer ? escapeHtml(team.currentSymbolBuffer) : "<span></span><span></span><span></span>"}
          </div>
        </div>

        <div class="readout-box">
          <div class="readout-label">Last decoded</div>
          <div class="${decodedClass} fit-one-line ${team.lastDecodedDisplay ? "" : "ghost-ellipsis"}" data-fit-min="8" data-fit-max="36" ${team.lastDecodedDisplay ? "" : getSyncedAnimationStyle(1100)}>
            ${team.lastDecodedDisplay ? escapeHtml(team.lastDecodedDisplay) : "<span></span><span></span><span></span>"}
          </div>
        </div>
      </div>

      <div class="target-row">
        <div class="field-label">Target progress</div>
        <div class="comparison fit-one-line" data-fit-min="10" data-fit-max="28">${comparisonHtml}</div>
        <div class="error-text fit-one-line" data-fit-min="8" data-fit-max="22">${escapeHtml(team.errorMessage)}</div>
      </div>
    `;

  return `
    <div id="team-card-${escapeHtml(team.id)}" class="${cardClasses}">
      <div class="team-header">
        <div>
          <div class="team-title">
            ${escapeHtml(team.label)} 
          </div>
        </div>
      </div>

      ${cardBodyHtml}
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
        html += `<span class="done">&nbsp;</span>`;
      } else {
        html += `<span class="done">${escapeHtml(char)}</span>`;
      }
      continue;
    }

    // Current actual logical cursor
    if (i === logicalIndex) {
      if (char === " ") {
        html += `<span class="next">&nbsp;</span>`;
      } else {
        html += `<span class="next">${escapeHtml(char)}</span>`;
      }
      continue;
    }

    // Remaining characters
    if (char === " ") {
      html += `<span class="remaining">&nbsp;</span>`;
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

function fitOneLineText(el) {
  const minSize = Number(el.dataset.fitMin || 8);
  const maxSize = Number(el.dataset.fitMax || 32);

  el.style.fontSize = `${maxSize}px`;
  el.style.whiteSpace = "nowrap";
  el.style.overflow = "hidden";
  el.style.textOverflow = "clip";

  let size = maxSize;

  while (
    size > minSize &&
    (
      el.scrollWidth > el.clientWidth ||
      el.scrollHeight > el.clientHeight
    )
  ) {
    size -= 1;
    el.style.fontSize = `${size}px`;
  }
}

function fitAllOneLineText(root = document) {
  root.querySelectorAll(".fit-one-line").forEach(fitOneLineText);
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
  team.lastDecodedDisplay = "";
  team.currentTargetIndex = 0;
  team.status = "idle";
  team.errorMessage = "";
  team.lastInterpretedSymbol = "";
  team.pendingGapHandled = false;
  renderSingleTeam(team);
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
    team.lastDecodedDisplay = "⊗";
    triggerTeamError(team, `Invalid Morse sequence: ${morse}`);
    return;
  }

  const expectedChar = APP_CONFIG.targetPhrase[team.currentTargetIndex];

  if (decodedLetter !== expectedChar) {
    team.lastDecodedDisplay = decodedLetter;
    triggerTeamError(
      team,
      `Expected "${expectedChar}" but received "${decodedLetter}"`
    );
    return;
  }

  team.decodedText += decodedLetter;
  team.lastDecodedDisplay = decodedLetter;
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
      `Expected "${expectedChar}" but received " "`
    );
    return;
  }

  team.decodedText += " ";
  team.lastDecodedDisplay = "␣";
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
  renderSingleTeam(team);

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
  team.livePressSymbol = ".";
  team.errorMessage = "";

  if (team.status !== "error" && team.status !== "complete") {
    team.status = "active";
  }

  renderSingleTeam(team);
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

  team.livePressSymbol = "";
  handlePressEnd(team, pressDurationMs);
  renderSingleTeam(team);
}

/********************************************************************
 * MAIN LOOP
 *
 * A light polling loop watches for letter gaps and word gaps across all
 * teams in parallel.
 ********************************************************************/
function updateLivePressSymbol(team, now) {
  if (!team.isPressed || team.pressStartTime === null) {
    return;
  }

  const heldMs = now - team.pressStartTime;

  if (heldMs > APP_CONFIG.timing.dotMaxMs) {
    team.livePressSymbol = "-";
  } else {
    team.livePressSymbol = ".";
  }
}


function tick() {
  const now = performance.now();

  teams.forEach(team => {
    const beforeSymbol = team.livePressSymbol;
    const beforeStatus = team.status;
    const beforeTargetIndex = team.currentTargetIndex;
    const beforeBuffer = team.currentSymbolBuffer;
    const beforeError = team.errorMessage;
    const beforePressed = team.isPressed;

    updateLivePressSymbol(team, now);
    processTeamGap(team, now);

    const teamChanged =
      team.livePressSymbol !== beforeSymbol ||
      team.status !== beforeStatus ||
      team.currentTargetIndex !== beforeTargetIndex ||
      team.currentSymbolBuffer !== beforeBuffer ||
      team.errorMessage !== beforeError ||
      team.isPressed !== beforePressed;

    if (teamChanged) {
      renderSingleTeam(team);
    }
  });

  window.requestAnimationFrame(tick);
}
/********************************************************************
 * INIT
 ********************************************************************/
function init() {
  // globalResetBtn.addEventListener("click", resetAllTeams);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  renderApp();
  window.requestAnimationFrame(tick);
}

init();