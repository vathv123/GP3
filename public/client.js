// client.js
// localStorage.clear()
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const socket = io();
const SECRET_KEY = "interception";
let resultsFrom = null; // 'qcm' or 'trophy'

let isController = false;
viewerEnteredGame = false;
// ----------------------
// Ask for secret key
// ----------------------
const generatedNames = new Set(); // track names for uniqueness

function generateRandomName() {
    const adjectives = ["Sunny","Happy","Quick","Clever","Brave","Mighty"];
    const nouns = ["Fox","Tiger","Eagle","Lion","Wolf","Bear"];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj}${noun}${Math.floor(Math.random() * 100)}`;
}

// Main registration function
function askForKey() {
    const storedName = localStorage.getItem("username");
    const nameDisplay = document.getElementById("usernameDisplay");

    let key = storedName || prompt("Enter your name:");

    if (key === SECRET_KEY || storedName === "Admin") {
        // === Controller/Admin logic ===
        isController = true;
        localStorage.setItem("username", "Admin");
        if (nameDisplay) nameDisplay.textContent = "Admin";
        unlockControllerUI();
        alert(storedName === "Admin" ? "Welcome back Admin!" : "Welcome Admin!");
        socket.emit("registerController", SECRET_KEY);

        // Show viewer count box
        const countingEl = document.querySelector(".countingNumber");
        if (countingEl) countingEl.style.display = "block";

        // Go straight to QCM game
        showScreen('#screen-game');
        loadQuestion();
        updateScorebar();
        updateShieldInfo();
        applySavedChoiceColors();
        emitGameUpdate('startGame');

    } else {
        // === Viewer logic ===
        isController = false;

        if (!key || key.trim() === "") {
            // No input: assign random name
            key = generateRandomName();
            localStorage.setItem("username", key);
            if (nameDisplay) nameDisplay.textContent = key;
            alert(`No name entered. Your assigned name: ${key}`);
        } else {
            // User typed a name
            localStorage.setItem("username", key);
            if (nameDisplay) nameDisplay.textContent = key;
            alert(storedName ? `Welcome back ${key}!` : `Welcome ${key}!`);
        }

        lockViewerUI();
        showScreen('#screen-instructions');

        // Register viewer with server
        socket.emit("registerViewer", key);
    }
}

// ----------------------
// Safe profile picture + username load
// ----------------------
const savedPic = localStorage.getItem("profilePic");
const savedName = localStorage.getItem("username");

const profilePic = document.getElementById("profilePic");
const profileUpload = document.getElementById("profileUpload");
const usernameDisplay = document.getElementById("usernameDisplay");

if (profilePic) {
    profilePic.src = savedPic || "https://via.placeholder.com/40";
}

if (usernameDisplay) {
    if (savedName === SECRET_KEY) {
        // Controller
        usernameDisplay.textContent = "Admin";
        isController = true;
        unlockControllerUI(); // optional
    } else {
        // Viewer
        usernameDisplay.textContent = `Viewer: ${savedName || ""}`; // blank if no name
    }
}

if (profilePic && profileUpload) {
    profilePic.addEventListener("click", () => {
        profileUpload.click();
    });

    profileUpload.addEventListener("change", function () {
        const file = this.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            const imageData = e.target.result;
            profilePic.src = imageData;
            localStorage.setItem("profilePic", imageData);
        };
        reader.readAsDataURL(file);
    });
}

// --- Update viewer count (controller side) ---
socket.on("viewerCountUpdate", count => {
    if (!isController) return;

    const countingEl = document.querySelector(".countingNumber");
    if (!countingEl) return;

    countingEl.style.display = "block"; // ensure visible
    const amountEl = countingEl.querySelector(".amount");
    if (amountEl) amountEl.textContent = count; // just viewers, exclude controller
});

// ----------------------
// Lock UI for viewers
// ----------------------
function lockViewerUI() {
    // Disable all buttons and inputs
    document.querySelectorAll('button, input').forEach(el => {
        el.disabled = true;
        el.style.pointerEvents = 'none';
        el.style.opacity = '0.6';
    });
    // Hide controller-only buttons
    ['#btnPrev','#btnNext','#btnStart','#btnSetTurn','#btnResults','#btnPeekResultsFromIntro','#spinBtn', '#btnSpinBack'].forEach(sel=>{
        const el = document.querySelector(sel);
        if(el) el.style.display = 'none';
    });
    ['#btnResults', '#btnViewResults', '#btnBackToGame'].forEach(sel=>{
        const el = document.querySelector(sel);
        if(el) {
            el.disabled = false;
            el.style.pointerEvents = '';
            el.style.opacity = '';
            el.style.display = ''; // ensure visible
        }
    });
}
function unlockControllerUI() {
    document.querySelectorAll('button, input').forEach(el => {
        el.disabled = false;
        el.style.pointerEvents = '';
        el.style.opacity = '';
    });
    // Show controller-only buttons
    ['#btnPrev','#btnNext','#btnStart','#btnSetTurn','#btnResults','#btnPeekResultsFromIntro','#btnBackToGame','#spinBtn'].forEach(sel=>{
        const el = document.querySelector(sel);
        if(el) el.style.display = '';
    });
}

// ----------------------
// Emit full game state to viewers
// ----------------------
function emitGameUpdate(type, extra = {}) {
    if (!isController) return;
    socket.emit('gameAction', {
        type,
        currentQuestion,
        currentTurnGroup,
        scores: [...scores],
        shields: [...shields],
        snackEligible: [...snackEligible],
        results: results.map(arr => [...arr]),
        ...extra
    });
}

// ----------------------
// Button events (always attached, but block for viewers)
// ----------------------
$('#btnStart').addEventListener('click', () => {
    askForKey();

    if (isController) {
        showScreen('#screen-game');
        loadQuestion();
        updateScorebar();
        updateShieldInfo();
        applySavedChoiceColors();
        emitGameUpdate('startGame');
    } else {
        viewerEnteredGame = true;
        document.querySelector(".loader").style.display = 'flex';
        showScreen('#screen-instructions');

        // Register viewer only now
        const username = localStorage.getItem("username") || "Viewer";
        socket.emit("registerViewer", username);
    }
});

$('#btnPrev').addEventListener('click', ()=>{
    if(!isController) return;
    if(currentQuestion > 0){
        currentQuestion--;
        loadQuestion();
        applySavedChoiceColors();
        emitGameUpdate('navigate');
    }
});

$('#btnNext').addEventListener('click', () => {
    if (!isController) return;

    const isMilestone = isMilestoneQuestion(currentQuestion);
    const alreadySpun = spunMilestones.includes(currentQuestion);

    if (isMilestone && !alreadySpun) {
        if (!questionResolved) {
            alert('This is a milestone question. The winning group must spin first!');
            return; 
        } else if (lastCorrectGroup) {
            spinningForGroup = lastCorrectGroup;
            $('#spinnerGroupLabel').textContent = `G${spinningForGroup}`;
            showScreen('#screen-spin');
            $('#screen-game').classList.add('hidden');
            emitGameUpdate('spin', { group: spinningForGroup });

            spunMilestones.push(currentQuestion); // mark milestone as spun
            return;
        }
    }

    // Move to next question
    if (currentQuestion < TOTAL_QUESTIONS - 1) {
        currentQuestion++;
        loadQuestion();
        emitGameUpdate('navigate');
    } 
    else if (currentQuestion === TOTAL_QUESTIONS - 1 && questionResolved) {
        showWinnerScreen();
    }
});



$('#btnSetTurn').addEventListener('click', ()=>{
    if(!isController) return;
    const v = Number($('#turnInput').value);
    if(!v || v < 1 || v > MAX_GROUPS){ alert('Enter group 1..6'); return; }
    currentTurnGroup = v;
    applySavedChoiceColorsForGroup(currentTurnGroup);
    emitGameUpdate('setTurn', { group: currentTurnGroup });
});

$('#btnResults').addEventListener('click', () => {
    resultsFrom = 'qcm';
    renderResults();                  // full QCM table
    showScreen('#screen-results');
    $('#btnBackToGame').textContent = 'Return'; // default QCM return
});

// ----------------------
// Choices: block for viewers
// ----------------------

// ...existing code for helpers, results, spin, etc...

// ----------------------
// Viewer updates
// ----------------------
socket.on('updateGame', data => {
    // Navigation
     if(isController) {
        // Only allow certain updates like spinResult or turn updates
        if(data.type !== 'spinResult' && data.type !== 'setTurn') return;
    }
    if (data.type === 'sync') {
        // Update local state
        if(data.scores) scores.splice(0, MAX_GROUPS, ...data.scores);
        if(data.shields) shields.splice(0, MAX_GROUPS, ...data.shields);
        if(data.snackEligible) snackEligible.splice(0, MAX_GROUPS, ...data.snackEligible);
        if(data.results) {
            for(let i=0;i<TOTAL_QUESTIONS;i++){
                results[i] = data.results[i].slice();
            }
        }
        currentQuestion = data.currentQuestion ?? currentQuestion;
        currentTurnGroup = data.currentTurnGroup ?? currentTurnGroup;

        // Auto-start viewer if admin has already started
        if(data.gameStarted && !viewerStarted){
            simulateStartClick();
        }
    }

    if (data.type === 'navigate') {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        const screen = document.getElementById('screen-game');
        if(screen) screen.classList.remove('hidden');
        currentQuestion = data.currentQuestion ?? currentQuestion;
        loadQuestion();
        updateScorebar();
        updateShieldInfo();
        applySavedChoiceColors();
    }
    if (data.type === 'startGame') {
        showScreen('#screen-game');
        loadQuestion();
        updateScorebar();
        updateShieldInfo();
        applySavedChoiceColors();
    }
    if (data.type === 'choice' && typeof data.choice === 'number' && typeof data.group === 'number') {
        const idx = data.choice;
        const group = data.group;

        // Update local results and selections
        if (data.results) {
            for (let i = 0; i < TOTAL_QUESTIONS; i++) {
                results[i] = data.results[i].slice();
            }
        }

        if (data.scores) {
            scores.splice(0, MAX_GROUPS, ...data.scores);
            updateScorebar(); // immediately refresh scorebar
        }

        selections[currentQuestion][group-1] = idx;

        // If viewer is on Results screen, re-render
        const screenResults = $('#screen-results');
        if(screenResults && !screenResults.classList.contains('hidden')){
            renderResults();
        }

        // Also update live question screen if viewer is there
        const screenGame = $('#screen-game');
        if(screenGame && !screenGame.classList.contains('hidden')){
            applySavedChoiceColors();
        }
    }

        socket.on("registerViewer", username => {
        if (socket.id === controllerSocketId) return;

        // Remove any previous entry with the same username
        for (let id in viewers) {
            if (viewers[id] === username) delete viewers[id];
        }

        viewers[socket.id] = username;

        // Send full current game state immediately to this new viewer
        socket.emit("updateGame", {
            type: "sync",
            scores,
            shields,
            snackEligible,
            results,
            currentQuestion,
            currentTurnGroup,
            gameStarted: controllerSocketId !== null
        });

        emitViewerCount();
    });

    // Turn input
    if (data.type === 'setTurn') {
        const turnInput = document.getElementById('turnInput');
        if(turnInput) turnInput.value = data.group;
        currentTurnGroup = data.group;
    }
    // Results
    if (data.type === 'showResults') {
        renderResults();
        const screenResults = document.getElementById('screen-results');
        if(screenResults) screenResults.classList.remove('hidden');
        const screenGame = document.getElementById('screen-game');
        if(screenGame) screenGame.classList.add('hidden');
    }

    // Back to game
    if (data.type === 'backToGame') {
        currentQuestion = data.currentQuestion ?? currentQuestion;
        const screenGame = document.getElementById('screen-game');
        const screenResults = document.getElementById('screen-results');
        const screenSpin = document.getElementById('screen-spin');

        if(screenGame) screenGame.classList.remove('hidden');
        if(screenResults) screenResults.classList.add('hidden');
        if(screenSpin) screenSpin.classList.add('hidden'); // hide spinner

        loadQuestion();
        updateScorebar();
        updateShieldInfo();
        applySavedChoiceColors();
    }

    // Sync full state
    if(data.scores) { scores.splice(0, MAX_GROUPS, ...data.scores); }
    if(data.shields) { shields.splice(0, MAX_GROUPS, ...data.shields); }
    if(data.snackEligible) { snackEligible.splice(0, MAX_GROUPS, ...data.snackEligible); }
    if(data.results) {
        for(let i=0;i<TOTAL_QUESTIONS;i++){
            results[i] = data.results[i].slice();
        }
    }
});

/********************
 * DATA & STATE
 ********************/
const MAX_GROUPS = 6;
const TOTAL_QUESTIONS = 32;

// YOUR questions kept as-is
const QUESTIONS = [
  { text: "Q1: Who is Mr Panwallah?", options: ["Oliver's farther","A teacher at Hari's school","An old watch repairman in Bombay","A factory owner in Thul"], correct: 2 },
  { text: "Q2: What skill is Hari learning?", options: ["Farming","Fishing","Watchmending","Stealing"], correct: 2 },
  { text: "Q3: What festival is celebrated by offering coconuts to the sea?", options: ["Ganesh Chaturthi","Diwali","Coconut Day","Holi"], correct: 2 },
  { text: "Q4: How does the ferry schedule affect Hari's plans?", options: ["He can't go on a date with his girlfriend","He must travel every week","He must go at night","He can only go after the rainy season"], correct: 3 },
  { text: "Q5: Why is Hari saving money for his sisters?", options: ["To buy gifts for them","To buy a new boat","To invest in a shop","To pay the money back"], correct: 0 },
  { text: "Q6: What does the cat on Mr Panwallah's lap symbolize?", options: ["Wealth","Comfort and companionship","Lazy","Independence"], correct: 1 },
  { text: "Q7: How do the villagers celebrate Coconut Day?", options: ["They use coconut to smash others head","They repair watches","They fight each others","They offer coconuts and enjoy a festival on the beach"], correct: 3 },
  { text: "Q8: What do the changes in the sea represent?", options: ["Life's ups and downs","The weather forecast","Water","Fish"], correct: 0 },
  { text: "Q9: How does the story show hope during hard times?", options: ["By staying indoors","Through festivals, learning, and personal growth","By hiding from people","By moving to another city"], correct: 1 },
  { text: "Q10: How does Hari's confidence change by the end of the chapter?", options: ["He becomes more afraid","He becomes more arrogant","He becomes more assertive and hopeful","He decides to stay in the city forever"], correct: 2 },
  { text: "Q11: What does Mr Panwallah think about festivals from different religions?", options: ["He only celebrates Parsee festivals","He thinks only Hindu festivals are fun","He enjoys all festivals and shares the joy","He enjoys seeing beautiful girls from different religions"], correct: 2 },
  { text: "Q12: How does the factory affect life in Hari's village?", options: ["It threatens farming and fishing, forcing people to adapt","It provides jobs for everyone","It has no effect","It increases fishing opportunities"], correct: 0 },
  { text: "Q13: Why can't Hari return to his village during the rainy season?", options: ["The ferry to Rewas doesn't travel","Moniyuth says so","Roads are flooded","Mr Panwallah forbids him"], correct: 0 },
  { text: "Q14: What does the closed shutter at Mr Panwallah's shop mean?", options: ["He moved to another city","The shop is permanently closed","He is on vacation","He has been ill and hasn't worked"], correct: 3 },
  { text: "Q15: Where does Mr Panwallah live in Bombay?", options: ["Next to the sea","Above the Grant Road station with a balcony full of plants","In a tall apartment near Marine Drive","In the de Silva family house"], correct: 1 },
  { text: "Q16: How does Mr Panwallah describe life's changes?", options: ["Like a wheel that keeps turning","Like a river flowing slowly","Like a tree that never grows","Like a flat road"], correct: 0 },
  { text: "Q17: Why did Hari come to Bombay?", options: ["To visit relatives","Because there was no work left in the village","To study in a school","To see beautiful girls"], correct: 1 },
  { text: "Q18: What advice does Mr Panwallah give about finding work?", options: ["You can find work if you use your hands and learn","You will always be jobless","Avoid learning new skills","Only city people can succeed"], correct: 0 },
  { text: "Q19: What does the 'wheel' symbolize in the story?", options: ["A broken bicycle","A ferry","Life's cycle of change and adaptation","Mr Panwallah's age"], correct: 2 },
  { text: "Q20: How does Hari feel about watchmending in his village?", options: ["He thinks it's useless since people tell time by the sun","He loves it","He is afraid of watches","He wants to teach others"], correct: 0 },
  { text: "Q21: How is Mr Panwallah's illness affecting him?", options: ["He has fully recovered","He moved to the village","He is weak and frail, recovering slowly","He is strong and energetic"], correct: 2 },
  { text: "Q22: How does Hari's relationship with Jagu change?", options: ["They become closer than ever","Jagu avoids him after Hari visits Mr Panwallah","Jagu helps Hari more than before","Jagu moves to another city"], correct: 1 },
  { text: "Q23: Why doesn't Hari want to live in the de Silva family's house?", options: ["He prefers the village","He can't climb stairs","He feels ashamed and uncomfortable","He dislikes the de Silvas"], correct: 2 },
  { text: "Q24: What does Hari think about becoming a 'city boy'?", options: ["He feels ashamed but learns to survive","He ignores city life","He wants to go back immediately","He thinks that he is now one of a gang member"], correct: 0 },
  { text: "Q25: What happens during Coconut Day?", options: ["Hari goes fishing","Villagers gather to pray and offer coconuts to the sea","Mr Panwallah opens a new shop","Jagu throws a party"], correct: 1 },
  { text: "Q26: Why do villagers throw coconuts into the sea?", options: ["To see if the coconuts can float","To scare away fish","As a ritual to thank the sea for safety and good fishing","To play games"], correct: 2 },
  { text: "Q27: What does Hari do to get a coconut during the festival?", options: ["Steal","Pushes and fights other boys to catch one","Gives up immediately","Buys one from a hawker"], correct: 1 },
  { text: "Q28: What does the ten rupee note represent for Hari?", options: ["His first step toward independence","His savings for a boat","Payment for a festival","Money to give Jagu"], correct: 0 },
  { text: "Q29: How does Mr Panwallah react when Hari receives his first payment?", options: ["He ignores it","He is proud and insists the money belongs to Hari","He keeps it for himself","He gives Hari a scolding"], correct: 1 },
  { text: "Q30: What does Mr Panwallah say about learning new skills like repairing electronic watches?", options: ["Learning is important at any age","Old people cannot learn","Only Hari should learn","Electronics are useless"], correct: 0 },
  { text: "Q31: How does Hari feel when he first visits Mr Panwallah's home?", options: ["Excited but also anxious to see him","Calm and relaxed","Disgusted","Indifferent"], correct: 0 },
  { text: "Q32: How do the neighbors help Mr Panwallah during his illness?", options: ["They bring meals and hot drinks while he rests at home","They call the police","They ignore him","They push him off the building"], correct: 0 }
];

const scores = Array(MAX_GROUPS).fill(0);
const shields = Array(MAX_GROUPS).fill(false);
const snackEligible = Array(MAX_GROUPS).fill(true);
const results = Array.from({length: TOTAL_QUESTIONS}, () => Array(MAX_GROUPS).fill(null));
const selections = Array.from({length: TOTAL_QUESTIONS}, () => Array(MAX_GROUPS).fill(null));

let currentQuestion = 0;           // 0-based index
let currentTurnGroup = null;       // 1..6
let questionResolved = false;      // true once correct picked for this question
let lastCorrectGroup = null;       // group # that got the last question correct
let spinningForGroup = null;       // group # that will spin at milestones

/********************
 * HELPERS
 ********************/

function showScreen(id){
  const screens = ['#screen-instructions','#screen-game','#screen-results','#screen-spin'];
  screens.forEach(s => $(s).classList.add('hidden'));
  const el = $(id);
  el.classList.remove('hidden');
  // small entrance animation
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  gsap.fromTo(el,{y:16, opacity:0},{y:0, opacity:1, duration:.35, ease:'power2.out'});
}

function updateScorebar(){
  const bar = $('#scorebar');
  bar.innerHTML = '';
  for(let i=1;i<=MAX_GROUPS;i++){
    const d = document.createElement('div');
    d.className = 'pill';
    const shieldIcon = shields[i-1] ? '🛡️' : '';
    const elig = snackEligible[i-1] ? '' : ' (no snack)';
    d.innerHTML = `<span class="tag">G${i}</span> <b>${scores[i-1]}</b> ${shieldIcon}${elig}`;
    bar.appendChild(d);
  }
}

function updateShieldInfo(){
  const active = shields.map((s,idx)=> s ? idx+1 : null).filter(Boolean);
  $('#shieldInfo').textContent = active.length ? `Shields active → G${active.join(', G')}` : 'No shields active';
}
const spunMilestones = [];
function loadQuestion() {
    const q = QUESTIONS[currentQuestion];
    $('#qCounter').textContent = `${currentQuestion+1} / ${TOTAL_QUESTIONS}`;
    $('#qText').textContent = q.text;

    const labels = ['a','b','c','d'];
    const choices = $('#choices');
    choices.innerHTML = '';
    q.options.forEach((opt, idx) => {
        const div = document.createElement('div');
        div.className = 'choice';
        div.dataset.idx = idx;
        div.innerHTML = `<span class="label">${labels[idx].toUpperCase()}</span> <div>${opt}</div>`;
        div.addEventListener('click', onChoiceClick);
        choices.appendChild(div);
    });

    // derive resolved state from saved results
    const row = results[currentQuestion];
    questionResolved = row ? row.includes(1) : false;
    lastCorrectGroup = questionResolved ? (row.findIndex(v => v === 1) + 1) : null;

    // re-apply any saved selection color for current group
    applySavedChoiceColors();

    // Show normal game screen (never auto-spin)
    showScreen('#screen-game');
    $('#screen-game').classList.remove('hidden');
}


function resetChoiceColors(){
  $$('#choices .choice').forEach(c=>{ c.classList.remove('wrong','correct'); });
}

// Fix the spinning logic and navigation

// Modify the onChoiceClick function to handle milestone questions properly
function onChoiceClick(e){
    if(!isController) return;
    const card = e.currentTarget;
    const idx = Number(card.dataset.idx);
    if(!ensureTurn()) return;
    if(questionResolved){
        alert('This question already has a correct answer. Use Next.');
        return;
    }

    const q = QUESTIONS[currentQuestion];
    const g = currentTurnGroup; // 1..6

    if(idx === q.correct){
        scores[g-1] += 1;
        results[currentQuestion][g-1] = 1;
        selections[currentQuestion][g-1] = idx;

        resetChoiceColors();
        card.classList.add('correct');

        questionResolved = true;
        lastCorrectGroup = g;

        // **Do NOT trigger spin here**
    }
    else {
        // Wrong answer
        scores[g-1] -= 1;
        results[currentQuestion][g-1] = -1;
        selections[currentQuestion][g-1] = idx;
        card.classList.add('wrong');
    }


    updateScorebar();

    // Broadcast to viewers if controller
    emitGameUpdate('choice', { 
        choice: idx, 
        group: currentTurnGroup,
        currentQuestion,
        scores,       // send live updated scores
        results       // send live updated results
    });
}

// Fix the milestone question logic
function isMilestoneQuestion(idx0){
    const n = idx0 + 1; // 1-based question number
    return n % 5 === 0 && n <= 30; // 5, 10, 15, 20, 25, 30
}

// Modify applySavedChoiceColorsForGroup to show all saved selections
function applySavedChoiceColorsForGroup(group){
    if(!group) return;
    
    // Don't reset colors here - we want to show all selections
    const choices = $$('#choices .choice');
    
    // Apply colors for all groups on this question
    for(let g = 1; g <= MAX_GROUPS; g++) {
        const selIdx = selections[currentQuestion]?.[g-1];
        if(selIdx == null) continue;
        
        const res = results[currentQuestion]?.[g-1];
        const card = choices[selIdx];
        if(!card) continue;
        
        if(res === 1) {
            card.classList.add('correct');
        } else if(res === -1) {
            card.classList.add('wrong');
        }
    }
}

// Modify applySavedChoiceColors to show all selections
function applySavedChoiceColors(){
    // Show all saved selections for this question
    const choices = $$('#choices .choice');
    
    // Clear existing colors first
    resetChoiceColors();
    
    // Apply colors for all groups on this question
    for(let g = 1; g <= MAX_GROUPS; g++) {
        const selIdx = selections[currentQuestion]?.[g-1];
        if(selIdx == null) continue;
        
        const res = results[currentQuestion]?.[g-1];
        const card = choices[selIdx];
        if(!card) continue;
        
        if(res === 1) {
            card.classList.add('correct');
        } else if(res === -1) {
            card.classList.add('wrong');
        }
    }
}

function ensureTurn(){
  if(!currentTurnGroup){
    alert('Set current turn → enter group number (1..6) and click Set.');
    return false;
  }
  return true;
}

/********************
 * GAME EVENTS
 ********************/

/********************
 * RESULTS TABLE
 ********************/
function renderResults(uptoQuestions = currentQuestion + 1){
  const table = $('#resultTable');
  const upto = uptoQuestions; // show all if passed

  let thead = '<thead><tr><th>Group</th>';
  for(let q=1;q<=TOTAL_QUESTIONS;q++){ thead += `<th>Q${q}</th>`; }
  thead += '<th>Total</th><th>Snack?</th></tr></thead>';

  let tbody = '<tbody>';
  for(let g=1; g<=MAX_GROUPS; g++){
    let row = `<tr><th>G${g}</th>`;
    for(let q=0;q<TOTAL_QUESTIONS;q++){
      let val = results[q][g-1];
      const shown = (q < upto) ? (val===1?'+1': (val===-1?'-1':'•')) : '';
      row += `<td>${shown}</td>`;
    }
    row += `<td class="totals">${scores[g-1]}</td>`;
    row += `<td>${snackEligible[g-1] ? '✅' : '🚫'}</td>`;
    row += '</tr>';
    tbody += row;
  }
  tbody += '</tbody>';

  table.innerHTML = thead + tbody;
  $('#resultNote').textContent = `Showing all questions. Totals reflect question points ± spin effects.`;
}


/********************
 * SPIN WHEEL (integrated)
 ********************/
const wheel = document.getElementById('wheel');
const spinResultDiv = document.getElementById('spinResult');
const spinBtn = document.getElementById('spinBtn');
const letters = ['BOMB', 'AURA', 'SWAP', 'MINUS', 'SHIELD'];
const letterAngles = { 'BOMB':0, 'AURA':60, 'SWAP':120, 'MINUS':240, 'SHIELD':300 };

/********************
 * Admin spin
 ********************/
// Fix the spin button to automatically go to next question after spin
spinBtn.addEventListener('click', () => {
  if(!spinningForGroup){ alert('No group set to spin.'); return; }
  spinBtn.disabled = true;

  const randomIndex = Math.floor(Math.random() * letters.length);
  const selected = letters[randomIndex];
  const group = spinningForGroup;

  // Total spins for smooth motion
  const spins = 6;
  const spinOffset = Math.random() * 360; // random for motion only
  const spinAngle = spins*360 + spinOffset;

  // Tell viewers: start spin
  emitGameUpdate('spin', { group, result: selected, spinAngle });

  // Start admin spin
  wheel.style.transition = 'transform 3s cubic-bezier(0.33,1,0.68,1)';
  wheel.style.transform = `rotate(${spinAngle}deg)`;
  wheel.textContent = '?';
  spinResultDiv.textContent = '';

  // After spin duration, stop exactly at straight angle
  setTimeout(() => {
    wheel.style.transition = 'transform 1s ease-out';
    wheel.style.transform = `rotate(${letterAngles[selected]}deg)`;
    wheel.textContent = selected;
        spinResultDiv.textContent = `Group ${group}: ${selected}`;

        // Apply spin outcome
    applySpinOutcome(selected, group);

    // Tell viewers: spin finished
    emitGameUpdate('spinResult', { group, result: selected });

    spinBtn.disabled = false;
        
        // Automatically go to next question after spin
        // setTimeout(() => {
        //     if(currentQuestion < TOTAL_QUESTIONS-1){
        //         currentQuestion++;
        //         showScreen('#screen-game');
        //         $('#screen-spin').classList.add('hidden');
        //         loadQuestion();
        //         applySavedChoiceColors();
        //         emitGameUpdate('navigate');
        //     }
        // }, 2000); // Wait 2 seconds after spin result to show next question
  }, 3000);
});

/********************
 * Viewer spin
 ********************/
socket.on('updateGame', data => {
  if(data.type === 'spin'){
    spinningForGroup = data.group;
    $('#spinnerGroupLabel').textContent = `G${spinningForGroup}`;
    showScreen('#screen-spin');
    $('#screen-game').classList.add('hidden');

    // Start spin animation
    wheel.style.transition = 'transform 3s cubic-bezier(0.33,1,0.68,1)';
    wheel.style.transform = `rotate(${data.spinAngle}deg)`;
    wheel.textContent = '?';
    spinResultDiv.textContent = '';
  }

  if(data.type === 'spinResult'){
    // Stop smoothly at straight angle
    wheel.style.transition = 'transform 1s ease-out';
    wheel.style.transform = `rotate(${letterAngles[data.result]}deg)`;
    wheel.textContent = data.result;
    spinResultDiv.textContent = `Group ${data.group}: ${data.result}`;
    
    // Automatically go to next question after spin for viewers too
    // setTimeout(() => {
    //     if(currentQuestion < TOTAL_QUESTIONS-1){
    //         currentQuestion++;
    //         showScreen('#screen-game');
    //         $('#screen-spin').classList.add('hidden');
    //         loadQuestion();
    //         applySavedChoiceColors();
    //         emitGameUpdate('navigate');
    //     }
    // }, 2000);
  }
});

// --- Optional: also handle full reset if server sends it ---
socket.on("gameReset", (data) => {
    if (data.type === "fullReset") {
        console.log("Viewer full game reset by admin");
        // Can reuse same function as above
        socket.emit("adminDisconnected", { type: "resetViewer" });
    }
});


function applySpinOutcome(type, group){
  const idx = group - 1;
  switch(type){
    case 'AURA':
      scores[idx] += 2;
      toast(`G${group} gained +2 (Aura)`);
      break;
    case 'MINUS':
      if(shields[idx]){ shields[idx] = false; toast(`G${group}'s shield blocked -2 (consumed)`); }
      else { scores[idx] -= 2; toast(`G${group} lost -2 (Minus)`); }
      break;
    case 'SHIELD':
      shields[idx] = true; toast(`G${group} obtained a Shield`);
      break;
    case 'QUIT':
      snackEligible[idx] = false; toast(`G${group} is no longer eligible for the snack (Quit)`);
      break;
    case 'SWAP':{
      const target = prompt('Swap with which group? (1..6)');
      const t = Number(target);
      if(t && t>=1 && t<=MAX_GROUPS && t !== group){
        const ti = t-1;
        const tmp = scores[idx]; scores[idx] = scores[ti]; scores[ti] = tmp;
        toast(`G${group} swapped score with G${t}`);
      } else {
        toast('Swap cancelled');
      }
      break;
    }
    case 'BOMB':{
      const target = prompt('Bomb which group? (1..6)');
      const t = Number(target);
      if(t && t>=1 && t<=MAX_GROUPS){
        const ti = t-1;
        if(shields[ti]){ shields[ti] = false; toast(`G${t}'s shield blocked the Bomb (consumed)`); }
        else { scores[ti] = 0; toast(`G${t} dropped to 0 from Bomb`); }
      } else {
        toast('Bomb cancelled');
      }
      break;
    }
  }
  updateScorebar();
  updateShieldInfo();
}

// Fix the spin back button to go to the current question (not next)
$('#btnSpinBack').addEventListener('click', ()=>{
    if (!isController) {
        $('#btnSpinBack').style.display = 'none';
    }
  spinningForGroup = null;
  // Don't increment question - just go back to current question
  showScreen('#screen-game');
  $('#screen-spin').classList.add('hidden');
  emitGameUpdate('backToGame', { currentQuestion });
});

/********************
 * RPS modal wiring
 ********************/
$('#btnRps')?.addEventListener('click', ()=> $('#rpsModal').showModal());
$('#btnRpsWinA').addEventListener('click', ()=>{
  const a = Number($('#rpsA').value); if(!a) return;
  currentTurnGroup = a; $('#turnInput').value = a; applySavedChoiceColorsForGroup(currentTurnGroup);
  $('#rpsModal').close(); toast(`RPS: Group ${a} picks first`);
});
$('#btnRpsWinB').addEventListener('click', ()=>{
  const b = Number($('#rpsB').value); if(!b) return;
  currentTurnGroup = b; $('#turnInput').value = b; applySavedChoiceColorsForGroup(currentTurnGroup);
  $('#rpsModal').close(); toast(`RPS: Group ${b} picks first`);
});

/********************
 * Small toast helper
 ********************/
function toast(msg){
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style,{
    position:'fixed', left:'50%', top:'18px', transform:'translateX(-50%)', background:'#0c121a', color:'var(--text)',
    border:'1px solid #223047', padding:'10px 14px', borderRadius:'12px', zIndex:9999, boxShadow:'var(--ring)', fontWeight:'700'
  });
  document.body.appendChild(t);
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gsap.fromTo(t,{y:-16, opacity:0},{y:0, opacity:1, duration:.25, ease:'power2.out'});
  }
  setTimeout(()=>{
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.to(t,{y:-12, opacity:0, duration:.25, ease:'power2.in', onComplete:()=>t.remove()});
    } else {
      t.remove();
    }
  }, 1800);
}
// Function to show winner screen
function showWinnerScreen() {
    // Find the group with the highest score
    let maxScore = Math.max(...scores);
    let winnerGroups = scores.map((score, index) => ({ group: index + 1, score }))
                             .filter(item => item.score === maxScore);
    
    // Update winner display
    if (winnerGroups.length > 0) {
        const winner = winnerGroups[0];
        $('#winnerGroupNumber').textContent = winner.group;
        $('#winnerScore').textContent = winner.score;
        
        // Populate final results table
        populateFinalResults();
        
        // Show winner screen and hide game screen
        showScreen('#screen-winner');
        $('#screen-game').classList.add('hidden');
        
        // Start animations
        startWinnerAnimations();
        
        // Emit winner announcement
        emitGameUpdate('winnerAnnounced', { 
            winnerGroup: winner.group, 
            winnerScore: winner.score,
            allScores: [...scores]
        });
    }
}

// Function to populate final results table - Only show winner
function populateFinalResults() {
    const table = $('#finalResultsTable');
    table.innerHTML = '';
    
    // Find the group(s) with the highest score
    let maxScore = Math.max(...scores);
    let winnerGroups = scores.map((score, index) => ({ group: index + 1, score }))
                             .filter(item => item.score === maxScore);
    
    // Only show the winner(s) - no score shown here
    winnerGroups.forEach(winner => {
        const row = document.createElement('div');
        row.className = 'result-row winner';
        
        row.innerHTML = `
            <div class="group-name">🏆 Group ${winner.group}</div>
            <div class="group-rank">🥇 1st</div>
        `;
        
        table.appendChild(row);
    });
}


// Function to start winner animations
function startWinnerAnimations() {
    // Create confetti
    createConfetti();
    
    // Create floating particles
    createParticles();
    
    // Add entrance animations
    gsap.fromTo('.trophy-wrapper', 
        { scale: 0, rotation: -180 },
        { scale: 1, rotation: 0, duration: 1, ease: "back.out(1.7)" }
    );
    
    gsap.fromTo('.winner-title', 
        { y: -50, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, delay: 0.3, ease: "power2.out" }
    );
    
    gsap.fromTo('.winner-group', 
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.6, delay: 0.6, ease: "back.out(1.7)" }
    );
    
    gsap.fromTo('.final-results', 
        { y: 50, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, delay: 0.9, ease: "power2.out" }
    );
    
    gsap.fromTo('.winner-actions', 
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, delay: 1.2, ease: "power2.out" }
    );
}

// Function to create confetti
function createConfetti() {
    const container = $('#confettiContainer');
    const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];
    
    for (let i = 0; i < 100; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.animationDelay = Math.random() * 3 + 's';
            confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
            container.appendChild(confetti);
            
            // Remove confetti after animation
            setTimeout(() => confetti.remove(), 3000);
        }, i * 50);
    }
}

// Function to create floating particles
function createParticles() {
    const container = $('#particlesContainer');
    
    for (let i = 0; i < 20; i++) {
        setTimeout(() => {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 6 + 's';
            particle.style.animationDuration = (Math.random() * 3 + 4) + 's';
            container.appendChild(particle);
        }, i * 200);
    }
}

// Function to reset game completely
function resetGame() {
    // Reset all game state
    scores.fill(0);
    shields.fill(false);
    snackEligible.fill(true);
    results.forEach(row => row.fill(null));
    selections.forEach(row => row.fill(null));
    
    currentQuestion = 0;
    currentTurnGroup = null;
    questionResolved = false;
    lastCorrectGroup = null;
    spinningForGroup = null;
    
    // Update UI
    updateScorebar();
    updateShieldInfo();
    
    // Reset choice colors
    resetChoiceColors();
    
    // Reset turn input
    $('#turnInput').value = '';
}

//renderwinnnerresult
function renderWinnerResults() {
    const table = $('#resultTable');

    // Find the max score
    const maxScore = Math.max(...scores);

    // Find winner group(s)
    const winnerGroups = [];
    for (let g = 0; g < MAX_GROUPS; g++) {
        if (scores[g] === maxScore) winnerGroups.push(g);
    }

    let thead = '<thead><tr><th>Group</th>';
    for(let q=1;q<=TOTAL_QUESTIONS;q++){ thead += `<th>Q${q}</th>`; }
    thead += '<th>Total</th><th>Snack?</th></tr></thead>';

    let tbody = '<tbody>';
    winnerGroups.forEach(g => {
        let row = `<tr><th>G${g+1}</th>`;
        for(let q=0;q<TOTAL_QUESTIONS;q++){
            let val = results[q][g];
            const shown = (val === 1 ? '+1' : val === -1 ? '-1' : '•');
            row += `<td>${shown}</td>`;
        }
        row += `<td class="totals">${scores[g]}</td>`;
        row += `<td>${snackEligible[g] ? '✅' : '🚫'}</td>`;
        row += '</tr>';
        tbody += row;
    });
    tbody += '</tbody>';

    table.innerHTML = thead + tbody;
    $('#resultNote').textContent = `Showing only the winner group(s).`;
}

// Add event listeners for winner screen buttons with proper order and functionality
document.addEventListener('DOMContentLoaded', () => {
    $('#btnViewResults').addEventListener('click', () => {
        resultsFrom = 'trophy';
        renderWinnerResults();
        showScreen('#screen-results');
        $('#screen-winner').classList.add('hidden');
        $('#btnBackToGame').textContent = 'Back to Trophy';
    });
});


// RETURN button on results screen
$('#btnBackToGame').addEventListener('click', () => {
    if (resultsFrom === 'trophy') {
        showScreen('#screen-winner');   // back to trophy
    } else {
        showScreen('#screen-game');     // back to QCM
    }
    $('#screen-results').classList.add('hidden');
});


// NEW GAME (controller only)
$('#btnNewGame').addEventListener('click', () => {
    if (!isController) return;

    resetGame();
    showScreen('#screen-instructions');
    ['#screen-game','#screen-winner','#screen-results','#screen-spin'].forEach(el => $(el).classList.add('hidden'));

    emitGameUpdate('newGame');

    // Emit to server to tell everyone to refresh
    socket.emit('forceFullRefresh');
});

// Listener for everyone (viewers + admin if you want)
socket.on("refreshPage", () => {
    // Clear localStorage for everyone except maybe keep admin keys
    if (!isController) localStorage.clear();

    // Force reload
    window.location.reload();
});


// BACK TO INTRO
$('#btnBackToIntro').addEventListener('click', () => {
    if (!isController) return;         // viewers cannot click
    showScreen('#screen-instructions');
    $('#screen-winner').classList.add('hidden');
    emitGameUpdate('backToIntro');
});


// Modify the showScreen function to properly hide other screens
function showScreen(id){
    const screens = ['#screen-instructions','#screen-game','#screen-results','#screen-spin','#screen-winner'];
    screens.forEach(s => $(s).classList.add('hidden'));
    const el = $(id);
    el.classList.remove('hidden');
    
    // small entrance animation
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo(el,{y:16, opacity:0},{y:0, opacity:1, duration:.35, ease:'power2.out'});
}

// Fix the Next button logic
// $('#btnNext').addEventListener('click', ()=>{
//     if(!isController) return;
    
//     // If we're on a milestone question and it's resolved, don't allow Next
//     if(isMilestoneQuestion(currentQuestion) && questionResolved){
//         alert('This is a milestone question. The winning group must spin first!');
//         return;
//     }
    
//     if(currentQuestion < TOTAL_QUESTIONS-1){
//         currentQuestion++;
//         loadQuestion();
//         applySavedChoiceColors();
//         emitGameUpdate('navigate');
//     } else if (currentQuestion === TOTAL_QUESTIONS - 1 && questionResolved) {
//         // All questions answered - show winner screen and hide game
//         showWinnerScreen();
//     }
// });

// Add winner announcement handling for viewers with proper screen hiding
socket.on('updateGame', data => {
    // ... existing code ...
    
    if (data.type === 'winnerAnnounced') {
        // Update winner display for viewers
        $('#winnerGroupNumber').textContent = data.winnerGroup;
        $('#winnerScore').textContent = data.winnerScore;
        
        // Populate final results table
        populateFinalResults();
        
        // Show winner screen and hide game screen
        showScreen('#screen-winner');
        $('#screen-game').classList.add('hidden');
        
        // Start animations
        startWinnerAnimations();
    }
    
    if (data.type === 'newGame') {
        // Reset game state for viewers
        scores.fill(0);
        shields.fill(false);
        snackEligible.fill(true);
        results.forEach(row => row.fill(null));
        selections.forEach(row => row.fill(null));
        
        currentQuestion = 0;
        currentTurnGroup = null;
        questionResolved = false;
        lastCorrectGroup = null;
        spinningForGroup = null;
        
        // Show instructions screen and hide all other screens
        showScreen('#screen-instructions');
        $('#screen-game').classList.add('hidden');
        $('#screen-winner').classList.add('hidden');
        $('#screen-results').classList.add('hidden');
        $('#screen-spin').classList.add('hidden');
    }
    if (data.type === 'viewResults') {
    // Update global arrays
        window.scores = data.scores ? [...data.scores] : Array(MAX_GROUPS).fill(0);
        window.results = data.results ? data.results.map(r => [...r]) : Array.from({length: TOTAL_QUESTIONS}, () => Array(MAX_GROUPS).fill(null));
        window.snackEligible = data.snackEligible ? [...data.snackEligible] : Array(MAX_GROUPS).fill(true);

        // Show results screen and hide winner screen
        showScreen('#screen-results');
        $('#screen-winner').classList.add('hidden');

        // Render only winner
        renderWinnerResults();
    }
});
// Track if turn has been set for each question
const turnSetForQuestion = Array(TOTAL_QUESTIONS).fill(false);

const turnInput = $('#turnInput');

if (turnInput) {
  // Allow only numbers 1-6
  turnInput.addEventListener('input', () => {
    let val = turnInput.value.replace(/\D/g,''); // remove non-digits
    if(val > MAX_GROUPS) val = MAX_GROUPS;
    turnInput.value = val;
  });
}

$('#btnSetTurn').addEventListener('click', ()=>{
    if(!isController) return;

    const v = Number(turnInput.value);
    if(!v || v < 1 || v > MAX_GROUPS){
        alert('Enter a valid group number 1–6.');
        return;
    }

    currentTurnGroup = v;
    turnSetForQuestion[currentQuestion] = true; // mark this question as having turn set
    applySavedChoiceColorsForGroup(currentTurnGroup);
    emitGameUpdate('setTurn', { group: currentTurnGroup });
});

// Update ensureTurn() to enforce per-question turn set
function ensureTurn(){
    if(!currentTurnGroup){
        alert('Set current turn → enter group number (1..6) and click Set.');
        return false;
    }
    if(!turnSetForQuestion[currentQuestion]){
        alert('Please click Set for this question before selecting an option.');
        return false;
    }
    return true;
}
