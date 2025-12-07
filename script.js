// Variable globale pour stocker la playlist actuelle (temporaire, non persistante)
let currentPlaylist = []; 
let currentIndex = -1;
let isPlaying = false;
let isAdmin = false; 

// Code secret pour l'accès Admin
const ADMIN_CODE = "080216";

// =========================================================
// GESTION LECTEUR ET PLAYLIST (Version sans IndexedDB)
// =========================================================

/**
 * Fonction utilitaire pour lire un fichier en Base64.
 * C'est cette étape qui charge les données audio du fichier.
 */
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

/**
 * Récupère l'élément AudioPlayer principal ou le Vocal Stem Player.
 */
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
    let stemData = null;

    // --- 1. Gérer la pochette ---
    if (coverFile) {
        try {
            coverBase64 = await readFileAsDataURL(coverFile);
        } catch (e) {
            alert("Erreur de lecture de l'image de couverture.");
            return;
        }
    }

    // --- 2. Gérer les fichiers audio ---
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
            stemData = {
                vocals: await readFileAsDataURL(vocalsFile),
                bass: await readFileAsDataURL(bassFile),
                drums: await readFileAsDataURL(drumsFile),
                other: await readFileAsDataURL(otherFile)
            };
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
        // Nous utilisons Date.now() comme ID unique, car nous n'avons plus d'IndexedDB
        id: Date.now(), 
        title: title,
        artist: artist,
        album: album,
        cover: coverBase64,
        mainAudio: mainAudioBase64,
        stems: stemData,
    };

    // AJOUT DIRECT au tableau temporaire de la playlist
    currentPlaylist.push(trackData);
    
    alert(`Morceau "${title}" ajouté à la bibliothèque temporaire.`);
    toggleSideMenu(); // Ferme le menu
    loadPlaylist(); // Met à jour l'affichage
}

// SIMPLIFIÉE : Recharge et affiche la playlist temporaire
function loadPlaylist() {
    const libraryMain = document.getElementById('library-main');
    
    if (currentPlaylist.length === 0) {
        // Logique d'affichage si la liste est vide (similaire à avant)
        const emptyMessage = `
            <div id="empty-library-message" style="padding: 20px; background: #eee; border-radius: 8px; text-align: center;">
                Votre session de lecture est vide. ${isAdmin ? 'Importez des morceaux via le menu ☰.' : 'L\'Administrateur doit importer des morceaux.'} (Attention : les morceaux seront perdus au rechargement de la page)
            </div>
        `;
        // Nous nous assurons que les conteneurs existent toujours pour l'affichage futur
        libraryMain.innerHTML = `
            <h2>LIBRARY</h2>
            ${emptyMessage}
            <div id="album-carousel"></div>
            <div id="tracklist-container"><ul id="tracklist-ul"></ul></div>
        `;
    } else {
        // Assurez-vous que les conteneurs sont présents pour displayAlbums/displayTracklist
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

function deleteTrack(trackId) {
    if (!isAdmin) {
        alert("Seul l'Administrateur peut supprimer des morceaux.");
        return;
    }
    
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce morceau de cette session ? (Il sera perdu de toute façon au rechargement)")) {
        return;
    }
    
    // Suppression du tableau local
    const initialLength = currentPlaylist.length;
    currentPlaylist = currentPlaylist.filter(track => track.id !== trackId);

    if (currentPlaylist.length < initialLength) {
        alert("Morceau supprimé de la session.");

        // Réinitialiser le player si le morceau en cours est supprimé
        if (currentIndex !== -1 && currentPlaylist[currentIndex] && currentPlaylist[currentIndex].id === trackId) {
            stopPlayback();
        }

        // Réajuster l'index si la suppression affecte l'ordre
        if (currentIndex >= currentPlaylist.length) {
             currentIndex = currentPlaylist.length > 0 ? currentPlaylist.length - 1 : -1;
        }

        loadPlaylist();
        displayTracklist(activeAlbum);
    } else {
        alert("Erreur lors de la suppression du morceau.");
    }
}


// Les fonctions showAdminPrompt, toggleSideMenu, updateAdminUI, displayAlbums, displayTracklist,
// playTrack, stopPlayback, togglePlayPause, playAllPlayers, playNext, playPrevious, seekForward,
// seekBackward, setupStemButtons sont inchangées dans leur logique de lecture.
// Je ne les réécris pas ici par souci de concision, mais vous devez les maintenir.
// **Assurez-vous que les dépendances IndexedDB (openDB, addTrackToDB, readAllTracksFromDB) ont été retirées de votre script.js.**


// =========================================================
// FONCTIONS DE LECTURE (MAINTENUES)
// =========================================================

// (Laisser ici toutes les fonctions de lecture comme playTrack, togglePlayPause, etc.)

function showAdminPrompt() { /* ... */ }
function toggleSideMenu() { /* ... */ }
function updateAdminUI() { /* ... */ }
function displayAlbums() { /* ... */ }
function displayTracklist(albumName) { /* ... */ }
// Note: deleteTrack a été mis à jour ci-dessus.

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

// Lancement initial de la playlist (vide si non-persistante)
document.addEventListener('DOMContentLoaded', loadPlaylist);


// =========================================================
// FONCTIONS ADMINISTRATEUR (MAINTENUES)
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

function updateAdminUI() {
    // Affiche le bouton supprimer seulement si Admin
    document.getElementById('delete-track-button').style.display = isAdmin ? 'block' : 'none';
    
    // Met à jour le texte du bouton Admin
    document.getElementById('admin-access-btn').textContent = isAdmin ? "ADMIN (Activé)" : "ADMIN ACCESS";

    // Met à jour le message de la bibliothèque si elle est vide
    const emptyMessage = document.getElementById('empty-library-message');
    if (emptyMessage) {
        emptyMessage.innerHTML = `Votre session de lecture est vide. ${isAdmin ? 'Importez des morceaux via le menu ☰.' : 'L\'Administrateur doit importer des morceaux.'} (Attention : les morceaux seront perdus au rechargement de la page)`;
    }
}

// Les fonctions displayAlbums et displayTracklist sont maintenues (elles lisent currentPlaylist)
// ...
