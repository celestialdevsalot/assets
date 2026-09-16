const audio = document.querySelector("#audio");

const state = {
  view: "home",
  results: [],
  queue: JSON.parse(localStorage.getItem("celestial.queue") || "[]"),
  liked: JSON.parse(localStorage.getItem("celestial.liked") || "[]"),
  recent: JSON.parse(localStorage.getItem("celestial.recent") || "[]"),
  playlists: JSON.parse(localStorage.getItem("celestial.playlists") || "[]"),
  current: null,
  index: -1,
  playbackList: [],
  playbackSource: null,
  currentPlaylistId: null,
  pickerTrack: null,
  lyrics: [],
  lyricsLoadedFor: null,
  lyricsRequest: 0
};

const $ = s => document.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

function refreshIcons() {
  if (typeof lucide !== "undefined") {
    lucide.createIcons({
      attrs: {
        "stroke-width": 1.5
      }
    });
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function save() {
  localStorage.setItem(
    "celestial.queue",
    JSON.stringify(state.queue)
  );

  localStorage.setItem(
    "celestial.liked",
    JSON.stringify(state.liked)
  );

  localStorage.setItem(
    "celestial.recent",
    JSON.stringify(state.recent)
  );

  localStorage.setItem(
    "celestial.playlists",
    JSON.stringify(state.playlists)
  );
}

function key(track) {
  return String(
    track?.videoId ||
    track?.id ||
    ""
  );
}

function artists(track) {
  return (
    track?.artists?.map(a => a.name).join(", ") ||
    track?.artist ||
    "Unknown artist"
  );
}

function duration(value) {
  const n = Number(value);

  if (Number.isFinite(n)) {
    const m = Math.floor(n / 60);
    const s = Math.floor(n % 60)
      .toString()
      .padStart(2, "0");

    return `${m}:${s}`;
  }

  return String(value || "—");
}

function imageFor(track) {
  if (track?.thumbnails?.length) {
    return [...track.thumbnails]
      .sort(
        (a, b) =>
          (b.width || 0) -
          (a.width || 0)
      )[0].url;
  }

  if (track?.videoId) {
    return `/api/music/m-img/${encodeURIComponent(
      track.videoId
    )}/maxresdefault.jpg?fit=square&size=256`;
  }

  return "";
}

function toast(message) {
  const el = $("#toast");

  if (!el) return;

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(
    () => el.classList.remove("show"),
    2200
  );
}

function saveAndRefresh() {
  save();
  renderPlaylists();
  renderPlaylistPicker();
}

function normalizeTrack(item) {
  return {
    ...item,
    videoId: item.videoId || item.id,
    artist: artists(item)
  };
}


/* =========================
   PLAYLISTS
========================= */

function createPlaylist() {
  const name = prompt("Playlist name");

  if (!name || !name.trim()) return;

  const playlist = {
    id: `playlist-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`,
    name: name.trim(),
    tracks: []
  };

  state.playlists.unshift(playlist);

  save();

  renderPlaylists();

  setView("playlists");

  toast("Playlist created");
}

function getPlaylist(id) {
  return state.playlists.find(
    playlist => playlist.id === id
  );
}

function openPlaylist(id) {
  const playlist = getPlaylist(id);

  if (!playlist) return;

  state.currentPlaylistId = id;

  renderPlaylist();

  setView("playlist");
}

function deleteCurrentPlaylist() {
  const playlist = getPlaylist(
    state.currentPlaylistId
  );

  if (!playlist) return;

  if (
    !confirm(
      `Delete "${playlist.name}"?`
    )
  ) {
    return;
  }

  state.playlists =
    state.playlists.filter(
      item => item.id !== playlist.id
    );

  state.currentPlaylistId = null;

  save();

  setView("playlists");

  renderPlaylists();

  toast("Playlist deleted");
}

function addToPlaylist(
  playlistId,
  track
) {
  const playlist =
    getPlaylist(playlistId);

  if (!playlist) return;

  const normalized =
    normalizeTrack(track);

  if (!normalized.videoId) return;

  if (
    playlist.tracks.some(
      item =>
        key(item) ===
        key(normalized)
    )
  ) {
    toast("Already in playlist");
    return;
  }

  playlist.tracks.push(normalized);

  save();

  renderPlaylistPicker();

  if (
    state.currentPlaylistId ===
    playlistId
  ) {
    renderPlaylist();
  }

  toast(`Added to ${playlist.name}`);
}

function removeFromPlaylist(
  playlistId,
  trackId
) {
  const playlist =
    getPlaylist(playlistId);

  if (!playlist) return;

  playlist.tracks =
    playlist.tracks.filter(
      track =>
        key(track) !== trackId
    );

  save();

  renderPlaylist();

  renderPlaylists();
}

function openPlaylistPicker(track) {
  state.pickerTrack =
    normalizeTrack(track);

  renderPlaylistPicker();

  $("#playlistPicker")
    ?.classList.remove("hidden");

  refreshIcons();
}

function closePlaylistPicker() {
  $("#playlistPicker")
    ?.classList.add("hidden");

  state.pickerTrack = null;
}

function renderPlaylistPicker() {
  const container =
    $("#playlistPickerResults");

  if (!container) return;

  if (!state.playlists.length) {
    container.innerHTML = `
      <div class="empty-state">
        no playlists yet.
      </div>
    `;

    refreshIcons();

    return;
  }

  const track =
    state.pickerTrack;

  container.innerHTML =
    state.playlists
      .map(playlist => {
        const exists =
          track &&
          playlist.tracks.some(
            item =>
              key(item) ===
              key(track)
          );

        return `
          <button
            class="playlist-picker-row"
            type="button"
            data-playlist-id="${escapeHtml(
              playlist.id
            )}"
          >
            <i
              data-lucide="${
                exists
                  ? "check"
                  : "list-music"
              }"
              aria-hidden="true"
            ></i>

            <div class="playlist-picker-info">

              <div class="playlist-picker-name">
                ${escapeHtml(
                  playlist.name
                )}
              </div>

              <div class="playlist-picker-count">
                ${
                  playlist.tracks.length
                }
                ${
                  playlist.tracks.length ===
                  1
                    ? "song"
                    : "songs"
                }
                ${
                  exists
                    ? " · added"
                    : ""
                }
              </div>

            </div>
          </button>
        `;
      })
      .join("");

  $$(".playlist-picker-row", container)
    .forEach(button => {
      button.onclick = () => {
        const playlist =
          getPlaylist(
            button.dataset
              .playlistId
          );

        if (
          !playlist ||
          !state.pickerTrack
        ) {
          return;
        }

        const exists =
          playlist.tracks.some(
            item =>
              key(item) ===
              key(
                state.pickerTrack
              )
          );

        if (exists) {
          playlist.tracks =
            playlist.tracks.filter(
              item =>
                key(item) !==
                key(
                  state.pickerTrack
                )
            );

          save();

          renderPlaylistPicker();

          if (
            state.currentPlaylistId ===
            playlist.id
          ) {
            renderPlaylist();
          }

          toast(
            `Removed from ${playlist.name}`
          );
        } else {
          addToPlaylist(
            playlist.id,
            state.pickerTrack
          );
        }
      };
    });

  refreshIcons();
}

function renderPlaylists() {
  const container =
    $("#playlistsResults");

  const empty =
    $("#playlistEmpty");

  if (!container) return;

  if (!state.playlists.length) {
    container.innerHTML = "";

    if (empty) {
      empty.style.display = "";
    }

    return;
  }

  if (empty) {
    empty.style.display = "none";
  }

  container.innerHTML =
    state.playlists
      .map(playlist => {
        const coverTrack =
          playlist.tracks[0];

        return `
          <article
            class="playlist-card"
            data-playlist-id="${escapeHtml(
              playlist.id
            )}"
          >
            <div class="playlist-cover">
              ${
                coverTrack
                  ? `
                    <img
                      src="${escapeHtml(
                        imageFor(
                          coverTrack
                        )
                      )}"
                      alt=""
                    >
                  `
                  : `
                    <i
                      data-lucide="list-music"
                      aria-hidden="true"
                    ></i>
                  `
              }
            </div>

            <div class="playlist-name">
              ${escapeHtml(
                playlist.name
              )}
            </div>

            <div class="playlist-count">
              ${
                playlist.tracks.length
              }
              ${
                playlist.tracks.length ===
                1
                  ? "song"
                  : "songs"
              }
            </div>
          </article>
        `;
      })
      .join("");

  $$(".playlist-card", container)
    .forEach(card => {
      card.onclick = () =>
        openPlaylist(
          card.dataset
            .playlistId
        );
    });

  refreshIcons();
}

function renderPlaylist() {
  const playlist =
    getPlaylist(
      state.currentPlaylistId
    );

  const title =
    $("#playlistTitle");

  const container =
    $("#playlistTracks");

  const empty =
    $("#playlistTracksEmpty");

  if (!playlist || !container) {
    return;
  }

  if (title) {
    title.textContent =
      playlist.name;
  }

  if (!playlist.tracks.length) {
    container.innerHTML = "";

    if (empty) {
      empty.style.display = "";
    }

    return;
  }

  if (empty) {
    empty.style.display = "none";
  }

  container.innerHTML =
    playlist.tracks
      .map((raw, index) => {
        const track =
          normalizeTrack(raw);

        const liked =
          state.liked.some(
            item =>
              key(item) ===
              key(track)
          );

        return `
          <div
            class="result-row"
            data-index="${index}"
          >
            <img
              class="cover"
              src="${escapeHtml(
                imageFor(track)
              )}"
              alt=""
            >

            <div class="result-main">

              <div class="result-title">
                ${escapeHtml(
                  track.title ||
                  "Untitled"
                )}
              </div>

              <div class="result-artist">
                ${escapeHtml(
                  track.artist
                )}
              </div>

            </div>

            <div class="result-duration">
              ${duration(
                track.duration_seconds ??
                track.duration
              )}
            </div>

            <div class="row-actions">

              <button
                class="like-row"
                type="button"
                title="Like"
                aria-label="Like"
              >
                <i
                  data-lucide="heart"
                  ${
                    liked
                      ? 'fill="currentColor"'
                      : ""
                  }
                ></i>
              </button>

              <button
                class="playlist-row"
                type="button"
                title="Remove from playlist"
                aria-label="Remove from playlist"
              >
                <i data-lucide="x"></i>
              </button>

              <button
                class="play-row"
                type="button"
                title="Play"
                aria-label="Play"
              >
                <i data-lucide="play"></i>
              </button>

            </div>
          </div>
        `;
      })
      .join("");

  $$(".result-row", container)
    .forEach(row => {
      const index =
        Number(row.dataset.index);

      const track =
        playlist.tracks[index];

      row.onclick = () => {
        playTrack(
          track,
          index,
          playlist.tracks,
          {
            type: "playlist",
            id: playlist.id
          }
        );
      };

      row.querySelector(
        ".play-row"
      ).onclick = e => {
        e.stopPropagation();

        playTrack(
          track,
          index,
          playlist.tracks,
          {
            type: "playlist",
            id: playlist.id
          }
        );
      };

      row.querySelector(
        ".like-row"
      ).onclick = e => {
        e.stopPropagation();

        toggleLike(track);

        renderPlaylist();
      };

      row.querySelector(
        ".playlist-row"
      ).onclick = e => {
        e.stopPropagation();

        removeFromPlaylist(
          playlist.id,
          key(track)
        );
      };
    });

  refreshIcons();
}


/* =========================
   VIEWS
========================= */

function setView(view) {
  state.view = view;

  $$(".view").forEach(
    el =>
      el.classList.add(
        "hidden"
      )
  );

  $(`#view-${view}`)
    ?.classList.remove(
      "hidden"
    );

  $$(".nav-link").forEach(
    el =>
      el.classList.toggle(
        "active",
        el.dataset.view === view
      )
  );

  if (view === "home") {
    renderHome();
  }

  if (view === "liked") {
    renderList(
      "#likedResults",
      state.liked
    );
  }

  if (view === "recent") {
    renderList(
      "#recentResults",
      state.recent
    );
  }

  if (view === "queue") {
    renderList(
      "#queueResults",
      state.queue
    );
  }

  if (view === "playlists") {
    renderPlaylists();
  }

  if (view === "playlist") {
    renderPlaylist();
  }

  if (view === "lyrics") {
    renderLyrics();
  }

  refreshIcons();
}


/* =========================
   CARDS / LISTS
========================= */

function renderCard(track) {
  const t =
    normalizeTrack(track);

  return `
    <article
      class="track-card"
      data-id="${escapeHtml(
        t.videoId
      )}"
    >
      <img
        class="cover"
        src="${escapeHtml(
          imageFor(t)
        )}"
        alt=""
      >

      <div class="card-title">
        ${escapeHtml(
          t.title ||
          "Untitled"
        )}
      </div>

      <div class="card-artist">
        ${escapeHtml(
          t.artist
        )}
      </div>
    </article>
  `;
}

function renderHome() {
  const list =
    $("#home-recent");

  if (!list) return;

  const recent =
    state.recent.slice(0, 4);

  list.innerHTML =
    recent
      .map(renderCard)
      .join("");

  const empty =
    $("#home-empty");

  if (empty) {
    empty.style.display =
      recent.length
        ? "none"
        : "";
  }

  bindCards(list);

  refreshIcons();
}

function renderList(
  selector,
  tracks
) {
  const container =
    $(selector);

  if (!container) return;

  if (!tracks.length) {
    container.innerHTML = `
      <div class="empty-state">
        nothing yet.
      </div>
    `;

    return;
  }

  container.innerHTML =
    tracks
      .map((raw, index) => {
        const t =
          normalizeTrack(raw);

        const liked =
          state.liked.some(
            x =>
              key(x) ===
              key(t)
          );

        return `
          <div
            class="result-row"
            data-index="${index}"
          >
            <img
              class="cover"
              src="${escapeHtml(
                imageFor(t)
              )}"
              alt=""
            >

            <div class="result-main">

              <div class="result-title">
                ${escapeHtml(
                  t.title ||
                  "Untitled"
                )}
              </div>

              <div class="result-artist">
                ${escapeHtml(
                  t.artist
                )}
              </div>

            </div>

            <div class="result-duration">
              ${duration(
                t.duration_seconds ??
                t.duration
              )}
            </div>

            <div class="row-actions">

              <button
                class="like-row"
                title="Like"
                aria-label="Like"
                type="button"
              >
                <i
                  data-lucide="heart"
                  ${
                    liked
                      ? 'fill="currentColor"'
                      : ""
                  }
                ></i>
              </button>

              <button
                class="playlist-row"
                title="Add to playlist"
                aria-label="Add to playlist"
                type="button"
              >
                <i data-lucide="list-plus"></i>
              </button>

              <button
                class="play-row"
                title="Play"
                aria-label="Play"
                type="button"
              >
                <i data-lucide="play"></i>
              </button>

            </div>
          </div>
        `;
      })
      .join("");

  $$(".result-row", container)
    .forEach(row => {
      const index =
        Number(row.dataset.index);

      const playButton =
        row.querySelector(
          ".play-row"
        );

      const likeButton =
        row.querySelector(
          ".like-row"
        );

      const playlistButton =
        row.querySelector(
          ".playlist-row"
        );

      if (playButton) {
        playButton.onclick = e => {
          e.stopPropagation();

          playTrack(
            tracks[index],
            index,
            tracks
          );
        };
      }

      if (likeButton) {
        likeButton.onclick = e => {
          e.stopPropagation();

          toggleLike(
            tracks[index]
          );

          renderList(
            selector,
            tracks
          );
        };
      }

      if (playlistButton) {
        playlistButton.onclick = e => {
          e.stopPropagation();

          openPlaylistPicker(
            tracks[index]
          );
        };
      }

      row.onclick = () =>
        playTrack(
          tracks[index],
          index,
          tracks
        );
    });

  refreshIcons();
}

function bindCards(container) {
  if (!container) return;

  container
    .querySelectorAll(
      ".track-card"
    )
    .forEach(card => {
      card.onclick = () => {
        const id =
          card.dataset.id;

        const track =
          state.recent.find(
            x =>
              key(x) === id
          ) ||
          state.results.find(
            x =>
              key(x) === id
          );

        if (track) {
          playTrack(track);
        }
      };
    });
}


/* =========================
   SEARCH
========================= */

async function search(query) {
  const q =
    query.trim();

  if (!q) return;

  const status =
    $("#searchStatus");

  const results =
    $("#searchResults");

  if (status) {
    status.textContent =
      "Searching…";
  }

  if (results) {
    results.innerHTML = "";
  }

  try {
    const response =
      await fetch(
        `/api/music/search?q=${encodeURIComponent(
          q
        )}`
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Search failed"
      );
    }

    state.results =
      Array.isArray(data)
        ? data.map(
            normalizeTrack
          )
        : [];

    if (status) {
      status.textContent =
        `${state.results.length} results`;
    }

    renderList(
      "#searchResults",
      state.results
    );
  } catch (error) {
    if (status) {
      status.textContent = "";
    }

    if (results) {
      results.innerHTML = `
        <div class="empty-state">
          ${escapeHtml(
            error.message ||
            "Search failed"
          )}
        </div>
      `;
    }
  }
}


/* =========================
   LIKES / RECENT
========================= */

function toggleLike(track) {
  const id =
    key(track);

  if (!id) return;

  const i =
    state.liked.findIndex(
      x =>
        key(x) === id
    );

  if (i >= 0) {
    state.liked.splice(i, 1);

    toast(
      "Removed from liked songs"
    );
  } else {
    state.liked.unshift(
      normalizeTrack(track)
    );

    toast(
      "Added to liked songs"
    );
  }

  save();

  updatePlayer();

  renderHome();

  if (
    state.view === "liked"
  ) {
    renderList(
      "#likedResults",
      state.liked
    );
  }
}

function addRecent(track) {
  const t =
    normalizeTrack(track);

  state.recent = [
    t,
    ...state.recent.filter(
      x =>
        key(x) !==
        key(t)
    )
  ].slice(0, 50);

  save();

  renderHome();
}


/* =========================
   PLAYBACK
========================= */

async function playTrack(
  rawTrack,
  index = -1,
  list = state.results,
  source = null
) {
  const track =
    normalizeTrack(rawTrack);

  if (!track.videoId) return;

  state.current =
    track;

  state.index =
    index;

  state.playbackList =
    list || [];

  state.playbackSource =
    source;

  state.lyricsRequest++;

  state.lyricsLoadedFor =
    null;

  state.lyrics = [];

  audio.src =
    `/api/music/stream/${encodeURIComponent(
      track.videoId
    )}`;

  audio.load();

  updatePlayer();

  renderLyrics();

  await loadLyrics(track);

  try {
    await audio.play();

    addRecent(track);
  } catch {
    toast(
      "Playback could not start. Try pressing play."
    );
  }
}

function togglePlay() {
  if (!state.current) {
    setView("search");

    $("#searchInput")
      ?.focus();

    return;
  }

  if (audio.paused) {
    audio.play().catch(
      () =>
        toast(
          "Playback blocked"
        )
    );
  } else {
    audio.pause();
  }
}

function getNextTrack() {
  const list =
    state.playbackList;

  if (list.length) {
    if (
      state.index >= 0 &&
      state.index <
        list.length - 1
    ) {
      return {
        track:
          list[
            state.index + 1
          ],
        index:
          state.index + 1,
        list,
        source:
          state.playbackSource
      };
    }
  }

  return null;
}

function getPreviousTrack() {
  const list =
    state.playbackList;

  if (list.length) {
    if (state.index > 0) {
      return {
        track:
          list[
            state.index - 1
          ],
        index:
          state.index - 1,
        list,
        source:
          state.playbackSource
      };
    }

    if (state.index === 0) {
      return {
        track: list[0],
        index: 0,
        list,
        source:
          state.playbackSource
      };
    }
  }

  return null;
}

async function playRandomSong() {
  let candidates = [
    ...state.results,
    ...state.liked,
    ...state.recent
  ];

  const seen =
    new Set();

  candidates =
    candidates
      .map(normalizeTrack)
      .filter(track => {
        const id =
          key(track);

        if (
          !id ||
          seen.has(id)
        ) {
          return false;
        }

        seen.add(id);

        return true;
      });

  if (
    state.current &&
    candidates.length > 1
  ) {
    candidates =
      candidates.filter(
        track =>
          key(track) !==
          key(state.current)
      );
  }

  if (!candidates.length) {
    return;
  }

  const track =
    candidates[
      Math.floor(
        Math.random() *
          candidates.length
      )
    ];

  await playTrack(
    track,
    -1,
    candidates,
    {
      type: "random"
    }
  );
}

function next() {
  const nextTrack =
    getNextTrack();

  if (nextTrack) {
    playTrack(
      nextTrack.track,
      nextTrack.index,
      nextTrack.list,
      nextTrack.source
    );

    return;
  }

  playRandomSong();
}

function previous() {
  if (
    audio.currentTime > 5
  ) {
    audio.currentTime = 0;
    return;
  }

  const previousTrack =
    getPreviousTrack();

  if (previousTrack) {
    playTrack(
      previousTrack.track,
      previousTrack.index,
      previousTrack.list,
      previousTrack.source
    );

    return;
  }

  if (
    state.recent.length > 1
  ) {
    const currentId =
      key(state.current);

    const recentIndex =
      state.recent.findIndex(
        track =>
          key(track) ===
          currentId
      );

    if (recentIndex > 0) {
      const track =
        state.recent[
          recentIndex - 1
        ];

      playTrack(
        track,
        recentIndex - 1,
        state.recent,
        {
          type: "recent"
        }
      );
    }
  }
}


/* =========================
   PLAYER
========================= */

function updatePlayer() {
  const t =
    state.current;

  const playerTitle =
    $("#playerTitle");

  const playerArtist =
    $("#playerArtist");

  const playerCover =
    $("#playerCover");

  const likeBtn =
    $("#likeBtn");

  const playBtn =
    $("#playBtn");

  if (playerTitle) {
    playerTitle.textContent =
      t?.title ||
      "nothing playing";
  }

  if (playerArtist) {
    playerArtist.textContent =
      t
        ? artists(t)
        : "Choose a song";
  }

  if (playerCover) {
    playerCover.src =
      t
        ? imageFor(t)
        : "/assets/img/icns/music.png";
  }

  if (likeBtn) {
    const liked =
      t &&
      state.liked.some(
        x =>
          key(x) ===
          key(t)
      );

    likeBtn.innerHTML = `
      <i
        data-lucide="heart"
        ${
          liked
            ? 'fill="currentColor"'
            : ""
        }
      ></i>
    `;
  }

  if (playBtn) {
    playBtn.innerHTML = `
      <i
        data-lucide="${
          audio.paused
            ? "play"
            : "pause"
        }"
      ></i>
    `;
  }

  refreshIcons();
}


/* =========================
   TIME
========================= */

function formatTime(seconds) {
  if (
    !Number.isFinite(seconds)
  ) {
    return "0:00";
  }

  return `${Math.floor(
    seconds / 60
  )}:${Math.floor(
    seconds % 60
  )
    .toString()
    .padStart(2, "0")}`;
}

function parseTime(value) {
  if (
    value == null ||
    value === ""
  ) {
    return 0;
  }

  const raw =
    String(value).trim();

  if (!raw) {
    return 0;
  }

  if (raw.endsWith("ms")) {
    return (
      Number.parseFloat(
        raw
      ) / 1000
    );
  }

  if (
    raw.endsWith("s") &&
    !raw.includes(":")
  ) {
    return Number.parseFloat(
      raw
    );
  }

  if (
    raw.endsWith("m") &&
    !raw.includes(":")
  ) {
    return (
      Number.parseFloat(
        raw
      ) * 60
    );
  }

  if (raw.includes(":")) {
    const parts =
      raw.split(":").map(Number);

    if (
      parts.some(
        n =>
          !Number.isFinite(n)
      )
    ) {
      return 0;
    }

    if (parts.length === 3) {
      const [
        hours,
        minutes,
        seconds
      ] = parts;

      return (
        hours * 3600 +
        minutes * 60 +
        seconds
      );
    }

    if (parts.length === 2) {
      const [
        minutes,
        seconds
      ] = parts;

      return (
        minutes * 60 +
        seconds
      );
    }
  }

  const number =
    Number.parseFloat(raw);

  return Number.isFinite(number)
    ? number
    : 0;
}


/* =========================
   LYRICS
========================= */

function cleanAdlib(text) {
  return String(text || "")
    .replace(/[()]/g, "")
    .trim();
}

function parseTTML(ttml) {
  if (!ttml) return [];

  const xml =
    new DOMParser()
      .parseFromString(
        ttml,
        "application/xml"
      );

  if (
    xml.querySelector(
      "parsererror"
    )
  ) {
    return [];
  }

  const paragraphs = [
    ...xml.querySelectorAll("p")
  ];

  return paragraphs
    .map((p, lineIndex) => {
      const agent =
        p.getAttribute(
          "ttm:agent"
        ) ||
        p.getAttribute(
          "agent"
        ) ||
        "v1";

      const lineStart =
        parseTime(
          p.getAttribute(
            "begin"
          )
        );

      const lineEnd =
        parseTime(
          p.getAttribute(
            "end"
          )
        );

      const words = [];

      function walk(
        node,
        isBg = false
      ) {
        for (
          const child of
            node.childNodes
        ) {
          if (
            child.nodeType !==
            Node.ELEMENT_NODE
          ) {
            continue;
          }

          const el = child;

          const bg =
            isBg ||
            el.getAttribute(
              "ttm:role"
            ) === "x-bg";

          if (
            el.tagName.toLowerCase() ===
              "span" &&
            el.hasAttribute(
              "begin"
            )
          ) {
            const start =
              parseTime(
                el.getAttribute(
                  "begin"
                )
              );

            const end =
              parseTime(
                el.getAttribute(
                  "end"
                )
              );

            const text =
              cleanAdlib(
                el.textContent ||
                  ""
              );

            if (text) {
              words.push({
                start,
                end,
                text,
                bg
              });
            }
          } else {
            walk(el, bg);
          }
        }
      }

      walk(p);

      if (!words.length) {
        const text =
          cleanAdlib(
            p.textContent ||
              ""
          );

        if (text) {
          words.push({
            start: lineStart,
            end: lineEnd,
            text,
            bg: false
          });
        }
      }

      return {
        index: lineIndex,
        start: lineStart,
        end: lineEnd,
        agent,
        words
      };
    })
    .filter(
      line =>
        line.words.length
    );
}

async function loadLyrics(track) {
  const requestId =
    ++state.lyricsRequest;

  const trackId =
    key(track);

  state.lyricsLoadedFor =
    trackId;

  state.lyrics = [];

  renderLyrics();

  try {
    const params =
      new URLSearchParams({
        title:
          track.title || "",

        artist:
          artists(track),

        duration: String(
          track.duration_seconds ||
            Math.round(
              parseTime(
                track.duration
              )
            )
        )
      });

    const response =
      await fetch(
        `/api/music/lyrics/${encodeURIComponent(
          track.videoId
        )}?${params}`
      );

    const data =
      await response.json();

    if (
      requestId !==
      state.lyricsRequest
    ) {
      return;
    }

    if (
      key(state.current) !==
      trackId
    ) {
      return;
    }

    let ttml =
      data?.apple?.data?.[0]
        ?.attributes
        ?.ttmlLocalizations;

    if (Array.isArray(ttml)) {
      ttml = ttml[0];
    }

    if (
      typeof ttml ===
        "object" &&
      ttml
    ) {
      ttml =
        Object.values(
          ttml
        )[0];
    }

    if (
      typeof ttml ===
      "string"
    ) {
      state.lyrics =
        parseTTML(ttml);
    } else if (
      typeof data?.lrc ===
      "string"
    ) {
      state.lyrics =
        data.lrc
          .split(/\r?\n/)
          .map(
            (line, i) => {
              const m =
                line.match(
                  /^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/
                );

              if (!m) {
                return null;
              }

              const start =
                Number(m[1]) *
                  60 +
                Number(m[2]);

              return {
                index: i,
                start,
                end: start + 4,
                agent: "v1",
                words: [
                  {
                    start,
                    end:
                      start + 4,
                    text: m[3],
                    bg: false
                  }
                ]
              };
            }
          )
          .filter(Boolean);
    }

    renderLyrics();
  } catch {
    if (
      requestId !==
      state.lyricsRequest
    ) {
      return;
    }

    state.lyrics = [];

    renderLyrics();
  }
}

function renderLyrics() {
  const t =
    state.current;

  const title =
    $("#lyricsTitle");

  const artist =
    $("#lyricsArtist");

  const cover =
    $("#lyricsCover");

  const container =
    $("#lyricsContainer");

  if (!container) return;

  if (title) {
    title.textContent =
      t?.title ||
      "nothing playing";
  }

  if (artist) {
    artist.textContent =
      t
        ? artists(t)
        : "Search for a song to begin.";
  }

  if (cover) {
    cover.src =
      t
        ? imageFor(t)
        : "";
  }

  if (!state.lyrics.length) {
    container.innerHTML = `
      <div class="lyrics-placeholder">
        Lyrics will appear here when a synchronized transcript is available.
      </div>
    `;

    return;
  }

  container.innerHTML =
    state.lyrics
      .map(line => {
        const small =
          line.agent.endsWith(
            "000"
          );

        return `
          <div
            class="lyric-line ${
              small
                ? "small"
                : ""
            }"
            data-line="${
              line.index
            }"
            data-start="${
              line.start
            }"
            data-agent="${escapeHtml(
              line.agent
            )}"
          >
            ${line.words
              .map(
                (w, i) => `
                  <span
                    class="lyric-word ${
                      w.bg
                        ? "bg"
                        : ""
                    }"
                    data-start="${
                      w.start
                    }"
                    data-end="${
                      w.end
                    }"
                    data-word="${i}"
                  >
                    ${escapeHtml(
                      w.text
                    )}
                  </span>
                  ${
                    i <
                    line.words.length -
                      1
                      ? " "
                      : ""
                  }
                `
              )
              .join("")}
          </div>
        `;
      })
      .join("");

  container
    .querySelectorAll(
      ".lyric-line"
    )
    .forEach(line => {
      line.onclick = () => {
        audio.currentTime =
          Number(
            line.dataset.start
          ) || 0;

        if (audio.paused) {
          audio
            .play()
            .catch(() => {});
        }
      };
    });

  refreshIcons();
}

let activeLyricLine = -1;
let activeLyricWord = null;

function updateLyrics() {
  if (!state.lyrics.length) {
    return;
  }

  const time =
    audio.currentTime;

  let currentLine = null;
  let currentWord = null;

  for (
    const line of state.lyrics
  ) {
    if (
      time >= line.start &&
      (
        !line.end ||
        time < line.end
      )
    ) {
      currentLine = line;
      break;
    }
  }

  if (currentLine) {
    for (
      const word of
        currentLine.words
    ) {
      if (
        time >= word.start &&
        (
          !word.end ||
          time < word.end
        )
      ) {
        currentWord = word;
        break;
      }
    }
  }

  const nextLineIndex =
    currentLine?.index ??
    -1;

  const lineChanged =
    nextLineIndex !==
    activeLyricLine;

  const wordChanged =
    currentWord !==
    activeLyricWord;

  if (
    !lineChanged &&
    !wordChanged
  ) {
    return;
  }

  activeLyricLine =
    nextLineIndex;

  activeLyricWord =
    currentWord;

  $$(".lyric-line")
    .forEach(line => {
      const lineIndex =
        Number(
          line.dataset.line
        );

      line.classList.toggle(
        "active",
        lineIndex ===
          activeLyricLine
      );

      line
        .querySelectorAll(
          ".lyric-word"
        )
        .forEach(word => {
          const start =
            Number(
              word.dataset.start
            );

          const end =
            Number(
              word.dataset.end
            );

          word.classList.toggle(
            "active",
            time >= start &&
              (
                !end ||
                time < end
              )
          );
        });
    });

  if (
    lineChanged &&
    currentLine &&
    state.view === "lyrics"
  ) {
    const element =
      document.querySelector(
        `.lyric-line[data-line="${currentLine.index}"]`
      );

    if (element) {
      element.scrollIntoView({
        behavior: "instant",
        block: "center"
      });
    }
  }
}


/* =========================
   NAVIGATION
========================= */

$$("[data-view]")
  .forEach(btn => {
    btn.onclick = () =>
      setView(
        btn.dataset.view
      );
  });

$$(".text-button")
  .forEach(btn => {
    btn.onclick = () =>
      setView("recent");
  });


/* =========================
   PLAYLIST CONTROLS
========================= */

const createPlaylistBtn =
  $("#createPlaylistBtn");

if (createPlaylistBtn) {
  createPlaylistBtn.onclick =
    createPlaylist;
}

const pickerCreatePlaylist =
  $("#pickerCreatePlaylist");

if (pickerCreatePlaylist) {
  pickerCreatePlaylist.onclick =
    () => {
      closePlaylistPicker();
      createPlaylist();
    };
}

const closePlaylistPickerBtn =
  $("#closePlaylistPicker");

if (closePlaylistPickerBtn) {
  closePlaylistPickerBtn.onclick =
    closePlaylistPicker;
}

const playlistPicker =
  $("#playlistPicker");

if (playlistPicker) {
  playlistPicker.onclick = e => {
    if (
      e.target ===
      playlistPicker
    ) {
      closePlaylistPicker();
    }
  };
}

const backToPlaylists =
  $("#backToPlaylists");

if (backToPlaylists) {
  backToPlaylists.onclick =
    () => {
      state.currentPlaylistId =
        null;

      setView("playlists");
    };
}

const deletePlaylistBtn =
  $("#deletePlaylistBtn");

if (deletePlaylistBtn) {
  deletePlaylistBtn.onclick =
    deleteCurrentPlaylist;
}


/* =========================
   SEARCH INPUT
========================= */

const searchInput =
  $("#searchInput");

if (searchInput) {
  searchInput.addEventListener(
    "keydown",
    e => {
      if (e.key === "Enter") {
        search(
          e.target.value
        );
      }
    }
  );

  searchInput.addEventListener(
    "input",
    e => {
      clearTimeout(
        search.timer
      );

      search.timer =
        setTimeout(
          () =>
            search(
              e.target.value
            ),
          350
        );
    }
  );
}


/* =========================
   PLAYER BUTTONS
========================= */

const playBtn =
  $("#playBtn");

if (playBtn) {
  playBtn.onclick =
    togglePlay;
}

const nextBtn =
  $("#nextBtn");

if (nextBtn) {
  nextBtn.onclick =
    next;
}

const prevBtn =
  $("#prevBtn");

if (prevBtn) {
  prevBtn.onclick =
    previous;
}

const lyricsBtn =
  $("#lyricsBtn");

if (lyricsBtn) {
  lyricsBtn.onclick =
    () =>
      setView("lyrics");
}


/*
 * PLAYER PLAYLIST BUTTON
 *
 * IMPORTANT:
 * Uses state.current instead of
 * currentTrack.
 */
const playlistBtn =
  $("#playlistBtn");

if (playlistBtn) {
  playlistBtn.onclick = () => {
    if (!state.current) {
      toast("Nothing is playing");
      return;
    }

    openPlaylistPicker(
      state.current
    );
  };
}


const likeBtn =
  $("#likeBtn");

if (likeBtn) {
  likeBtn.onclick = () => {
    if (state.current) {
      toggleLike(
        state.current
      );
    }
  };
}


/* =========================
   PROGRESS
========================= */

const progress =
  $("#progress");

if (progress) {
  progress.oninput = e => {
    if (audio.duration) {
      audio.currentTime =
        (
          Number(
            e.target.value
          ) / 100
        ) *
        audio.duration;
    }
  };
}


/* =========================
   VOLUME
========================= */

const volume =
  $("#volume");

if (volume) {
  audio.volume =
    Number(volume.value);

  volume.oninput = e => {
    audio.volume =
      Number(e.target.value);
  };
}


/* =========================
   MUTE
========================= */

const muteBtn =
  $("#muteBtn");

if (muteBtn) {
  muteBtn.onclick = () => {
    audio.muted =
      !audio.muted;

    muteBtn.innerHTML = `
      <i
        data-lucide="${
          audio.muted
            ? "volume-x"
            : "volume-2"
        }"
      ></i>
    `;

    refreshIcons();
  };
}


/* =========================
   AUDIO EVENTS
========================= */

audio.addEventListener(
  "play",
  updatePlayer
);

audio.addEventListener(
  "pause",
  updatePlayer
);

audio.addEventListener(
  "ended",
  () => {
    next();
  }
);

audio.addEventListener(
  "timeupdate",
  () => {
    const pct =
      audio.duration
        ? (
            audio.currentTime /
            audio.duration
          ) * 100
        : 0;

    if (progress) {
      progress.value =
        pct;
    }

    const currentTime =
      $("#currentTime");

    if (currentTime) {
      currentTime.textContent =
        formatTime(
          audio.currentTime
        );
    }

    updateLyrics();
  }
);

audio.addEventListener(
  "loadedmetadata",
  () => {
    const durationEl =
      $("#duration");

    if (durationEl) {
      durationEl.textContent =
        formatTime(
          audio.duration
        );
    }
  }
);

audio.addEventListener(
  "error",
  () => {
    if (state.current) {
      toast(
        "Unable to play this song"
      );
    }
  }
);


/* =========================
   LYRICS CLOSE
========================= */

const lyricsClose =
  $("#lyricsClose");

if (lyricsClose) {
  lyricsClose.onclick =
    () => {
      setView("home");
    };
}


/* =========================
   INITIALIZE
========================= */

refreshIcons();

renderPlaylists();

setView("home");

renderHome();

updatePlayer();