// Variable globale pour stocker la playlist actuelle et l'état
let currentPlaylist = [];
let currentIndex = -1;
let isPlaying = false;
let isAdmin = false; // Nouvelle variable pour le mode Admin
let activeAlbum = null; // Pour maintenir l'album affiché

// Code secret pour l'accès Admin
const ADMIN_CODE = "080216";

// =========================================================
// GESTION IndexedDB (Base de données locale pour les Morceaux - Global)
// =========================================================

const DB_NAME = 'SXTNDatabase';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("Erreur IndexedDB:", event.target.errorCode);
            reject(event.target.errorCode);
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                // Création du store
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

async function addTrackToDB(trackData) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const request = store.add(trackData);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => {
            console.error("Erreur d'ajout de morceau:", event.target.error);
            reject(event.target.error);
        };
    });
}

async function readAllTracksFromDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

async function deleteTrackFromDB(trackId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const request = store.delete(trackId);

        request.onsuccess = () => resolve(true);
        request.onerror = (event) => {
            console.error("Erreur de suppression:", event.target.error);
            reject(event.target.error);
        };
    });
}

// =========================================================
// GESTION MODE ADMIN & MENU
// =========================================================

function showAdminPrompt() {
    if (isAdmin) {
        alert("Mode Administrateur déjà activé.");
        return;
    }
    const code = prompt("Entrez le code Admin pour accéder à l'importation de morceaux :");

    if (code === ADMIN_CODE) {
        isAdmin = true;
        document.getElementById('admin-access-btn').textContent = "ADMIN (Activé)";
        alert("Mode Administrateur activé ! Vous pouvez maintenant utiliser le menu ☰ pour importer des morceaux.");
        updateAdminUI(); // Met à jour les éléments visibles
    } else if (code !== null) {
        alert("Code incorrect.");
    }
}

function toggleSideMenu() {
    const menu = document.getElementById('side-menu');
    
    if (!isAdmin && !menu.classList.contains('open')) {
        alert("Vous devez activer le mode Administrateur (ADMIN ACCESS) pour importer des morceaux.");
        return;
    }
    
    menu.classList.toggle('open');
}

// =========================================================
// GESTION LECTEUR ET PLAYLIST
// =========================================================

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

function getCurrentPlayer() {
    if (currentPlaylist[currentIndex] && currentPlaylist[currentIndex].stems) {
        return document.getElementById('stem-vocals');
    }
    return document.getElementById('audio-player');
}


async function addTrack() {
    if (!isAdmin) {
        alert("Seul l'Administrateur peut ajouter des morceaux.");
        return;
    }

    const title = document.getElementById('music-title').value || "Titre Inconnu";
    const artist = document.getElementById('music-description').value || "Artiste Inconnu";
    const album = document.getElementById('music-artist').value || "Album Inconnu";
    const coverFile = document.getElementById('cover-input').files[0];
    const audioFile = document.getElementById('audio-input').files[0];
    const hasStems = document.getElementById('stem-mode-option').checked;

    let coverBase64 = "placeholder.png";
    let mainAudioBase64 = null;
    let stemData = {};

    // 1. Gérer la pochette
    if (coverFile) {
        try {
            coverBase64 = await readFileAsDataURL(coverFile);
        } catch (e) {
            alert("Erreur de lecture de l'image de couverture.");
            return;
        }
    }

    // 2. Gérer les fichiers audio
    if (hasStems) {
        const vocalsFile = document.getElementById('stem-vocals-input').files[0];
        const bassFile = document.getElementById('stem-bass-input').files[0];
        const drumsFile = document.getElementById('stem-drums-input').files[0];
        const otherFile = document.getElementById('stem-other-input').files[0];

        if (!vocalsFile || !bassFile || !drumsFile || !otherFile) {
             alert("Veuillez fournir les 4 fichiers Stems (Vocals, Bass, Drums, Other) pour le mode Stem.");
             return;
        }

        try {
            stemData.vocals = await readFileAsDataURL(vocalsFile);
            stemData.bass = await readFileAsDataURL(bassFile);
            stemData.drums = await readFileAsDataURL(drumsFile);
            stemData.other = await readFileAsDataURL(otherFile);
        } catch (e) {
            alert("Erreur de lecture d'un fichier Stem.");
            return;
        }
    } else {
        if (!audioFile) {
            alert("Veuillez fournir le fichier Audio Principal.");
            return;
        }
        try {
            mainAudioBase64 = await readFileAsDataURL(audioFile);
        } catch (e) {
            alert("Erreur de lecture du fichier Audio Principal.");
            return;
        }
    }

    const trackData = {
        title: title,
        artist: artist,
        album: album,
        cover: coverBase64,
        mainAudio: mainAudioBase64,
        stems: hasStems ? stemData : null,
    };

    try {
        await addTrackToDB(trackData);
        alert(`Morceau "${title}" ajouté à la bibliothèque.`);
        toggleSideMenu(); // Ferme le menu
        await loadPlaylist(); // Recharge et affiche la nouvelle playlist
    } catch (e) {
        alert("Impossible d'ajouter le morceau à la base de données locale.");
        console.error("Erreur d'ajout de piste:", e);
    }
}

async function loadPlaylist() {
    const allTracks = await readAllTracksFromDB();  
    currentPlaylist = allTracks; 

    const libraryMain = document.getElementById('library-main');
    if (currentPlaylist.length === 0) {
        libraryMain.innerHTML = `
            <h2>LIBRARY</h2>
            <div id="empty-library-message" style="padding: 20px; background: #eee; border-radius: 8px; text-align: center;">
                Votre bibliothèque est vide. ${isAdmin ? 'Importez des morceaux via le menu ☰.' : 'L\'Administrateur doit importer des morceaux.'}
            </div>
            <div id="album-carousel"></div>
            <div id="tracklist-container"><ul id="tracklist-ul"></ul></div>
        `;
    } else {
        if (!document.getElementById('album-carousel')) {
             libraryMain.innerHTML = `
                <h2>LIBRARY</h2>
                <div id="album-carousel"></div>
                <div id="tracklist-container"><ul id="tracklist-ul"></ul></div>
            `;
        }
        displayAlbums();
        displayTracklist(activeAlbum);
    }
    
    updateAdminUI();  
}

function updateAdminUI() {
    document.getElementById('delete-track-button').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('admin-access-btn').textContent = isAdmin ? "ADMIN (Activé)" : "ADMIN ACCESS";

    const emptyMessage = document.getElementById('empty-library-message');
    if (emptyMessage) {
        emptyMessage.textContent = isAdmin 
            ? 'Votre bibliothèque est vide. Importez des morceaux via le menu ☰.' 
            : 'Votre bibliothèque est vide. L\'Administrateur doit importer des morceaux.';
    }
}

function displayAlbums() {
    const carousel = document.getElementById('album-carousel');
    if (!carousel) return; 
    carousel.innerHTML = '';
    
    const albums = currentPlaylist.reduce((acc, track) => {
        if (!acc[track.album]) {
            acc[track.album] = {
                album: track.album,
                artist: track.artist,
                cover: track.cover,
                tracks: []
            };
        }
        acc[track.album].tracks.push(track);
        return acc;
    }, {});

    Object.values(albums).forEach(albumData => {
        const card = document.createElement('div');
        card.className = 'album-card';
        card.setAttribute('data-album', albumData.album);
        card.onclick = () => displayTracklist(albumData.album);

        card.innerHTML = `
            <img src="${albumData.cover}" alt="${albumData.album}" class="album-cover-img">
            <div class="album-card-title">${albumData.album}</div>
            <div class="album-card-artist">${albumData.artist}</div>
        `;
        carousel.appendChild(card);
    });
}


function displayTracklist(albumName) {
    const tracklistUl = document.getElementById('tracklist-ul');
    if (!tracklistUl) return;
    tracklistUl.innerHTML = '';
    
    document.querySelectorAll('.album-card').forEach(card => {
        card.classList.remove('active-card');
    });

    if (albumName) {
        activeAlbum = albumName;
        const albumTracks = currentPlaylist.filter(track => track.album === albumName);
        
        const activeCard = document.querySelector(`.album-card[data-album="${albumName}"]`);
        if (activeCard) {
            activeCard.classList.add('active-card');
        }

        albumTracks.forEach((track, index) => {
            const globalIndex = currentPlaylist.findIndex(t => t.id === track.id);

            const li = document.createElement('li');
            li.className = `track-item ${globalIndex === currentIndex ? 'active-track' : ''}`;
            li.setAttribute('data-index', globalIndex);
            
            li.onclick = () => playTrack(globalIndex);

            const playText = track.stems ? ' [STEMS]' : '';

            li.innerHTML = `
                <div class="track-item-info">
                    <img src="${track.cover}" alt="Cover" class="track-item-cover">
                    <span class="track-item-title">${track.title}</span>
                    <span style="font-size: 0.8em; color: ${globalIndex === currentIndex ? 'white' : '#777'};">${playText}</span>
                </div>
                <div class="track-controls">
                     ${isAdmin ? `<button onclick="event.stopPropagation(); deleteTrack(${track.id})" class="track-delete-button">🗑️</button>` : ''}
                </div>
            `;
            tracklistUl.appendChild(li);
        });
    } else {
        activeAlbum = null;
        tracklistUl.innerHTML = '<li>Sélectionnez un album ci-dessus.</li>';
    }
}

async function deleteTrack(trackId) {
    if (!isAdmin) {
        alert("Seul l'Administrateur peut supprimer des morceaux.");
        return;
    }
    
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce morceau ? (Cette action est permanente)")) {
        return;
    }

    try {
        await deleteTrackFromDB(trackId);
        alert("Morceau supprimé.");
        
        if (currentPlaylist[currentIndex] && currentPlaylist[currentIndex].id === trackId) {
            stopPlayback();
        }

        await loadPlaylist(); 
        displayTracklist(activeAlbum); 
    } catch (e) {
        alert("Erreur lors de la suppression du morceau.");
        console.error(e);
    }
}

function playTrack(index) {
    currentIndex = index;
    const track = currentPlaylist[currentIndex];

    if (!track) return;

    stopPlayback();

    const audioPlayer = document.getElementById('audio-player');
    const playerToUse = track.stems ? document.getElementById('stem-vocals') : audioPlayer;
    const isStemMode = !!track.stems;

    document.getElementById('stem-controls').style.display = isStemMode ? 'flex' : 'none';
    document.getElementById('delete-track-button').style.display = isAdmin ? 'block' : 'none';

    document.getElementById('current-cover-footer').src = track.cover;
    document.getElementById('current-title-footer').textContent = track.title;
    document.getElementById('current-artist-footer').textContent = `${track.artist} - Album: ${track.album}`;

    if (isStemMode) {
        document.getElementById('stem-vocals').src = track.stems.vocals;
        document.getElementById('stem-bass').src = track.stems.bass;
        document.getElementById('stem-drums').src = track.stems.drums;
        document.getElementById('stem-other').src = track.stems.other;
        setupStemButtons();
        playerToUse.onloadeddata = playAllPlayers;
    } else {
        audioPlayer.src = track.mainAudio;
        playerToUse.onloadeddata = playAllPlayers;
    }
    
    playerToUse.onended = playNext;
    displayTracklist(track.album);
}

function stopPlayback() {
    isPlaying = false;
    document.getElementById('play-pause-button').textContent = '▶️';
    document.getElementById('audio-player').pause();
    document.getElementById('stem-vocals').pause();
    document.getElementById('stem-bass').pause();
    document.getElementById('stem-drums').pause();
    document.getElementById('stem-other').pause();
    document.querySelectorAll('.stem-player').forEach(player => player.currentTime = 0);
    document.getElementById('audio-player').currentTime = 0;
}


function togglePlayPause() {
     if (currentIndex === -1 || currentPlaylist.length === 0) return;
     
    const track = currentPlaylist[currentIndex];
    const isStemMode = track && track.stems;
    const player = isStemMode ? document.getElementById('stem-vocals') : document.getElementById('audio-player');
    
    if (isPlaying) {
        player.pause();
        document.getElementById('play-pause-button').textContent = '▶️';
        isPlaying = false;
        
        if (isStemMode) {
            document.getElementById('stem-bass').pause();
            document.getElementById('stem-drums').pause();
            document.getElementById('stem-other').pause();
        }

    } else {
        player.play();
        document.getElementById('play-pause-button').textContent = '⏸️';
        isPlaying = true;
        
        if (isStemMode) {
            document.getElementById('stem-bass').play();
            document.getElementById('stem-drums').play();
            document.getElementById('stem-other').play();
        }
    }
}

function playAllPlayers() {
    const track = currentPlaylist[currentIndex];
    const isStemMode = track && track.stems;
    const player = isStemMode ? document.getElementById('stem-vocals') : document.getElementById('audio-player');

    player.play();
    document.getElementById('play-pause-button').textContent = '⏸️';
    isPlaying = true;

    if (isStemMode) {
        document.getElementById('stem-bass').play();
        document.getElementById('stem-drums').play();
        document.getElementById('stem-other').play();
    }
}


function playNext() {
    if (currentIndex < currentPlaylist.length - 1) {
        playTrack(currentIndex + 1);
    } else if (currentPlaylist.length > 0) {
        playTrack(0);
    }
}

function playPrevious() {
    if (currentIndex > 0) {
        playTrack(currentIndex - 1);
    } else if (currentPlaylist.length > 0) {
        playTrack(currentPlaylist.length - 1);
    }
}

function seekForward(seconds) {
    if (currentIndex === -1) return;
    
    const track = currentPlaylist[currentIndex];
    const isStemMode = track && track.stems;
    const player = isStemMode ? document.getElementById('stem-vocals') : document.getElementById('audio-player');
    
    player.currentTime += seconds;
    
    if (isStemMode) {
        document.getElementById('stem-bass').currentTime = player.currentTime;
        document.getElementById('stem-drums').currentTime = player.currentTime;
        document.getElementById('stem-other').currentTime = player.currentTime;
    }
}

function seekBackward(seconds) {
    if (currentIndex === -1) return;

    const track = currentPlaylist[currentIndex];
    const isStemMode = track && track.stems;
    const player = isStemMode ? document.getElementById('stem-vocals') : document.getElementById('audio-player');

    player.currentTime -= seconds;

    if (isStemMode) {
        document.getElementById('stem-bass').currentTime = player.currentTime;
        document.getElementById('stem-drums').currentTime = player.currentTime;
        document.getElementById('stem-other').currentTime = player.currentTime;
    }
}

document.getElementById('progress-bar').addEventListener('input', () => {
    if (currentIndex === -1) return;
    
    const newTime = document.getElementById('progress-bar').value;
    const track = currentPlaylist[currentIndex];

    if (track) {
        const mainPlayer = document.getElementById('audio-player');
        
        if (track.stems) {
            document.getElementById('stem-vocals').currentTime = newTime;
            document.getElementById('stem-bass').currentTime = newTime;
            document.getElementById('stem-drums').currentTime = newTime;
            document.getElementById('stem-other').currentTime = newTime;
        } else {
            mainPlayer.currentTime = newTime;
        }
    }
});


function setupStemButtons() {
    const stemContainer = document.getElementById('stem-container');
    stemContainer.innerHTML = '';
    const stemNames = {
        vocals: 'VOIX',
        bass: 'BASS',
        drums: 'DRUMS',
        other: 'OTHER'
    };

    Object.keys(stemNames).forEach(stemId => {
        const playerElement = document.getElementById(`stem-${stemId}`);
        const button = document.createElement('button');
        button.textContent = stemNames[stemId];
        button.className = 'stem-mute-button active-stem';
        button.setAttribute('data-stem-id', stemId);
        playerElement.muted = false; // Réinitialiser le mute

        button.onclick = () => {
            if (playerElement.muted) {
                playerElement.muted = false;
                button.classList.add('active-stem');
            } else {
                playerElement.muted = true;
                button.classList.remove('active-stem');
            }
        };
        stemContainer.appendChild(button);
    });
}

// Lancement initial de la playlist au chargement de la page
document.addEventListener('DOMContentLoaded', loadPlaylist);
