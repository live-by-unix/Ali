// THEME TOGGLE
const themeToggle = document.getElementById("themeToggle");
themeToggle.onclick = () => {
  const html = document.documentElement;
  const theme = html.getAttribute("data-theme");
  const next = theme === "light" ? "dark" : "light";
  html.setAttribute("data-theme", next);
  themeToggle.textContent = next === "light" ? "🌙" : "☀️";
};

// PLAYLIST CONTROLS
const playlistPrev = document.getElementById("playlistPrev");
const playlistPlayPause = document.getElementById("playlistPlayPause");
const playlistNext = document.getElementById("playlistNext");

let db;
let tracks = []; // {id, name, buffer, audio, circle, canvas}
let currentIndex = -1;

// INDEXEDDB SETUP
const request = indexedDB.open("AliAudioDB", 1);

request.onupgradeneeded = e => {
  db = e.target.result;
  if (!db.objectStoreNames.contains("tracks")) {
    db.createObjectStore("tracks", { keyPath: "id", autoIncrement: true });
  }
};

request.onsuccess = e => {
  db = e.target.result;
  loadTracks();
};

request.onerror = e => {
  console.error("IndexedDB error", e);
};

// LOAD TRACKS
function loadTracks() {
  const tx = db.transaction("tracks", "readonly");
  const store = tx.objectStore("tracks");
  const req = store.getAll();
  req.onsuccess = () => {
    req.result.forEach(t => addTrackToUI(t));
  };
}

// FILE HANDLING
const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");

dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", e => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", e => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", e => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  handleFiles(e.dataTransfer.files);
});

fileInput.onchange = e => handleFiles(e.target.files);

function handleFiles(fileList) {
  [...fileList].forEach(file => {
    if (!file.type.startsWith("audio/")) return;
    const reader = new FileReader();
    reader.onload = () => saveTrack(file.name, reader.result);
    reader.readAsArrayBuffer(file);
  });
}

function saveTrack(name, buffer) {
  const tx = db.transaction("tracks", "readwrite");
  const store = tx.objectStore("tracks");
  const req = store.add({ name, buffer });
  req.onsuccess = () => {
    const id = req.result;
    addTrackToUI({ id, name, buffer });
  };
}

// DELETE TRACK
function deleteTrack(id) {
  const tx = db.transaction("tracks", "readwrite");
  const store = tx.objectStore("tracks");
  store.delete(id);
  tx.oncomplete = () => {
    const idx = tracks.findIndex(t => t.id === id);
    if (idx !== -1) {
      const t = tracks[idx];
      if (t.audio) t.audio.pause();
      t.circle.parentElement.remove();
      tracks.splice(idx, 1);
      if (currentIndex === idx) {
        currentIndex = -1;
        playlistPlayPause.textContent = "▶";
      } else if (currentIndex > idx) {
        currentIndex--;
      }
    }
  };
}

// UI + AUDIO + WAVEFORM
const tracksContainer = document.getElementById("tracks");

function addTrackToUI(trackData) {
  const wrapper = document.createElement("div");
  wrapper.className = "track";

  const circle = document.createElement("div");
  circle.className = "track-circle";

  const nameEl = document.createElement("div");
  nameEl.className = "track-name";
  nameEl.textContent = trackData.name;

  const delBtn = document.createElement("button");
  delBtn.className = "track-delete";
  delBtn.textContent = "✕";
  delBtn.onclick = e => {
    e.stopPropagation();
    deleteTrack(trackData.id);
  };

  const canvas = document.createElement("canvas");
  canvas.className = "waveform";
  canvas.width = 150;
  canvas.height = 40;

  circle.appendChild(delBtn);
  wrapper.appendChild(circle);
  wrapper.appendChild(nameEl);
  wrapper.appendChild(canvas);
  tracksContainer.appendChild(wrapper);

  const audio = new Audio();
  audio.src = URL.createObjectURL(new Blob([trackData.buffer]));
  audio.loop = true;
  let volume = 0.6;
  audio.volume = volume;

  circle.style.transform = `rotate(${volume * 360}deg)`;

  circle.onclick = () => {
    const idx = tracks.findIndex(t => t.id === trackData.id);
    if (idx === -1) return;
    if (currentIndex !== idx) {
      switchToTrack(idx, true);
    } else {
      toggleCurrentPlay();
    }
  };

  circle.onwheel = e => {
    e.preventDefault();
    volume = Math.min(1, Math.max(0, volume - e.deltaY * 0.001));
    audio.volume = volume;
    circle.style.transform = `rotate(${volume * 360}deg)`;
  };

  const trackObj = { id: trackData.id, name: trackData.name, buffer: trackData.buffer, audio, circle, canvas };
  tracks.push(trackObj);
  drawWaveform(trackObj);
}

// WAVEFORM (simple static)
function drawWaveform(track) {
  const ctx = track.canvas.getContext("2d");
  const w = track.canvas.width;
  const h = track.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 1.5;

  const buffer = new Uint8Array(128);
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = Math.floor(80 + 40 * Math.sin(i / 6));
  }

  ctx.beginPath();
  for (let i = 0; i < buffer.length; i++) {
    const x = (i / (buffer.length - 1)) * w;
    const v = buffer[i] / 255;
    const y = h / 2 + (v - 0.5) * (h - 6);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// PLAYLIST LOGIC
function switchToTrack(idx, autoPlay) {
  if (idx < 0 || idx >= tracks.length) return;
  if (currentIndex !== -1) {
    const prev = tracks[currentIndex];
    prev.audio.pause();
    prev.circle.classList.remove("playing");
  }
  currentIndex = idx;
  const cur = tracks[currentIndex];
  if (autoPlay) cur.audio.play();
  cur.circle.classList.add("playing");
  playlistPlayPause.textContent = cur.audio.paused ? "▶" : "⏸";
}

function toggleCurrentPlay() {
  if (currentIndex === -1) {
    if (tracks.length === 0) return;
    switchToTrack(0, true);
    return;
  }
  const cur = tracks[currentIndex];
  if (cur.audio.paused) {
    cur.audio.play();
    cur.circle.classList.add("playing");
    playlistPlayPause.textContent = "⏸";
  } else {
    cur.audio.pause();
    cur.circle.classList.remove("playing");
    playlistPlayPause.textContent = "▶";
  }
}

playlistPlayPause.onclick = () => toggleCurrentPlay();

playlistNext.onclick = () => {
  if (tracks.length === 0) return;
  if (currentIndex === -1) switchToTrack(0, true);
  else switchToTrack((currentIndex + 1) % tracks.length, true);
};

playlistPrev.onclick = () => {
  if (tracks.length === 0) return;
  if (currentIndex === -1) switchToTrack(0, true);
  else switchToTrack((currentIndex - 1 + tracks.length) % tracks.length, true);
};
