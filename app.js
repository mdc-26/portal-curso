const SESSION_KEY = "coursePortalSession";
const THEME_KEY = "theme";
const WATCHED_PREFIX = "watched_";
const PASSWORD_BASE64 = "bG91dm9yMjY="; // Gerada com btoa("louvor26")

const state = {
  course: null,
  flatLessons: [],
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
    await openPortal();
    return;
  }

  showLogin();
});

function cacheElements() {
  elements.loginView = document.getElementById("login-view");
  elements.portalView = document.getElementById("portal-view");
  elements.loginForm = document.getElementById("login-form");
  elements.passwordInput = document.getElementById("password-input");
  elements.loginError = document.getElementById("login-error");
  elements.courseTitle = document.getElementById("course-title");
  elements.moduleList = document.getElementById("module-list");
  elements.currentLessonTitle = document.getElementById("current-lesson-title");
  elements.lessonMeta = document.getElementById("lesson-meta");
  elements.viewerContainer = document.getElementById("viewer-container");
  elements.prevButton = document.getElementById("prev-button");
  elements.nextButton = document.getElementById("next-button");
  elements.downloadButton = document.getElementById("download-button");
  elements.markWatchedButton = document.getElementById("mark-watched-button");
  elements.themeToggle = document.getElementById("theme-toggle");
  elements.logoutButton = document.getElementById("logout-button");
  elements.menuButton = document.getElementById("menu-button");
  elements.mobileOverlay = document.getElementById("mobile-overlay");
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", handleLoginSubmit);
  elements.moduleList.addEventListener("click", handleModuleListClick);
  elements.prevButton.addEventListener("click", () => navigateLesson(-1));
  elements.nextButton.addEventListener("click", () => navigateLesson(1));
  elements.markWatchedButton.addEventListener("click", markCurrentLessonAsWatched);
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.logoutButton.addEventListener("click", logout);
  elements.menuButton.addEventListener("click", toggleDrawer);
  elements.mobileOverlay.addEventListener("click", closeDrawer);
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
  elements.themeToggle.textContent = currentTheme === "dark" ? "☀" : "🌙";
  elements.themeToggle.setAttribute(
    "aria-label",
    currentTheme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"
  );
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

function handleLoginSubmit(event) {
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
  openPortal();
}

async function openPortal() {
  elements.loginView.classList.add("hidden");
  elements.portalView.classList.remove("hidden");

  if (!state.course) {
    await loadCourse();
  } else {
    renderApp();
  }
}

function showLogin() {
  closeDrawer();
  elements.portalView.classList.add("hidden");
  elements.loginView.classList.remove("hidden");
  elements.passwordInput.value = "";
  elements.passwordInput.focus();
}

function logout() {
  sessionStorage.clear();
  showLogin();
}

async function loadCourse() {
  try {
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
    state.flatLessons = course.modules.flatMap((module) =>
      module.lessons.map((lesson) => ({
        ...lesson,
        moduleId: module.id,
        moduleTitle: module.title,
      }))
    );

    state.expandedModules = new Set([course.modules[0].id]);

    if (!state.currentLessonId && state.flatLessons.length > 0) {
      state.currentLessonId = state.flatLessons[0].id;
    }

    ensureCurrentLessonModuleIsExpanded();
    document.title = `${course.title} | Portal do Curso`;
    renderApp();
  } catch (error) {
    renderCourseLoadError(error.message);
  }
}

function renderCourseLoadError(message) {
  elements.courseTitle.textContent = "Erro ao carregar curso";
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

function renderApp() {
  if (!state.course) {
    return;
  }

  elements.courseTitle.textContent = state.course.title;
  ensureCurrentLessonModuleIsExpanded();
  renderSidebar();
  renderCurrentLesson();
}

function renderSidebar() {
  elements.moduleList.innerHTML = "";

  const fragment = document.createDocumentFragment();

  state.course.modules.forEach((module) => {
    const totalLessons = module.lessons.length;
    const watchedLessons = module.lessons.filter((lesson) => isLessonWatched(lesson.id)).length;
    const progress = totalLessons === 0 ? 0 : (watchedLessons / totalLessons) * 100;
    const isOpen = state.expandedModules.has(module.id);

    const moduleCard = document.createElement("section");
    moduleCard.className = `module-card${isOpen ? " is-open" : ""}`;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "module-trigger";
    trigger.dataset.moduleToggle = module.id;
    trigger.setAttribute("aria-expanded", String(isOpen));

    trigger.innerHTML = `
      <span class="module-chevron" aria-hidden="true">▸</span>
      <span class="module-title-wrap">
        <span class="module-title">${module.title}</span>
        <span class="module-count">${totalLessons} aula(s)</span>
      </span>
      <span class="module-progress-text">${watchedLessons}/${totalLessons} assistidas</span>
    `;

    moduleCard.appendChild(trigger);

    const progressWrap = document.createElement("div");
    progressWrap.className = "module-progress";
    progressWrap.innerHTML = `
      <div class="progress-track" aria-hidden="true">
        <div class="progress-bar" style="width: ${progress}%;"></div>
      </div>
    `;
    moduleCard.appendChild(progressWrap);

    if (isOpen) {
      const lessonsWrap = document.createElement("div");
      lessonsWrap.className = "lessons";

      module.lessons.forEach((lesson) => {
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

        lessonsWrap.appendChild(lessonButton);
      });

      moduleCard.appendChild(lessonsWrap);
    }

    fragment.appendChild(moduleCard);
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
    <p>${lesson.moduleTitle} • ${lesson.type === "video" ? "Video" : "PDF"}${lesson.duration ? ` • ${lesson.duration}` : ""}</p>
  `;

  elements.viewerContainer.innerHTML = "";

  const iframe = document.createElement("iframe");
  iframe.className = "viewer-frame";
  iframe.src = previewUrl;
  if (lesson.type === "pdf") {
    iframe.height = "700px";
    iframe.style.height = "700px";
  }
  iframe.setAttribute("frameborder", "0");

  if (lesson.type === "video") {
    iframe.setAttribute("allow", "autoplay");
  }

  elements.viewerContainer.appendChild(iframe);

  elements.prevButton.disabled = currentIndex <= 0;
  elements.nextButton.disabled = currentIndex === -1 || currentIndex >= state.flatLessons.length - 1;
  elements.downloadButton.href = getDriveDownloadUrl(lesson.driveId);
  elements.markWatchedButton.disabled = false;
  elements.markWatchedButton.textContent = watched ? "✓ Assistida" : "✓ Marcar como assistida";
}

function handleModuleListClick(event) {
  const moduleToggle = event.target.closest("[data-module-toggle]");
  const lessonButton = event.target.closest("[data-lesson-id]");

  if (moduleToggle) {
    toggleModule(moduleToggle.dataset.moduleToggle);
    return;
  }

  if (lessonButton) {
    selectLesson(lessonButton.dataset.lessonId);
  }
}

function toggleModule(moduleId) {
  if (state.expandedModules.has(moduleId)) {
    state.expandedModules.delete(moduleId);
  } else {
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

function ensureCurrentLessonModuleIsExpanded() {
  const lesson = getCurrentLesson();

  if (lesson?.moduleId) {
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
  return `https://drive.google.com/file/d/${driveId}/preview`;
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
