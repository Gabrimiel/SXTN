// Variable globale pour stocker la playlist actuelle et l'état
let currentPlaylist = [];
let currentIndex = -1;
let isPlaying = false;
let isAdmin = false; // Nouvelle variable pour le mode Admin
let syncInterval = null; // Variable globale pour stocker l'intervalle de synchronisation des Stems

// Code secret pour l'accès Admin
const ADMIN_CODE = "080216";

// Définition de la structure des Stems pour la convention de nommage
const STEM_SUFFIXES = {
    vocals: '_Vocals.mp3',
    bass: '_Bass.mp3',
    drums: '_Drums.mp3',
    other: '_Music.mp3' // Renommé 'other' en 'Music' pour correspondre à votre exemple
};

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
// GESTION MODE ADMIN (CORRECTION: cette fonction est essentielle et manquait)
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
        updateAdminUI();
    } else if (code !== null) {
        alert("Code incorrect.");
    }
}

function toggleSideMenu() {
    const menu = document.getElementById('side-menu');
    
    // N'ouvrir le menu que si l'Admin est actif, ou s'il est déjà ouvert
    if (!isAdmin && !menu.classList.contains('open')) {
        alert("Vous devez activer le mode Administrateur (ADMIN ACCESS) pour importer des morceaux.");
        return;
    }
    
    menu.classList.toggle('open');
}

// =========================================================
// GESTION LECTEUR ET PLAYLIST
// =========================================================

// LOGIQUE D'AJOUT DE MORCEAU (Utilise des chemins/URL au lieu de Base64)
async function addTrack() {
    if (!isAdmin) {
        alert("Seul l'Administrateur peut ajouter des morceaux.");
        return;
    }

    const title = document.getElementById('music-title').value || "Titre Inconnu";
    const artist = document.getElementById('music-description').value || "Artiste Inconnu";
    const album = document.getElementById('music-artist').value || "Album Inconnu";
    
    // CORRECTION: Chemin par défaut vers logo.png ou placeholder.png (si à la racine)
    const coverPath = document.getElementById('cover-path').value || "logo.png"; 
    
    const hasStems = document.getElementById('stem-mode-option').checked;

    let mainAudioPath = null;
    let stemBasePath = null; // Nom de base pour les stems (ex: audio/stems/Donda 2_Pablo)

    if (hasStems) {
        stemBasePath = document.getElementById('stem-base-path').value;
        if (!stemBasePath) {
             alert("Veuillez fournir le chemin de base du Stem (ex: audio/stems/Nom_du_morceau).");
             return;
        }
    } else {
        mainAudioPath = document.getElementById('audio-path').value;
        if (!mainAudioPath) {
            alert("Veuillez fournir le chemin du fichier Audio Principal.");
            return;
        }
    }

    const trackData = {
        title: title,
        artist: artist,
        album: album,
        cover: coverPath,          // URL de la pochette
        mainAudio: mainAudioPath,  // URL de l'audio principal
        stems: hasStems ? stemBasePath : null, // URL de base des Stems
    };

    try {
        await addTrackToDB(trackData);
        alert(`Morceau "${title}" ajouté à la bibliothèque.`);
        toggleSideMenu();
        await loadPlaylist();
    } catch (e) {
        alert("Impossible d'ajouter le morceau à la base de données locale.");
        console.error("Erreur d'ajout de piste:", e);
    }
}


// Logique pour charger la playlist 
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
        displayTracklist(null);
    }
    
    updateAdminUI(); 
}

// Logique pour mettre à jour l'interface Admin 
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

// Logique d'affichage des albums 
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

let activeAlbum = null;

// Logique d'affichage de la liste des morceaux 
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

        albumTracks.forEach((track) => {
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
                    <span style="font-size: 0.8em; color: #777;">${playText}</span>
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

// Logique de suppression de morceau 
async function deleteTrack(trackId) {
    if (!isAdmin) {
        alert("Seul l'Administrateur peut supprimer des morceaux.");
        return;
    }
    
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce morceau ?")) {
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

// Logique de lecture d'un morceau (Mise à jour pour les URL)
function playTrack(index) {
    currentIndex = index;
    const track = currentPlaylist[currentIndex];

    if (!track) return;

    stopPlayback();

    const audioPlayer = document.getElementById('audio-player');
    const isStemMode = !!track.stems;
    const playerToUse = isStemMode ? document.getElementById('stem-vocals') : audioPlayer;


    document.getElementById('stem-controls').style.display = isStemMode ? 'flex' : 'none';
    document.getElementById('delete-track-button').style.display = isAdmin ? 'block' : 'none';

    document.getElementById('current-cover-footer').src = track.cover;
    document.getElementById('current-title-footer').textContent = track.title;
    document.getElementById('current-artist-footer').textContent = `${track.artist} - Album: ${track.album}`;

    if (isStemMode) {
        // CONVENTION DE NOMMAGE : on reconstruit les chemins des Stems
        const stemBasePath = track.stems;
        document.getElementById('stem-vocals').src = stemBasePath + STEM_SUFFIXES.vocals;
        document.getElementById('stem-bass').src = stemBasePath + STEM_SUFFIXES.bass;
        document.getElementById('stem-drums').src = stemBasePath + STEM_SUFFIXES.drums;
        document.getElementById('stem-other').src = stemBasePath + STEM_SUFFIXES.other;
        setupStemButtons();
    } else {
        audioPlayer.src = track.mainAudio;
    }
    
    // Le onloadedmetadata garantit que le fichier est prêt avant de lancer la lecture synchronisée
    playerToUse.onloadedmetadata = () => {
        // Réinitialiser la barre de progression au cas où la durée change
        const duration = playerToUse.duration;
        document.getElementById('progress-bar').max = duration; 
        document.getElementById('duration-display').textContent = formatTime(duration);
        
        playAllPlayers();
    };
    
    // Si le fichier est déjà chargé (cache), on peut lancer directement
    if (playerToUse.readyState >= 2) { // 2 = HAVE_CURRENT_DATA
        playAllPlayers();
    }


    playerToUse.onended = playNext;
    displayTracklist(track.album);
}

// Fonction utilitaire pour le formatage du temps (pour la barre de progression)
function formatTime(time) {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// Mise à jour de la barre de progression (utilise le player Vocal pour la durée en mode Stem)
setInterval(() => {
    if (isPlaying) {
        const track = currentPlaylist[currentIndex];
        const isStemMode = track && track.stems;
        const player = isStemMode ? document.getElementById('stem-vocals') : document.getElementById('audio-player');
        
        if (!isNaN(player.duration)) {
             document.getElementById('progress-bar').value = player.currentTime;
             document.getElementById('time-display').textContent = formatTime(player.currentTime);
        }
    }
}, 100);


// Logique pour arrêter la lecture 
function stopPlayback() {
    isPlaying = false;
    document.getElementById('play-pause-button').textContent = '▶️';
    document.getElementById('audio-player').pause();
    
    document.getElementById('stem-vocals').pause();
    document.getElementById('stem-bass').pause();
    document.getElementById('stem-drums').pause();
    document.getElementById('stem-other').pause();
    
    stopStemSynchronization(); 

    document.querySelectorAll('.stem-player').forEach(player => player.currentTime = 0);
    document.getElementById('audio-player').currentTime = 0;
    
    document.getElementById('progress-bar').value = 0;
    document.getElementById('time-display').textContent = formatTime(0);
}


// Logique de pause/reprise 
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
            stopStemSynchronization(); 
        }

    } else {
        player.play();
        document.getElementById('play-pause-button').textContent = '⏸️';
        isPlaying = true;
        
        if (isStemMode) {
            document.getElementById('stem-bass').play();
            document.getElementById('stem-drums').play();
            document.getElementById('stem-other').play();
            startStemSynchronization(); 
        }
    }
}

/**
 * LANCE TOUS LES PLAYERS EN SYNCHRONISATION (Correction de bug stems initial)
 */
function playAllPlayers() {
    const track = currentPlaylist[currentIndex];
    const isStemMode = track && track.stems;
    const player = isStemMode ? document.getElementById('stem-vocals') : document.getElementById('audio-player');

    // 1. Démarrer la lecture du joueur principal (ou vocal)
    player.play();
    document.getElementById('play-pause-button').textContent = '⏸️';
    isPlaying = true;

    // 2. Si nous sommes en mode Stem, synchroniser les autres pistes avant de les lancer
    if (isStemMode) {
        const otherStems = [
            document.getElementById('stem-bass'),
            document.getElementById('stem-drums'),
            document.getElementById('stem-other')
        ];
        
        const mainTime = player.currentTime;

        otherStems.forEach(stemPlayer => {
            stemPlayer.currentTime = mainTime; 
            stemPlayer.play();
        });
        
        startStemSynchronization(); // Démarrage du mécanisme anti-dérive
    }
}

// FONCTIONS ANTI-DÉRIVE (ANTI-DRIFT) - Maintenues pour la synchronisation continue
function startStemSynchronization() {
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    
    const mainPlayer = document.getElementById('stem-vocals');
    const otherStems = [
        document.getElementById('stem-bass'),
        document.getElementById('stem-drums'),
        document.getElementById('stem-other')
    ];

    syncInterval = setInterval(() => {
        if (!isPlaying || mainPlayer.paused) {
            clearInterval(syncInterval);
            syncInterval = null;
            return;
        }

        const mainTime = mainPlayer.currentTime;
        
        otherStems.forEach(stemPlayer => {
            const timeDifference = Math.abs(stemPlayer.currentTime - mainTime);
            
            // Si le décalage est supérieur à 50 millisecondes (0.05 seconde)
            if (timeDifference > 0.05) { 
                stemPlayer.currentTime = mainTime;
            }
        });

    }, 250); // Vérification 4 fois par seconde
}

function stopStemSynchronization() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
}
// FIN DES FONCTIONS ANTI-DÉRIVE


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

// FONCTION SEEK (AVANCE RAPIDE) - Simplifiée pour un seek rapide
function seekForward(seconds) {
    if (currentIndex === -1) return;
    
    const track = currentPlaylist[currentIndex];
    const isStemMode = track && track.stems;
    const player = isStemMode ? document.getElementById('stem-vocals') : document.getElementById('audio-player');
    
    const newTime = player.currentTime + seconds;
    player.currentTime = newTime;
    
    if (isStemMode) {
        document.getElementById('stem-bass').currentTime = newTime;
        document.getElementById('stem-drums').currentTime = newTime;
        document.getElementById('stem-other').currentTime = newTime;
    }
}

// FONCTION SEEK (RETOUR RAPIDE) - Simplifiée pour un seek rapide
function seekBackward(seconds) {
    if (currentIndex === -1) return;

    const track = currentPlaylist[currentIndex];
    const isStemMode = track && track.stems;
    const player = isStemMode ? document.getElementById('stem-vocals') : document.getElementById('audio-player');

    const newTime = player.currentTime - seconds;
    player.currentTime = newTime;

    if (isStemMode) {
        document.getElementById('stem-bass').currentTime = newTime;
        document.getElementById('stem-drums').currentTime = newTime;
        document.getElementById('stem-other').currentTime = newTime;
    }
}


// BARRE DE PROGRESSION - Simplifiée pour un seek rapide
document.getElementById('progress-bar').addEventListener('input', () => {
    if (currentIndex === -1) return;
    
    const newTime = document.getElementById('progress-bar').value;
    const track = currentPlaylist[currentIndex];

    if (track) {
        const isStemMode = track.stems;
        const mainPlayer = document.getElementById('audio-player');
        
        if (isStemMode) {
            // Mettre à jour le temps de lecture de TOUS les players Stems
            document.getElementById('stem-vocals').currentTime = newTime;
            document.getElementById('stem-bass').currentTime = newTime;
            document.getElementById('stem-drums').currentTime = newTime;
            document.getElementById('stem-other').currentTime = newTime;
        } else {
            // Sinon, mettre à jour le player principal
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
        other: 'MUSIC' // Affichage de 'MUSIC' pour le Stem 'other'
    };

    Object.keys(stemNames).forEach(stemId => {
        const playerElement = document.getElementById(`stem-${stemId}`);
        const button = document.createElement('button');
        button.textContent = stemNames[stemId];
        button.className = 'stem-mute-button active-stem';
        button.setAttribute('data-stem-id', stemId);
        
        playerElement.muted = false;

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
