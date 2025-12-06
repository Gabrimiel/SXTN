// Variable globale pour stocker la playlist actuelle et l'utilisateur
let currentPlaylist = [];
let currentIndex = -1;
let isPlaying = false;
let currentUser = null; 

// =========================================================
// GESTION IndexedDB (Base de données locale pour les Morceaux)
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
                // Création du store avec 'id' comme clé auto-incrémentée
                const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                // Ajout d'un index pour filtrer les morceaux par utilisateur
                objectStore.createIndex("user", "user", { unique: false });
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
// AUTHENTIFICATION FIREBASE (Centralisée, pour la connexion)
// =========================================================

function showRegister() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
}

function showLogin() {
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
}

async function registerUser() {
    // Firebase requiert un format email, nous le simulons pour le Nom d'utilisateur
    const username = document.getElementById('register-username').value.trim();
    // Nous ajoutons un suffixe pour respecter le format email requis par Firebase Auth
    const email = username + "@sxtn.com"; 
    const password = document.getElementById('register-password').value;

    if (username === "" || password.length < 6) {
        alert("Le nom d'utilisateur est requis et le mot de passe doit contenir au moins 6 caractères.");
        return;
    }

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        alert(`Compte ${username} créé avec succès ! Vous êtes connecté.`);
        currentUser = username;
        // La session est gérée par Firebase, mais nous mettons à jour le front-end
        
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        await loadPlaylist(); 
    } catch (error) {
        console.error("Erreur d'enregistrement Firebase:", error);
        alert(`Erreur lors de la création du compte : ${error.message}`);
    }
}

async function loginUser() {
    const username = document.getElementById('login-username').value.trim();
    const email = username + "@sxtn.com"; 
    const password = document.getElementById('login-password').value;

    if (username === "" || !password) {
        alert("Veuillez remplir tous les champs.");
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, password);
        // Firebase gère l'état de connexion. loadPlaylist sera appelée via onAuthStateChanged
    } catch (error) {
        console.error("Erreur de connexion Firebase:", error);
        alert("Identifiants incorrects ou utilisateur non trouvé. Vérifiez le nom d'utilisateur et le Mot de passe.");
    }
}

// =========================================================
// GESTION LECTEUR ET PLAYLIST
// =========================================================

function toggleSideMenu() {
    const menu = document.getElementById('side-menu');
    menu.classList.toggle('open');
}

// Fonction utilitaire pour lire un fichier en Base64
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

// Récupère l'élément AudioPlayer principal ou le Vocal Stem Player
function getCurrentPlayer() {
    // Si des stems sont en cours de lecture, on utilise le vocal player comme maître
    if (currentPlaylist[currentIndex] && currentPlaylist[currentIndex].stems) {
        return document.getElementById('stem-vocals');
    }
    return document.getElementById('audio-player');
}


async function addTrack() {
    // Vérification de l'utilisateur connecté
    if (!currentUser) {
        alert("Veuillez vous connecter avant d'ajouter un morceau.");
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
        user: currentUser // Assurez-vous que l'utilisateur est défini
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
    // 1. Gérer l'état de l'authentification Firebase
    // Cette fonction s'exécute quand l'état d'auth change (connexion/déconnexion)
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            // Utilisateur connecté via Firebase
            // L'email est au format "username@sxtn.com"
            currentUser = user.email.split('@')[0]; 

            document.getElementById('auth-container').style.display = 'none';
            document.getElementById('app-container').style.display = 'flex';

            // 2. Charger les morceaux spécifiques à cet utilisateur depuis IndexedDB
            const allTracks = await readAllTracksFromDB(); 
            // Nous filtrons les morceaux stockés localement par l'utilisateur connecté
            const userTracks = allTracks.filter(track => track.user === currentUser);
            currentPlaylist = userTracks; 

            displayAlbums();
            displayTracklist(null); 
            
        } else {
            // Utilisateur déconnecté ou non trouvé
            currentUser = null;
            currentPlaylist = [];
            document.getElementById('auth-container').style.display = 'block';
            document.getElementById('app-container').style.display = 'none';
        }
    });
}

function displayAlbums() {
    const carousel = document.getElementById('album-carousel');
    carousel.innerHTML = '';
    
    // Regrouper les morceaux par album
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

    // Afficher chaque album
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

function displayTracklist(albumName) {
    const tracklistUl = document.getElementById('tracklist-ul');
    tracklistUl.innerHTML = '';
    
    // Mettre à jour la carte active
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
            
            // Le bouton PLAY/PAUSE est géré dans le li pour toute la ligne
            li.onclick = () => playTrack(globalIndex);

            const playText = track.stems ? ' [STEMS]' : '';

            li.innerHTML = `
                <div class="track-item-info">
                    <img src="${track.cover}" alt="Cover" class="track-item-cover">
                    <span class="track-item-title">${track.title}</span>
                    <span style="font-size: 0.8em; color: #777;">${playText}</span>
                </div>
                <div class="track-controls">
                     <button onclick="event.stopPropagation(); deleteTrack(${track.id})" class="track-delete-button">🗑️</button>
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
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce morceau ?")) {
        return;
    }

    try {
        await deleteTrackFromDB(trackId);
        alert("Morceau supprimé.");
        
        // Réinitialiser le player si le morceau en cours est supprimé
        if (currentPlaylist[currentIndex] && currentPlaylist[currentIndex].id === trackId) {
            stopPlayback();
        }

        await loadPlaylist(); // Recharge tout
        displayTracklist(activeAlbum); // Affiche la tracklist actuelle (qui sera mise à jour)
    } catch (e) {
        alert("Erreur lors de la suppression du morceau.");
        console.error(e);
    }
}


function playTrack(index) {
    if (index === currentIndex && isPlaying) {
        togglePlayPause(); // Pause si c'est déjà en cours
        return;
    }

    currentIndex = index;
    const track = currentPlaylist[currentIndex];

    if (!track) return;

    // Arrêter tous les lecteurs (main et stems)
    stopPlayback();

    // Configurer le player principal (audio-player)
    const audioPlayer = document.getElementById('audio-player');
    const playerToUse = track.stems ? document.getElementById('stem-vocals') : audioPlayer;
    const isStemMode = !!track.stems;

    // Cacher ou afficher les contrôles Stems
    document.getElementById('stem-controls').style.display = isStemMode ? 'flex' : 'none';
    document.getElementById('delete-track-button').style.display = 'block';

    // Mise à jour de l'affichage du pied de page
    document.getElementById('current-cover-footer').src = track.cover;
    document.getElementById('current-title-footer').textContent = track.title;
    document.getElementById('current-artist-footer').textContent = `${track.artist} - Album: ${track.album}`;


    if (isStemMode) {
        // Charger tous les stems
        document.getElementById('stem-vocals').src = track.stems.vocals;
        document.getElementById('stem-bass').src = track.stems.bass;
        document.getElementById('stem-drums').src = track.stems.drums;
        document.getElementById('stem-other').src = track.stems.other;
        
        // Afficher les boutons de contrôle des stems
        setupStemButtons();
        
        // Jouer après que le vocal stem est prêt
        playerToUse.onloadeddata = () => {
            playAllPlayers();
        };

    } else {
        // Charger l'audio principal
        audioPlayer.src = track.mainAudio;
        
        // Jouer après que l'audio principal est prêt
        playerToUse.onloadeddata = () => {
             playAllPlayers();
        };
    }
    
    // S'assurer que les événements de fin de piste sont attachés au player principal utilisé
    playerToUse.onended = playNext;

    // Mettre à jour la tracklist pour mettre en évidence la piste active
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
    // Vérification rapide pour éviter les erreurs si l'index n'est pas prêt
     if (currentIndex === -1 || currentPlaylist.length === 0) return;
     
    const track = currentPlaylist[currentIndex];
    const isStemMode = track && track.stems;
    const player = isStemMode ? document.getElementById('stem-vocals') : document.getElementById('audio-player');
    
    // Si c'était déjà en pause, on lance. Si c'était déjà en cours, on pause.
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
            // Mettre en lecture synchrone
            document.getElementById('stem-bass').play();
            document.getElementById('stem-drums').play();
            document.getElementById('stem-other').play();
        }
    }
}

// Fonction appelée pour lancer tous les players (utilisée après le chargement des données)
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
        // Revenir au début de la playlist
        playTrack(0);
    }
}

function playPrevious() {
    if (currentIndex > 0) {
        playTrack(currentIndex - 1);
    } else if (currentPlaylist.length > 0) {
        // Revenir à la fin de la playlist
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
        // Synchroniser les autres stems
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
        // Synchroniser les autres stems
        document.getElementById('stem-bass').currentTime = player.currentTime;
        document.getElementById('stem-drums').currentTime = player.currentTime;
        document.getElementById('stem-other').currentTime = player.currentTime;
    }
}

// Fonction de synchronisation du range input avec tous les players
document.getElementById('progress-bar').addEventListener('input', () => {
    if (currentIndex === -1) return;
    
    const newTime = document.getElementById('progress-bar').value;
    const track = currentPlaylist[currentIndex];

    if (track) {
        const mainPlayer = document.getElementById('audio-player');
        
        if (track.stems) {
            // Si stem mode, la barre contrôle les stems
            document.getElementById('stem-vocals').currentTime = newTime;
            document.getElementById('stem-bass').currentTime = newTime;
            document.getElementById('stem-drums').currentTime = newTime;
            document.getElementById('stem-other').currentTime = newTime;
        } else {
            // Sinon, elle contrôle le main player
            mainPlayer.currentTime = newTime;
        }
    }
});


// GESTION DES BOUTONS STEMS
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
