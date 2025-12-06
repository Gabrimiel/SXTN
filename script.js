// script.js - SXTN : IndexedDB STABLE + NOUVELLE INTERFACE COMPACTE

let currentPlaylist = [];
let currentUser = null; 
let activeAlbumKey = null; 

const DB_NAME = 'SXTN_MusicDB';
const DB_VERSION = 2; 
const TRACKS_STORE_NAME = 'tracks';
const USER_STORE_NAME = 'users';

let db; 

// Références DOM
const audioPlayer = document.getElementById('audio-player');
const albumCarousel = document.getElementById('album-carousel');
const tracklistUl = document.getElementById('tracklist-ul');
const sideMenu = document.getElementById('side-menu');

// INFOS DANS LE FOOTER
const currentCoverFooter = document.getElementById('current-cover-footer'); 
const currentTitleFooter = document.getElementById('current-title-footer');
const currentArtistFooter = document.getElementById('current-artist-footer');

// CONTROLES LECTURE
const playPauseButton = document.getElementById('play-pause-button');
const deleteTrackButton = document.getElementById('delete-track-button'); 

// RÉFÉRENCES STEMS
const stemModeOption = document.getElementById('stem-mode-option');
const stemControls = document.getElementById('stem-controls');
const stemContainer = document.getElementById('stem-container');
const stemPlayers = {
    vocals: document.getElementById('stem-vocals'),
    bass: document.getElementById('stem-bass'),
    drums: document.getElementById('stem-drums'),
    other: document.getElementById('stem-other')
};


// =========================================================
// GESTION IndexedDB
// =========================================================

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (e) => {
            console.error("Erreur IndexedDB :", e.target.errorCode);
            alert("Erreur critique : Impossible d'ouvrir la base de données de musique.");
            reject(e);
        };

        request.onsuccess = (e) => {
            db = e.target.result;
            resolve();
        };

        request.onupgradeneeded = (e) => {
            db = e.target.result;
            
            if (!db.objectStoreNames.contains(TRACKS_STORE_NAME)) {
                db.createObjectStore(TRACKS_STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
            
            if (!db.objectStoreNames.contains(USER_STORE_NAME)) {
                db.createObjectStore(USER_STORE_NAME, { keyPath: 'username' });
            }
            console.log("Magasin(s) créé(s)/mis à jour.");
        };
    });
}

function readAllTracksFromDB() {
    return new Promise((resolve, reject) => {
        if (!db) return resolve([]);
        
        const transaction = db.transaction([TRACKS_STORE_NAME], 'readonly');
        const store = transaction.objectStore(TRACKS_STORE_NAME);
        const request = store.getAll();

        request.onsuccess = (e) => resolve(e.target.result); 
        request.onerror = (e) => reject(e);
    });
}

function addTrackToDB(trackData) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([TRACKS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(TRACKS_STORE_NAME);
        const request = store.add(trackData);

        request.onsuccess = (e) => resolve(e.target.result); 
        request.onerror = (e) => reject(e);
    });
}

function deleteTrackFromDB(trackId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([TRACKS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(TRACKS_STORE_NAME);
        const request = store.delete(trackId);

        request.onsuccess = (e) => resolve(); 
        request.onerror = (e) => reject(e);
    });
}


// =========================================================
// GESTION UTILITAIRE
// =========================================================

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

function showLogin() {
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
}

function showRegister() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
}

function toggleSideMenu() {
    sideMenu.classList.toggle('open');
}

// =========================================================
// AUTHENTIFICATION
// =========================================================

async function registerUser() {
    await openDB();

    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;

    if (!username || !password) {
        alert("Veuillez remplir tous les champs.");
        return;
    }

    try {
        const transaction = db.transaction([USER_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(USER_STORE_NAME);
        
        const request = store.add({ username, password }); 
        
        request.onsuccess = () => {
            alert("Compte créé avec succès ! Connectez-vous.");
            showLogin();
        };
        
        request.onerror = (e) => {
            if (e.target.error.name === 'ConstraintError') {
                alert("Ce nom d'utilisateur est déjà pris.");
            } else {
                console.error("Erreur d'ajout utilisateur:", e); 
                alert("Erreur lors de la création du compte.");
            }
        };
    } catch (e) {
        console.error("Erreur critique d'enregistrement:", e);
        alert("Une erreur inattendue est survenue. Vérifiez la console (F12).");
    }
}

async function loginUser() {
    await openDB();

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!username || !password) {
        alert("Veuillez remplir tous les champs.");
        return;
    }

    try {
        const transaction = db.transaction([USER_STORE_NAME], 'readonly');
        const store = transaction.objectStore(USER_STORE_NAME);
        const request = store.get(username); 
        
        request.onsuccess = async (e) => {
            const user = e.target.result;

            if (user && user.password === password) {
                currentUser = user.username;
                sessionStorage.setItem('sxtn_current_user', currentUser); 
                
                document.getElementById('auth-container').style.display = 'none';
                document.getElementById('app-container').style.display = 'flex';
                
                await loadPlaylist(); 
                alert(`Bienvenue, ${currentUser} !`);
            } else {
                alert("Nom d'utilisateur ou mot de passe incorrect.");
            }
        };
        
        request.onerror = (e) => {
            console.error("Erreur de connexion DB:", e);
            alert("Erreur de connexion. La DB est peut-être inaccessible.");
        };

    } catch (e) {
        console.error("Erreur critique de connexion:", e);
        alert("Une erreur inattendue est survenue. Vérifiez la console (F12).");
    }
}

// =========================================================
// SUPPRESSION DE MORCEAUX
// =========================================================

async function deleteCurrentTrack() {
    const currentIndex = parseInt(audioPlayer.dataset.currentIndex);
    const trackToDelete = currentPlaylist[currentIndex];

    if (!trackToDelete) {
        alert("Aucun morceau sélectionné à supprimer.");
        return;
    }

    const confirmation = confirm(`Êtes-vous sûr de vouloir supprimer "${trackToDelete.title}" ? Cette action est irréversible.`);
    
    if (confirmation) {
        try {
            await openDB();
            
            await deleteTrackFromDB(trackToDelete.id);
            currentPlaylist.splice(currentIndex, 1);
            
            if (currentPlaylist.length > 0) {
                // Charger la piste suivante ou la première
                loadTrack(currentIndex % currentPlaylist.length); 
            } else {
                // Vider le lecteur
                audioPlayer.src = '';
                audioPlayer.pause();
                currentCoverFooter.src = 'placeholder.png';
                currentTitleFooter.textContent = 'Titre du Morceau';
                currentArtistFooter.textContent = 'Artiste Inconnu';
                deleteTrackButton.style.display = 'none';
                playPauseButton.textContent = '▶️';
            }
            
            await loadPlaylist(); 
            // Recharger la tracklist si l'album actif était celui-ci
            if (activeAlbumKey) {
                 const albumTracks = currentPlaylist.filter(t => `${t.artist}-${t.album}`.replace(/[^a-zA-Z0-9-]/g, '') === activeAlbumKey);
                 displayTracklist(albumTracks, activeAlbumKey);
            }

            alert(`Morceau "${trackToDelete.title}" supprimé.`);
        } catch (error) {
            console.error("Erreur lors de la suppression:", error);
            alert("Erreur lors de la suppression du morceau.");
        }
    }
}


// =========================================================
// GESTION DES MORCEAUX AVEC UPLOAD DE STEMS
// =========================================================

async function addTrack() {
    
    await openDB(); 

    const titleInput = document.getElementById('music-title').value.trim(); 
    const albumName = document.getElementById('music-artist').value.trim(); 
    const artist = document.getElementById('music-description').value.trim(); 
    const audioInput = document.getElementById('audio-input');
    const coverInput = document.getElementById('cover-input');
    
    const isStemModeEnabled = stemModeOption.checked; 

    if (!currentUser) {
        alert("Veuillez vous connecter avant d'ajouter des morceaux.");
        return;
    }

    const stemInputs = {
        vocals: document.getElementById('stem-vocals-input'),
        bass: document.getElementById('stem-bass-input'),
        drums: document.getElementById('stem-drums-input'),
        other: document.getElementById('stem-other-input'),
    };
    
    const hasMainFile = audioInput.files.length > 0;
    const hasAnyStemFile = Object.values(stemInputs).some(input => input.files.length > 0);

    if (!hasMainFile && !hasAnyStemFile) {
        alert("Veuillez sélectionner le fichier Audio Principal ou fournir au moins un fichier Stem.");
        return;
    }

    document.querySelector('.import-section button').textContent = "Importation en cours...";
    document.querySelector('.import-section button').disabled = true;

    try {
        let coverBase64 = 'placeholder.png'; 
        if (coverInput.files.length > 0) {
            coverBase64 = await fileToBase64(coverInput.files[0]);
        }
        
        const audioFile = hasMainFile ? audioInput.files[0] : null;
        const audioBase64 = audioFile ? await fileToBase64(audioFile) : '';
        
        let stemData = null;
        
        if (isStemModeEnabled) {
            
            const stems = {};
            
            for (const key in stemInputs) {
                const input = stemInputs[key];
                
                if (input.files.length > 0) {
                    stems[key] = await fileToBase64(input.files[0]);
                }
            }
            
            if (Object.keys(stems).length > 0) {
                stemData = stems;
            } 
        }

        const trackIsStemSeparated = isStemModeEnabled && stemData && Object.keys(stemData).length > 0;

        const newTrack = {
            user: currentUser, 
            title: titleInput || (audioFile ? audioFile.name.replace(/\.[^/.]+$/, "") : "Nouveau Stem Track"),
            album: albumName || "Album Inconnu", 
            artist: artist || "Artiste Inconnu", 
            cover: coverBase64,
            audioData: audioBase64,
            isStemSeparated: trackIsStemSeparated, 
            stems: stemData 
        };
            
        const id = await addTrackToDB(newTrack);
        newTrack.id = id; 
        currentPlaylist.push(newTrack);
        
        // Recharger la bibliothèque et fermer le menu
        await loadPlaylist(); 
        toggleSideMenu();

        // Réinitialiser les champs d'entrée
        document.getElementById('music-title').value = '';
        document.getElementById('music-artist').value = '';
        document.getElementById('music-description').value = '';
        audioInput.value = '';
        coverInput.value = '';
        
        if (isStemModeEnabled) {
            document.getElementById('stem-vocals-input').value = '';
            document.getElementById('stem-bass-input').value = '';
            document.getElementById('stem-drums-input').value = '';
            document.getElementById('stem-other-input').value = '';
        }
        stemModeOption.checked = false;
        document.getElementById('manual-stem-fields').style.display = 'none';
        
    } catch (error) {
        alert(`Une erreur est survenue lors de l'importation. Un fichier est peut-être trop grand. Consultez la console (F12)`);
        console.error("Erreur lors de l'ajout du morceau :", error);
    } finally {
        document.querySelector('.import-section button').textContent = "Ajouter à la Bibliothèque";
        document.querySelector('.import-section button').disabled = false;
    }
}


// =========================================================
// CONTROLES DE LECTURE
// =========================================================

function getCurrentPlayer() {
    const currentIndex = parseInt(audioPlayer.dataset.currentIndex);
    const track = currentPlaylist[currentIndex];
    
    if (track && track.isStemSeparated && track.stems) {
        for (const stemName in stemPlayers) {
            if (stemPlayers[stemName].src) {
                return stemPlayers[stemName];
            }
        }
    }
    return audioPlayer;
}

function togglePlayPause() {
    const player = getCurrentPlayer();

    if (player.paused || player.ended) {
        player.play();
    } else {
        player.pause();
    }
}

function playNext() {
    const currentIndex = parseInt(audioPlayer.dataset.currentIndex);
    if (currentIndex === -1 || currentPlaylist.length === 0) return;
    
    const nextIndex = (currentIndex + 1) % currentPlaylist.length;
    loadTrack(nextIndex);
}

function playPrevious() {
    const currentIndex = parseInt(audioPlayer.dataset.currentIndex);
    if (currentIndex === -1 || currentPlaylist.length === 0) return;

    let previousIndex = (currentIndex - 1);
    if (previousIndex < 0) {
        previousIndex = currentPlaylist.length - 1; 
    }
    loadTrack(previousIndex);
}

function seekForward(seconds) {
    const player = getCurrentPlayer();
    player.currentTime += seconds;
}

function seekBackward(seconds) {
    const player = getCurrentPlayer();
    player.currentTime -= seconds;
}

// Mise à jour de l'icône lecture/pause lors de l'événement play/pause
audioPlayer.addEventListener('play', () => playPauseButton.textContent = '⏸️');
audioPlayer.addEventListener('pause', () => playPauseButton.textContent = '▶️');
stemPlayers.vocals.addEventListener('play', () => playPauseButton.textContent = '⏸️');
stemPlayers.vocals.addEventListener('pause', () => playPauseButton.textContent = '▶️'); 


// =========================================================
// CHARGEMENT ET AFFICHAGE
// =========================================================

async function loadPlaylist() {
    await openDB(); 
    
    const storedUser = sessionStorage.getItem('sxtn_current_user');
    if (storedUser) {
        currentUser = storedUser;
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
    } else {
        return; 
    }
    
    const allTracks = await readAllTracksFromDB(); 
    
    const userTracks = allTracks.filter(track => track.user === currentUser);
    currentPlaylist = userTracks; 
    
    // Regrouper par album/artiste (clé: NomArtiste-NomAlbum)
    const albums = userTracks.reduce((acc, track) => {
        // Nettoyer la clé pour éviter les problèmes de caractères dans les sélecteurs DOM
        const albumKey = `${track.artist}-${track.album}`.replace(/[^a-zA-Z0-9-]/g, ''); 
        if (!acc[albumKey]) {
            acc[albumKey] = {
                tracks: [],
                artist: track.artist,
                album: track.album,
                cover: track.cover,
                startIndex: 0 
            };
        }
        acc[albumKey].tracks.push(track);
        return acc;
    }, {});
    
    displayAlbums(albums); 
    
    if (currentPlaylist.length > 0) {
        const currentIndex = parseInt(audioPlayer.dataset.currentIndex);
        if (currentIndex !== -1 && currentIndex < currentPlaylist.length) {
             loadTrack(currentIndex);
        } else {
             loadTrack(0);
        }
       
    } else {
        audioPlayer.src = '';
        audioPlayer.dataset.currentIndex = '-1';
        currentCoverFooter.src = 'placeholder.png';
        currentTitleFooter.textContent = 'Titre du Morceau';
        currentArtistFooter.textContent = 'Artiste Inconnu';
        deleteTrackButton.style.display = 'none';
        playPauseButton.textContent = '▶️';
        tracklistUl.innerHTML = '<li>Votre bibliothèque est vide. Importez des morceaux via le menu ☰.</li>';
    }
}

function displayAlbums(albums) {
    albumCarousel.innerHTML = ''; 
    let currentGlobalIndex = 0; 

    // Trier les albums par nom
    const sortedAlbumKeys = Object.keys(albums).sort();

    sortedAlbumKeys.forEach(albumKey => {
        const albumData = albums[albumKey];
        albumData.startIndex = currentGlobalIndex; 

        const card = document.createElement('div');
        card.className = 'album-card';
        card.dataset.startTrackIndex = albumData.startIndex; 
        card.dataset.albumKey = albumKey;
        
        const coverImg = document.createElement('img');
        coverImg.className = 'album-cover-img';
        coverImg.src = albumData.cover;
        coverImg.alt = `Pochette de ${albumData.album}`;

        const titleDiv = document.createElement('div');
        titleDiv.className = 'album-card-title';
        titleDiv.textContent = albumData.album;

        const artistDiv = document.createElement('div');
        artistDiv.className = 'album-card-artist';
        artistDiv.textContent = albumData.artist;

        card.appendChild(coverImg);
        card.appendChild(titleDiv);
        card.appendChild(artistDiv);

        card.addEventListener('click', () => {
            displayTracklist(albumData.tracks, albumKey);
            highlightActiveCard(albumKey);
        });
        
        albumCarousel.appendChild(card);
        
        currentGlobalIndex += albumData.tracks.length;
    });
    
    // Si aucun album actif, charger le premier
    if (currentPlaylist.length > 0 && !activeAlbumKey) {
        const firstTrack = currentPlaylist[0];
        const firstAlbumKey = `${firstTrack.artist}-${firstTrack.album}`.replace(/[^a-zA-Z0-9-]/g, '');
        const firstAlbumTracks = albums[firstAlbumKey].tracks;

        displayTracklist(firstAlbumTracks, firstAlbumKey);
        highlightActiveCard(firstAlbumKey);
    }
    
    // Maintenir le surlignage de l'album actif
    if (activeAlbumKey) {
        highlightActiveCard(activeAlbumKey);
    }
}

function displayTracklist(tracks, key) {
    tracklistUl.innerHTML = ''; 
    
    if (tracks.length === 0) {
        tracklistUl.innerHTML = '<li>Cet album est vide.</li>';
        activeAlbumKey = null;
        return;
    }
    
    activeAlbumKey = key; 

    const firstTrack = tracks[0];
    const firstTrackGlobalIndex = currentPlaylist.findIndex(t => t.id === firstTrack.id);
    
    tracks.forEach((track, index) => {
        const globalIndex = firstTrackGlobalIndex + index; 
        
        const listItem = document.createElement('li');
        listItem.className = 'track-item';
        listItem.dataset.trackId = track.id; 
        
        // --- COLONNE GAUCHE (Cover + Titre) ---
        const infoDiv = document.createElement('div');
        infoDiv.className = 'track-item-info';
        
        const coverImg = document.createElement('img');
        coverImg.className = 'track-item-cover';
        coverImg.src = track.cover;
        coverImg.alt = `Cover`;
        
        const titleSpan = document.createElement('span');
        titleSpan.className = 'track-item-title';
        titleSpan.textContent = track.title + (track.isStemSeparated ? ' [STEMS]' : '');
        
        infoDiv.appendChild(coverImg);
        infoDiv.appendChild(titleSpan);
        
        // --- COLONNE DROITE (Contrôles) ---
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'track-controls';
        
        // Bouton PLAY
        const playButton = document.createElement('button');
        playButton.className = 'track-play-button';
        playButton.textContent = '[ PLAY ]';
        playButton.title = `Jouer ${track.title}`;
        
        playButton.addEventListener('click', (e) => {
            e.stopPropagation(); 
            loadTrack(globalIndex);
        });

        // Bouton POUBELLE
        const deleteButton = document.createElement('button');
        deleteButton.className = 'track-delete-button';
        deleteButton.textContent = '🗑️';
        deleteButton.title = `Supprimer ${track.title}`;
        
        deleteButton.addEventListener('click', async (e) => {
            e.stopPropagation(); 
            
            const confirmation = confirm(`Êtes-vous sûr de vouloir supprimer "${track.title}" ?`);
            if (confirmation) {
                 const globalIndexToDelete = currentPlaylist.findIndex(t => t.id === track.id);
                 
                 if (globalIndexToDelete !== -1) {
                     // Si c'est le morceau en cours, on appelle la fonction globale de suppression
                     if (parseInt(audioPlayer.dataset.currentIndex) === globalIndexToDelete) {
                        await deleteCurrentTrack(); 
                     } else {
                        // Sinon, on fait la suppression manuelle et on recharge l'affichage
                        await deleteTrackFromDB(track.id);
                        currentPlaylist.splice(globalIndexToDelete, 1);
                        await loadPlaylist();
                        const tracksAfterDeletion = currentPlaylist.filter(t => `${t.artist}-${t.album}`.replace(/[^a-zA-Z0-9-]/g, '') === activeAlbumKey);
                        displayTracklist(tracksAfterDeletion, activeAlbumKey);
                     }
                 }
            }
        });

        controlsDiv.appendChild(playButton);
        controlsDiv.appendChild(deleteButton);

        // Assemblage final
        listItem.appendChild(infoDiv);
        listItem.appendChild(controlsDiv);
        
        tracklistUl.appendChild(listItem);
    });
    
    highlightActiveTrack();
}

function highlightActiveCard(key) {
    document.querySelectorAll('.album-card').forEach(card => card.classList.remove('active-card'));
    const activeCard = document.querySelector(`.album-card[data-album-key="${key}"]`);
    if (activeCard) {
        activeCard.classList.add('active-card');
    }
}

function highlightActiveTrack() {
    const currentIndex = parseInt(audioPlayer.dataset.currentIndex);
    const activeTrack = currentPlaylist[currentIndex];

    // Retirer la classe active de toutes les pistes dans la tracklist
    document.querySelectorAll('.track-item').forEach(li => li.classList.remove('active-track'));

    if (activeTrack) {
        const activeLi = document.querySelector(`li[data-track-id="${activeTrack.id}"]`);
        if (activeLi) {
            activeLi.classList.add('active-track');
        }
    }
}

// =========================================================
// LOGIQUE DE LECTURE
// =========================================================

function loadTrack(index) {
    if (index >= currentPlaylist.length) return;

    const track = currentPlaylist[index];
    
    // Mise à jour des informations du footer
    currentCoverFooter.src = track.cover; 
    currentTitleFooter.textContent = track.title; 
    currentArtistFooter.textContent = `${track.artist} - Album: ${track.album}`;

    // On s'assure que l'album du morceau est affiché dans la tracklist
    const trackAlbumKey = `${track.artist}-${track.album}`.replace(/[^a-zA-Z0-9-]/g, '');
    if (trackAlbumKey !== activeAlbumKey) {
        const albumTracks = currentPlaylist.filter(t => `${t.artist}-${t.album}`.replace(/[^a-zA-Z0-9-]/g, '') === trackAlbumKey);
        displayTracklist(albumTracks, trackAlbumKey);
    }
    
    // --- LOGIQUE STEMS ---
    if (track.isStemSeparated && track.stems) {
        audioPlayer.pause();
        stemControls.style.display = 'flex'; 

        stemContainer.innerHTML = ''; 
        let firstPlayer = null; 
        
        const stemOrder = ['vocals', 'bass', 'drums', 'other'];
        
        stemOrder.forEach(stemName => {
            const player = stemPlayers[stemName];
            const stemData = track.stems[stemName]; 
            
            player.pause(); 
            player.src = stemData || ''; 
            player.load();
            player.volume = 1; 
            
            const button = document.createElement('button');
            button.className = 'stem-mute-button';

            if (stemData) {
                button.textContent = `${stemName.toUpperCase()}`;
                button.classList.add('active-stem');

                button.onclick = function() {
                    if (player.volume === 1) {
                        player.volume = 0; 
                        button.classList.remove('active-stem');
                    } else {
                        player.volume = 1; 
                        button.classList.add('active-stem');
                    }
                };
                
                if (!firstPlayer) {
                    firstPlayer = player;
                }
            } else {
                button.textContent = `${stemName.toUpperCase()}`;
                button.disabled = true;
                player.volume = 0; 
            }
            
            stemContainer.appendChild(button);
            
            player.onplay = function() {
                for (const otherStemName in stemPlayers) {
                    const otherPlayer = stemPlayers[otherStemName];
                    if (otherPlayer !== player && otherPlayer.paused) {
                        otherPlayer.currentTime = player.currentTime; 
                        otherPlayer.play();
                    }
                }
            };
            player.onpause = function() {
                for (const otherStemName in stemPlayers) {
                    if (stemPlayers[otherStemName] !== player) {
                        stemPlayers[otherStemName].pause();
                    }
                }
            };
        });
        
        if (firstPlayer) {
            firstPlayer.play();
        }

    } else {
        // Mode normal : morceau non séparé
        for (const stemName in stemPlayers) {
             stemPlayers[stemName].pause();
             stemPlayers[stemName].src = ''; 
        }

        stemControls.style.display = 'none'; 
        
        if (track.audioData) {
            audioPlayer.src = track.audioData;
            audioPlayer.load();
            audioPlayer.play();
        } else {
            audioPlayer.src = '';
            audioPlayer.load();
            console.error("Aucune source audio disponible pour ce morceau.");
        }
    }
    // --- FIN LOGIQUE STEMS ---

    audioPlayer.dataset.currentIndex = index; 
    highlightActiveTrack(); 
    highlightActiveCard(trackAlbumKey);
    deleteTrackButton.style.display = 'inline-block';
    playPauseButton.textContent = '⏸️'; // Le bouton passe immédiatement en pause
}


// Gérer la lecture automatique de la piste suivante
function handleTrackEnd() {
    const currentIndex = parseInt(audioPlayer.dataset.currentIndex || 0);
    const nextIndex = (currentIndex + 1) % currentPlaylist.length; 
    
    if (currentPlaylist.length > 0) {
        loadTrack(nextIndex);
    }
}

audioPlayer.addEventListener('ended', handleTrackEnd);
stemPlayers.vocals.addEventListener('ended', handleTrackEnd);


// Lancement au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    loadPlaylist(); 
});