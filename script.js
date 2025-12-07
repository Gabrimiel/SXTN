// Variable globale pour stocker la playlist actuelle (temporaire, NON PERSISTANTE)
let currentPlaylist = []; 
let currentIndex = -1;
let isPlaying = false;
let isAdmin = false; 
let activeAlbum = null; 

// Code secret pour l'accès Admin
const ADMIN_CODE = "080216";

// =========================================================
// GESTION LECTEUR ET PLAYLIST (Version SANS IndexedDB)
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

    // Récupération des données du formulaire... (inchangé)
    const title = document.getElementById('music-title').value || "Titre Inconnu";
    const artist = document.getElementById('music-description').value || "Artiste Inconnu";
    const album = document.getElementById('music-artist').value || "Album Inconnu";
    const coverFile = document.getElementById('cover-input').files[0];
    const audioFile = document.getElementById('audio-input').files[0];
    const hasStems = document.getElementById('stem-mode-option').checked;

    let coverBase64 = "placeholder.png";
    let mainAudioBase64 = null;
    let stemData = null;
    let trackData = {};

    // --- 1. Gérer la pochette ---
    if (coverFile) {
        try {
            coverBase64 = await readFileAsDataURL(coverFile);
        } catch (e) {
            alert("Erreur de lecture de l'image de couverture.");
            return;
        }
    }

    // --- 2. Gérer les fichiers audio (lecture en Base64) ---
    if (hasStems) {
        const vocalsFile = document.getElementById('stem-vocals-input').files[0];
        const bassFile = document.getElementById('stem-bass-input').files[0];
        const drumsFile = document.getElementById('stem-drums-input').files[0];
        const otherFile = document.getElementById('stem-other-input').files[0];

        if (!vocalsFile || !bassFile || !drumsFile || !otherFile) {
             alert("Veuillez fournir les 4 fichiers Stems.");
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

    trackData = {
        // ID basé sur le temps, unique pour la session courante
        id: Date.now(), 
        title: title,
        artist: artist,
        album: album,
        cover: coverBase64,
        mainAudio: mainAudioBase64,
        stems: stemData,
    };

    // AJOUT DIRECT au tableau temporaire de la playlist (Pas de délai)
    currentPlaylist.push(trackData);
    
    alert(`Morceau "${title}" ajouté à la bibliothèque de la session.`);
    toggleSideMenu(); // Ferme le menu
    loadPlaylist(); // Met à jour l'affichage
}

// SIMPLIFIÉE : Affiche la playlist temporaire
function loadPlaylist() {
    // Dans cette version, il n'y a pas de lecture depuis la DB, on utilise currentPlaylist.
    
    const libraryMain = document.getElementById('library-main');
    
    if (currentPlaylist.length === 0) {
        // Affichage de la librairie vide
        const emptyMessage = `
            <div id="empty-library-message" style="padding: 20px; background: #eee; border-radius: 8px; text-align: center;">
                Votre session de lecture est vide. ${isAdmin ? 'Importez des morceaux via le menu ☰.' : 'L\'Administrateur doit importer des morceaux.'} (Attention : les morceaux seront perdus au rechargement de la page)
            </div>
        `;
        libraryMain.innerHTML = `
            <h2>LIBRARY</h2>
            ${emptyMessage}
            <div id="album-carousel"></div>
            <div id="tracklist-container"><ul id="tracklist-ul"></ul></div>
        `;
    } else {
        // Assurez-vous que les conteneurs sont présents
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

function deleteTrack(trackId) {
    if (!isAdmin) {
        alert("Seul l'Administrateur peut supprimer des morceaux.");
        return;
    }
    
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce morceau de cette session ?")) {
        return;
    }
    
    // Suppression du tableau local
    const initialLength = currentPlaylist.length;
    // L'ID est utilisé pour trouver le morceau
    currentPlaylist = currentPlaylist.filter(track => track.id !== trackId); 

    if (currentPlaylist.length < initialLength) {
        alert("Morceau supprimé de la session.");

        // Logique pour réinitialiser le player
        if (currentIndex !== -1 && currentPlaylist.length === 0) {
            stopPlayback();
            currentIndex = -1;
        } else if (currentIndex >= currentPlaylist.length) {
             currentIndex = currentPlaylist.length > 0 ? currentPlaylist.length - 1 : -1;
        }

        loadPlaylist(); 
    } else {
        alert("Erreur lors de la suppression du morceau.");
    }
}


// =========================================================
// FONCTIONS DE LECTURE & D'INTERFACE (Inchangées dans leur logique)
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
    
    if (!isAdmin && !menu.classList.contains('open')) {
        alert("Vous devez activer le mode Administrateur (ADMIN ACCESS) pour importer des morceaux.");
        return;
    }
    
    menu.classList.toggle('open');
}

function updateAdminUI() {
    document.getElementById('delete-track-button').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('admin-access-btn').textContent = isAdmin ? "ADMIN (Activé)" : "ADMIN ACCESS";

    const emptyMessage = document.getElementById('empty-library-message');
    if (emptyMessage) {
        emptyMessage.innerHTML = `Votre session de lecture est vide. ${isAdmin ? 'Importez des morceaux via le menu ☰.' : 'L\'Administrateur doit importer des morceaux.'} (Attention : les morceaux seront perdus au rechargement de la page)`;
    }
}

// Les fonctions displayAlbums, displayTracklist, playTrack, stopPlayback, togglePlayPause, 
// playAllPlayers, playNext, playPrevious, seekForward, seekBackward, setupStemButtons
// sont les mêmes que celles du bloc IndexedDB (elles lisent le tableau currentPlaylist).
// Je ne les réécris pas ici par souci de concision, mais elles DOIVENT être incluses 
// à la suite dans votre script.js. (Je vous recommande de reprendre la partie Lecture
// du dernier script complet que je vous ai envoyé).


// =========================================================
// !!! ASSUREZ-VOUS D'INCLURE ICI TOUTES LES FONCTIONS DE LECTURE !!!
// (PlayTrack, StopPlayback, TogglePlayPause, etc.)
// =========================================================

// ... [Insérez ici toutes les fonctions de lecture et d'affichage (displayAlbums, displayTracklist, etc.)] ...
// ... [Celles-ci étaient présentes dans le dernier bloc de code long que je vous ai donné.] ...

// Lancement initial de la playlist (vide si non-persistante)
document.addEventListener('DOMContentLoaded', loadPlaylist);
