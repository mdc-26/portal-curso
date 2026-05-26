const SESSION_KEY = "coursePortalSession";
const THEME_KEY = "theme";
const WATCHED_PREFIX = "watched_";
const PASSWORD_BASE64 = "bG91dm9yMjY="; // Gerada com btoa("louvor26")

const state = {
  course: null,
  flatLessons: [],
  currentModuleId: null,
  currentLessonId: null,
  expandedModules: new Set(),
};

const elements = {};
const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  bindEvents();
  syncThemeToggle();

  if (themeMedia.addEventListener) {
    themeMedia.addEventListener("change", handleSystemThemeChange);
  } else if (themeMedia.addListener) {
    themeMedia.addListener(handleSystemThemeChange);
  }

  if (isLoggedIn()) {
    await openHome();
    return;
  }

  showLogin();
});

function cacheElements() {
  elements.loginView = document.getElementById("login-view");
  elements.homeView = document.getElementById("home-view");
  elements.portalView = document.getElementById("portal-view");
  elements.loginForm = document.getElementById("login-form");
  elements.passwordInput = document.getElementById("password-input");
  elements.passwordToggle = document.getElementById("password-toggle");
  elements.passwordIconOpen = elements.passwordToggle.querySelector(".password-icon-open");
  elements.passwordIconClosed = elements.passwordToggle.querySelector(".password-icon-closed");
  elements.loginError = document.getElementById("login-error");
  elements.homeCourseTitle = document.getElementById("home-course-title");
  elements.homeModuleGrid = document.getElementById("home-module-grid");
  elements.currentModuleTitle = document.getElementById("current-module-title");
  elements.moduleList = document.getElementById("module-list");
  elements.currentLessonTitle = document.getElementById("current-lesson-title");
  elements.lessonMeta = document.getElementById("lesson-meta");
  elements.viewerContainer = document.getElementById("viewer-container");
  elements.prevButton = document.getElementById("prev-button");
  elements.nextButton = document.getElementById("next-button");
  elements.downloadButton = document.getElementById("download-button");
  elements.markWatchedButton = document.getElementById("mark-watched-button");
  elements.themeToggles = Array.from(document.querySelectorAll("[data-theme-toggle]"));
  elements.logoutButtons = Array.from(document.querySelectorAll("[data-logout-button]"));
  elements.menuButton = document.getElementById("menu-button");
  elements.mobileOverlay = document.getElementById("mobile-overlay");
  elements.backToHomeButton = document.getElementById("back-to-home-button");
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", handleLoginSubmit);
  elements.passwordToggle.addEventListener("click", togglePasswordVisibility);
  elements.homeModuleGrid.addEventListener("click", handleHomeModuleGridClick);
  elements.moduleList.addEventListener("click", handleModuleListClick);
  elements.prevButton.addEventListener("click", () => navigateLesson(-1));
  elements.nextButton.addEventListener("click", () => navigateLesson(1));
  elements.markWatchedButton.addEventListener("click", markCurrentLessonAsWatched);
  elements.themeToggles.forEach((button) => {
    button.addEventListener("click", toggleTheme);
  });
  elements.logoutButtons.forEach((button) => {
    button.addEventListener("click", logout);
  });
  elements.menuButton.addEventListener("click", toggleDrawer);
  elements.mobileOverlay.addEventListener("click", closeDrawer);
  elements.backToHomeButton.addEventListener("click", openHome);
  window.addEventListener("resize", handleViewportChange);
}

function handleSystemThemeChange(event) {
  if (localStorage.getItem(THEME_KEY)) {
    return;
  }

  applyTheme(event.matches ? "dark" : "light", false);
}

function syncThemeToggle() {
  const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
  elements.themeToggles.forEach((button) => {
    button.textContent = currentTheme === "dark" ? "☀" : "🌙";
    button.setAttribute(
      "aria-label",
      currentTheme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"
    );
  });
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(nextTheme, true);
}

function applyTheme(theme, persist) {
  document.documentElement.setAttribute("data-theme", theme);

  if (persist) {
    localStorage.setItem(THEME_KEY, theme);
  }

  syncThemeToggle();
}

function isLoggedIn() {
  try {
    const savedSession = sessionStorage.getItem(SESSION_KEY);

    if (!savedSession) {
      return false;
    }

    return JSON.parse(savedSession)?.loggedIn === true;
  } catch (error) {
    return false;
  }
}

function persistLogin() {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ loggedIn: true }));
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const password = elements.passwordInput.value.trim();
  const decodedPassword = atob(PASSWORD_BASE64);
  const encodedPassword = btoa(password);

  if (password !== decodedPassword || encodedPassword !== PASSWORD_BASE64) {
    elements.loginError.textContent = "Senha incorreta. Tente novamente.";
    elements.passwordInput.select();
    return;
  }

  elements.loginError.textContent = "";
  persistLogin();
  await openHome();
}

async function openHome() {
  closeDrawer();
  elements.loginView.classList.add("hidden");
  elements.portalView.classList.add("hidden");
  elements.homeView.classList.remove("hidden");
  state.currentModuleId = null;
  state.flatLessons = [];

  try {
    if (!state.course) {
      await loadCourse();
    }

    renderHome();
  } catch (error) {
    renderCourseLoadError(error.message);
  }
}

async function openModule(moduleId) {
  closeDrawer();

  try {
    if (!state.course) {
      await loadCourse();
    }

    const module = getModuleById(moduleId);

    if (!module) {
      return;
    }

    state.currentModuleId = module.id;
    state.flatLessons = module.lessons.map((lesson) => ({
      ...lesson,
      moduleId: module.id,
      moduleTitle: module.title,
    }));

    if (!state.flatLessons.some((lesson) => lesson.id === state.currentLessonId)) {
      state.currentLessonId = state.flatLessons[0]?.id ?? null;
    }

    ensureCurrentLessonModuleIsExpanded();
    elements.loginView.classList.add("hidden");
    elements.homeView.classList.add("hidden");
    elements.portalView.classList.remove("hidden");
    renderApp();
  } catch (error) {
    renderCourseLoadError(error.message);
  }
}

function showLogin() {
  closeDrawer();
  state.currentModuleId = null;
  state.flatLessons = [];
  elements.homeView.classList.add("hidden");
  elements.portalView.classList.add("hidden");
  elements.loginView.classList.remove("hidden");
  elements.passwordInput.value = "";
  setPasswordVisibility(false);
  elements.passwordInput.focus();
}

function togglePasswordVisibility() {
  const isVisible = elements.passwordInput.type === "text";
  setPasswordVisibility(!isVisible);
}

function setPasswordVisibility(isVisible) {
  elements.passwordInput.type = isVisible ? "text" : "password";
  elements.passwordIconOpen.classList.toggle("hidden", isVisible);
  elements.passwordIconClosed.classList.toggle("hidden", !isVisible);
  elements.passwordToggle.setAttribute(
    "aria-label",
    isVisible ? "Ocultar senha" : "Mostrar senha"
  );
  elements.passwordToggle.setAttribute("aria-pressed", String(isVisible));
}

function logout() {
  sessionStorage.clear();
  showLogin();
}

async function loadCourse() {
  const response = await fetch("./data/course.json");

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar o arquivo course.json.");
  }

  const payload = await response.json();
  const course = payload?.course;

  if (!course?.modules?.length) {
    throw new Error("Estrutura de curso invalida.");
  }

  state.course = course;
  document.title = `${course.title} | Portal do Curso`;
}

function renderCourseLoadError(message) {
  elements.loginView.classList.add("hidden");
  elements.homeView.classList.add("hidden");
  elements.portalView.classList.remove("hidden");
  elements.currentModuleTitle.textContent = "Erro ao carregar curso";
  elements.currentLessonTitle.textContent = "Conteudo indisponivel";
  elements.lessonMeta.innerHTML = "";
  elements.viewerContainer.innerHTML = `
    <div class="error-state">
      <h2>Falha ao carregar o curso</h2>
      <p>${message}</p>
    </div>
  `;
  elements.moduleList.innerHTML = "";
  elements.prevButton.disabled = true;
  elements.nextButton.disabled = true;
  elements.downloadButton.href = "#";
  elements.markWatchedButton.disabled = true;
}

function renderHome() {
  if (!state.course) {
    return;
  }

  elements.homeCourseTitle.textContent = state.course.title;
  elements.homeModuleGrid.innerHTML = "";

  const fragment = document.createDocumentFragment();

  state.course.modules.forEach((module) => {
    const totalLessons = module.lessons.length;
    const watchedLessons = module.lessons.filter((lesson) => isLessonWatched(lesson.id)).length;
    const progress = totalLessons === 0 ? 0 : Math.round((watchedLessons / totalLessons) * 100);
    const videoLessons = module.lessons.filter((lesson) => lesson.type === "video").length;
    const pdfLessons = totalLessons - videoLessons;
    const dominantIcon = videoLessons >= pdfLessons ? "▶" : "📄";
    const moduleCard = document.createElement("button");
    const hasThumbnail = Boolean(module.thumbnail?.trim());

    moduleCard.type = "button";
    moduleCard.className = "module-overview-card";
    moduleCard.dataset.moduleOpen = module.id;
    moduleCard.innerHTML = `
      <span class="module-overview-thumb">
        <img 
          src="${module.thumbnail || ""}" 
          alt="" 
          class="card-thumbnail-img"
          style="display:none; width:100%; height:100%; object-fit:cover; border-radius:6px 6px 0 0;"
        >
        <span class="module-overview-icon" aria-hidden="true">${dominantIcon}</span>
      </span>
      <span class="module-overview-info">
        ${hasThumbnail ? "" : `<strong class="module-overview-title">${module.title}</strong>`}
        <span class="module-overview-count">${totalLessons} aula(s)</span>
        <span class="module-overview-progress">
          <span class="progress-track" aria-hidden="true">
            <span class="progress-bar" style="width: ${progress}%;"></span>
          </span>
          <span class="module-overview-progress-text">${progress}% concluído</span>
        </span>
      </span>
    `;

    const thumbnailImg = moduleCard.querySelector(".card-thumbnail-img");
    const iconEl = moduleCard.querySelector(".module-overview-icon");

    if (hasThumbnail) {
      thumbnailImg.addEventListener("load", () => {
        thumbnailImg.style.display = "block";
        iconEl.style.display = "none";
      });

      thumbnailImg.addEventListener("error", () => {
        thumbnailImg.style.display = "none";
        iconEl.style.display = "";
      });
    }

    fragment.appendChild(moduleCard);
  });

  elements.homeModuleGrid.appendChild(fragment);
}

function renderApp() {
  const module = getCurrentModule();

  if (!state.course || !module) {
    return;
  }

  elements.currentModuleTitle.textContent = module.title;
  ensureCurrentLessonModuleIsExpanded();
  renderSidebar();
  renderCurrentLesson();
}

function renderSidebar() {
  elements.moduleList.innerHTML = "";

  const fragment = document.createDocumentFragment();

  state.flatLessons.forEach((lesson) => {
    const lessonButton = document.createElement("button");
    const watched = isLessonWatched(lesson.id);
    const isActive = lesson.id === state.currentLessonId;
    const icon = lesson.type === "video" ? "▶" : "📄";

    lessonButton.type = "button";
    lessonButton.className = `lesson-item${isActive ? " is-active" : ""}`;
    lessonButton.dataset.lessonId = lesson.id;

    lessonButton.innerHTML = `
      <span class="lesson-icon" aria-hidden="true">${icon}</span>
      <span class="lesson-copy">
        <strong>${lesson.title}</strong>
        <span class="lesson-meta-line">
          <span class="lesson-type">${lesson.type === "video" ? "Video" : "PDF"}</span>
          ${lesson.duration ? `<span class="lesson-duration">${lesson.duration}</span>` : ""}
        </span>
      </span>
      <span class="lesson-check" aria-label="${watched ? "Assistida" : "Nao assistida"}">${watched ? "✓" : ""}</span>
    `;

    fragment.appendChild(lessonButton);
  });

  elements.moduleList.appendChild(fragment);
}

function renderCurrentLesson() {
  const lesson = getCurrentLesson();

  if (!lesson) {
    elements.currentLessonTitle.textContent = "Selecione uma aula";
    elements.lessonMeta.innerHTML = "";
    elements.viewerContainer.innerHTML = `
      <div class="placeholder-state">
        <h2>Nenhuma aula selecionada</h2>
        <p>Escolha um item no menu lateral para carregar o conteudo.</p>
      </div>
    `;
    elements.prevButton.disabled = true;
    elements.nextButton.disabled = true;
    elements.downloadButton.href = "#";
    elements.markWatchedButton.disabled = true;
    return;
  }

  const currentIndex = state.flatLessons.findIndex((item) => item.id === lesson.id);
  const watched = isLessonWatched(lesson.id);
  const previewUrl = getDrivePreviewUrl(lesson.driveId);

  elements.currentLessonTitle.textContent = lesson.title;
  elements.lessonMeta.innerHTML = `
    <p class="lesson-module-label">${lesson.moduleTitle}</p>
    <p>${lesson.type === "video" ? "Video" : "PDF"}${lesson.duration ? ` • ${lesson.duration}` : ""}</p>
  `;

  elements.viewerContainer.innerHTML = "";

  if (lesson.type === "video") {
    const videoEl = document.createElement("video");
    videoEl.className = "viewer-frame";
    videoEl.controls = true;
    videoEl.preload = "metadata";
    videoEl.setAttribute("playsinline", "");
    videoEl.innerHTML = `
      <source src="https://gdrive-proxy.alan-tcn1.workers.dev/?id=${lesson.driveId}" type="video/mp4">
      Seu navegador não suporta o player de vídeo.
    `;
    const videoWrapper = document.createElement("div");
    videoWrapper.className = "video-wrapper";

    const videoPlaceholder = document.createElement("div");
    videoPlaceholder.className = "video-placeholder";
    videoPlaceholder.innerHTML = `
      <div class="play-icon">▶</div>
      <p>Carregando vídeo...</p>
    `;

    videoEl.addEventListener("canplay", () => {
      videoEl.closest(".video-wrapper")?.classList.add("is-loaded");
    });

    videoWrapper.appendChild(videoPlaceholder);
    videoWrapper.appendChild(videoEl);
    elements.viewerContainer.appendChild(videoWrapper);
  } else {
    const iframe = document.createElement("iframe");
    iframe.className = "viewer-frame";
    iframe.src = previewUrl;
    iframe.height = "700px";
    iframe.style.height = "700px";
    iframe.setAttribute("frameborder", "0");
    elements.viewerContainer.appendChild(iframe);
  }

  elements.prevButton.disabled = currentIndex <= 0;
  elements.nextButton.disabled = currentIndex === -1 || currentIndex >= state.flatLessons.length - 1;
  elements.downloadButton.href = getDriveDownloadUrl(lesson.driveId);
  elements.markWatchedButton.disabled = false;
  elements.markWatchedButton.textContent = watched ? "✓ Assistida" : "✓ Marcar como assistida";
}

async function handleHomeModuleGridClick(event) {
  const moduleCard = event.target.closest("[data-module-open]");

  if (moduleCard) {
    await openModule(moduleCard.dataset.moduleOpen);
  }
}

function handleModuleListClick(event) {
  const lessonButton = event.target.closest("[data-lesson-id]");

  if (lessonButton) {
    selectLesson(lessonButton.dataset.lessonId);
  }
}

function toggleModule(moduleId) {
  if (state.expandedModules.has(moduleId)) {
    state.expandedModules.clear();
  } else {
    state.expandedModules.clear();
    state.expandedModules.add(moduleId);
  }

  renderSidebar();
}

function selectLesson(lessonId) {
  state.currentLessonId = lessonId;
  ensureCurrentLessonModuleIsExpanded();
  renderApp();

  if (window.innerWidth < 768) {
    closeDrawer();
  }
}

function navigateLesson(offset) {
  const currentIndex = state.flatLessons.findIndex((lesson) => lesson.id === state.currentLessonId);
  const nextLesson = state.flatLessons[currentIndex + offset];

  if (!nextLesson) {
    return;
  }

  selectLesson(nextLesson.id);
}

function getCurrentLesson() {
  return state.flatLessons.find((lesson) => lesson.id === state.currentLessonId) || null;
}

function getCurrentModule() {
  if (!state.course || !state.currentModuleId) {
    return null;
  }

  return getModuleById(state.currentModuleId);
}

function getModuleById(moduleId) {
  return state.course?.modules.find((module) => module.id === moduleId) || null;
}

function ensureCurrentLessonModuleIsExpanded() {
  const lesson = getCurrentLesson();

  if (lesson?.moduleId) {
    state.currentModuleId = lesson.moduleId;
    state.expandedModules.clear();
    state.expandedModules.add(lesson.moduleId);
  }
}

function markCurrentLessonAsWatched() {
  const lesson = getCurrentLesson();

  if (!lesson) {
    return;
  }

  localStorage.setItem(`${WATCHED_PREFIX}${lesson.id}`, "true");
  renderApp();
}

function isLessonWatched(lessonId) {
  return localStorage.getItem(`${WATCHED_PREFIX}${lessonId}`) === "true";
}

function getDrivePreviewUrl(driveId) {
  return `https://drive.google.com/file/d/${driveId}/preview?rm=minimal`;
}

function getDriveDownloadUrl(driveId) {
  return `https://drive.google.com/uc?export=download&id=${driveId}`;
}

function toggleDrawer() {
  document.body.classList.toggle("drawer-open");
  updateDrawerOverlay();
}

function closeDrawer() {
  document.body.classList.remove("drawer-open");
  updateDrawerOverlay();
}

function updateDrawerOverlay() {
  const isDrawerOpen = document.body.classList.contains("drawer-open");
  elements.mobileOverlay.classList.toggle("hidden", !isDrawerOpen);
}

function handleViewportChange() {
  if (window.innerWidth >= 768) {
    closeDrawer();
  }
}
