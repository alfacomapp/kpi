(function () {
  var utils = window.KPIUtils;
  var api = window.KPIApi;
  var auth = window.KPIAuth;

  var state = {
    user: null,
    bootstrap: null,
    recorder: null,
    audioChunks: [],
    audioBlob: null
  };

  function init() {
    bindEvents();
    setDefaultDates();
    renderToday();
    updateDemoHint();
    if (window.lucide) window.lucide.createIcons();

    auth.validateSession()
      .then(function (session) {
        if (session && session.user) {
          state.user = session.user;
          showApp();
          return loadBootstrap();
        }
        showLogin();
        return null;
      })
      .catch(function () {
        auth.clearSession();
        showLogin();
      });
  }

  function bindEvents() {
    utils.qs("#loginForm").addEventListener("submit", handleLogin);
    utils.qs("#biometricLoginBtn").addEventListener("click", handleBiometricLogin);
    utils.qs("#logoutBtn").addEventListener("click", logout);
    utils.qs("#refreshBtn").addEventListener("click", function () { loadBootstrap(true); });
    utils.qs("#backupBtn").addEventListener("click", handleBackup);
    utils.qs("#recordBtn").addEventListener("click", toggleRecording);
    utils.qs("#noteForm").addEventListener("submit", handleNoteSubmit);
    utils.qs("#dailyForm").addEventListener("submit", handleDailySubmit);
    utils.qs("#weeklyForm").addEventListener("submit", handleWeeklySubmit);
    utils.qs("#shipmentForm").addEventListener("submit", handleShipmentSubmit);
    utils.qs("#auditReviewForm").addEventListener("submit", handleAuditReviewSubmit);
    utils.qs("#syncForm").addEventListener("submit", handleSyncSubmit);
    utils.qs("#debtForm").addEventListener("submit", handleDebtSubmit);
    utils.qs("#passwordForm").addEventListener("submit", handlePasswordSubmit);
    utils.qs("#enableBiometricBtn").addEventListener("click", handleEnableBiometric);

    utils.qsa("[data-section]").forEach(function (button) {
      button.addEventListener("click", function () {
        activateSection(button.dataset.section);
      });
    });

    document.addEventListener("click", function (event) {
      var arrivalButton = event.target.closest("[data-arrival-id]");
      if (arrivalButton) handleArrival(arrivalButton);
    });
  }

  function renderToday() {
    utils.qs("#todayLabel").textContent = utils.formatDate(new Date(), {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
  }

  function updateDemoHint() {
    var hint = utils.qs(".demo-hint");
    var isDemo = !window.KPI_CONFIG.API_BASE_URL && window.KPI_CONFIG.DEMO_MODE_WHEN_API_EMPTY;
    hint.classList.toggle("is-hidden", !isDemo);
  }

  function setDefaultDates() {
    var today = utils.getTodayInputValue();
    var now = utils.getLocalDateTimeValue();
    var weekStart = new Date();
    var day = weekStart.getDay();
    var diffToMonday = day === 0 ? -6 : 1 - day;
    weekStart.setDate(weekStart.getDate() + diffToMonday);
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 5);
    weekStart.setMinutes(weekStart.getMinutes() - weekStart.getTimezoneOffset());
    weekEnd.setMinutes(weekEnd.getMinutes() - weekEnd.getTimezoneOffset());

    utils.qs('#dailyForm [name="reportDate"]').value = today;
    utils.qs('#weeklyForm [name="weekStart"]').value = weekStart.toISOString().slice(0, 10);
    utils.qs('#weeklyForm [name="weekEnd"]').value = weekEnd.toISOString().slice(0, 10);
    utils.qs('#shipmentForm [name="sentAt"]').value = now;
  }

  function showLogin() {
    utils.qs("#loginView").classList.remove("is-hidden");
    utils.qs("#appView").classList.add("is-hidden");
  }

  function showApp() {
    utils.qs("#loginView").classList.add("is-hidden");
    utils.qs("#appView").classList.remove("is-hidden");
    applyUserChrome();
  }

  function applyUserChrome() {
    if (!state.user) return;
    var role = state.user.role || "";
    utils.qs("#roleLabel").textContent = utils.normalizeRole(role);
    utils.qs("#welcomeTitle").textContent = "Halo, " + (state.user.name || state.user.username);
    applyRoleVisibility();
    setShipmentLocationDefaults();
  }

  function applyRoleVisibility() {
    var role = (state.user && state.user.role) || "";
    var rules = [
      { className: "owner-only", allowed: role === "owner" },
      { className: "auditor-only", allowed: role === "auditor" },
      { className: "admin-only", allowed: role.indexOf("admin_") === 0 }
    ];

    utils.qsa(".owner-only,.auditor-only,.admin-only").forEach(function (element) {
      var hasRule = false;
      var allowed = false;
      rules.forEach(function (rule) {
        if (element.classList.contains(rule.className)) {
          hasRule = true;
          allowed = allowed || rule.allowed;
        }
      });
      element.classList.toggle("is-hidden", hasRule && !allowed);
    });

    var activeNav = utils.qs(".nav-item.active");
    if (activeNav && activeNav.classList.contains("is-hidden")) {
      activateSection("dashboardSection");
    }
  }

  function setShipmentLocationDefaults() {
    var origin = utils.qs('#shipmentForm [name="origin"]');
    var destination = utils.qs('#shipmentForm [name="destination"]');
    if (!state.user || !origin || !destination) return;
    if (state.user.location === "Kendari") {
      origin.value = "Kendari";
      destination.value = "Raha";
    }
    if (state.user.location === "Raha") {
      origin.value = "Raha";
      destination.value = "Kendari";
    }
  }

  function activateSection(sectionId) {
    utils.qsa(".nav-item").forEach(function (button) {
      button.classList.toggle("active", button.dataset.section === sectionId);
    });
    utils.qsa(".view-section").forEach(function (section) {
      section.classList.toggle("active", section.id === sectionId);
    });
    if (window.lucide) window.lucide.createIcons();
  }

  async function handleLogin(event) {
    event.preventDefault();
    var button = event.submitter;
    var form = event.currentTarget;
    var data = Object.fromEntries(new FormData(form).entries());
    utils.setBusy(button, true, "Masuk");
    try {
      var session = await auth.login(data.username, data.password);
      state.user = session.user;
      form.reset();
      showApp();
      await loadBootstrap();
      utils.notify("Login berhasil.", "success");
    } catch (error) {
      utils.notify(error.message, "error");
    } finally {
      utils.setBusy(button, false);
    }
  }

  async function handleBiometricLogin() {
    var button = utils.qs("#biometricLoginBtn");
    utils.setBusy(button, true, "Membuka");
    try {
      var session = await auth.loginWithBiometric();
      state.user = session.user;
      showApp();
      await loadBootstrap();
      utils.notify("Sidik jari diterima.", "success");
    } catch (error) {
      utils.notify(error.message, "error");
    } finally {
      utils.setBusy(button, false);
    }
  }

  function logout() {
    auth.clearSession();
    state.user = null;
    state.bootstrap = null;
    showLogin();
    utils.notify("Anda sudah keluar.", "success");
  }

  async function loadBootstrap(showSuccess) {
    try {
      state.bootstrap = await api.getBootstrap();
      state.user = state.bootstrap.user || state.user;
      applyUserChrome();
      renderAll();
      if (showSuccess) utils.notify("Data sudah diperbarui.", "success");
    } catch (error) {
      utils.notify(error.message, "error");
      if (/login|sesi/i.test(error.message)) logout();
    }
  }

  function renderAll() {
    renderDashboard();
    renderNotes();
    renderShipments();
    renderProfile();
    if (window.lucide) window.lucide.createIcons();
  }

  function renderDashboard() {
    var dashboard = (state.bootstrap && state.bootstrap.dashboard) || {};
    var metrics = dashboard.metrics || {};
    var successRate = Number(metrics.successRate || 0);
    utils.qs("#successRate").textContent = successRate + "%";
    utils.qs("#successCaption").textContent = buildSuccessCaption(metrics);
    utils.qs("#scoreRingText").textContent = successRate + "%";
    utils.qs("#scoreRingValue").style.strokeDashoffset = String(327 - (327 * successRate / 100));
    utils.qs("#metricPending").textContent = utils.formatNumber(metrics.pending);
    utils.qs("#metricOnTime").textContent = utils.formatNumber(metrics.onTime);
    utils.qs("#metricOverdue").textContent = utils.formatNumber(metrics.overdue);
    renderDeadlines(dashboard.deadlines || []);
    renderEmployees(dashboard.employees || []);
    renderActivity(dashboard.recentActivity || []);
    renderReportHistory(dashboard.recentActivity || []);
  }

  function buildSuccessCaption(metrics) {
    var total = Number(metrics.onTime || 0) + Number(metrics.late || 0) + Number(metrics.overdue || 0);
    if (!total) return "Belum ada data KPI final, sistem siap mencatat aktivitas pertama.";
    return utils.formatNumber(metrics.onTime) + " selesai tepat waktu dari " + utils.formatNumber(total) + " kewajiban KPI.";
  }

  function renderDeadlines(items) {
    var outlet = utils.qs("#deadlineList");
    utils.qs("#deadlineCount").textContent = items.length + " item";
    if (!items.length) {
      outlet.innerHTML = '<div class="empty-state">Tidak ada deadline aktif.</div>';
      return;
    }
    outlet.innerHTML = items.map(function (item) {
      return [
        '<article class="deadline-item">',
        '<header>',
        '<strong>' + utils.escapeHtml(item.title || item.type) + '</strong>',
        '<span class="badge ' + utils.escapeHtml(item.status || "pending") + '">' + utils.statusLabel(item.status) + '</span>',
        '</header>',
        '<p>' + utils.escapeHtml(item.type || "-") + ' oleh ' + utils.escapeHtml(item.ownerName || "-") + '</p>',
        '<p>Deadline: ' + utils.formatDate(item.deadlineAt) + '</p>',
        item.meta ? '<p>' + utils.escapeHtml(item.meta) + '</p>' : '',
        '</article>'
      ].join("");
    }).join("");
  }

  function renderEmployees(items) {
    var outlet = utils.qs("#employeeRows");
    if (!items.length) {
      outlet.innerHTML = '<tr><td colspan="5">Belum ada data karyawan.</td></tr>';
      return;
    }
    outlet.innerHTML = items.map(function (item) {
      return [
        '<tr>',
        '<td><strong>' + utils.escapeHtml(item.name) + '</strong></td>',
        '<td>' + utils.escapeHtml(item.location || "-") + '</td>',
        '<td>' + utils.formatNumber(item.onTime) + '</td>',
        '<td>' + utils.formatNumber(item.late) + '</td>',
        '<td><div class="score-bar" title="' + Number(item.score || 0) + '%"><span style="width:' + Number(item.score || 0) + '%"></span></div></td>',
        '</tr>'
      ].join("");
    }).join("");
  }

  function renderActivity(items) {
    var outlet = utils.qs("#recentActivity");
    if (!items.length) {
      outlet.innerHTML = '<div class="empty-state">Aktivitas terbaru akan tampil di sini.</div>';
      return;
    }
    outlet.innerHTML = items.map(function (item) {
      return [
        '<article class="activity-item">',
        '<header>',
        '<strong>' + utils.escapeHtml(item.title || item.type) + '</strong>',
        '<span class="badge ' + utils.escapeHtml(item.status || "pending") + '">' + utils.statusLabel(item.status) + '</span>',
        '</header>',
        '<p>' + utils.escapeHtml(item.type || "-") + ' oleh ' + utils.escapeHtml(item.ownerName || "-") + '</p>',
        '<p>' + utils.formatDate(item.createdAt) + '</p>',
        '</article>'
      ].join("");
    }).join("");
  }

  function renderReportHistory(items) {
    var outlet = utils.qs("#reportHistory");
    var reports = items.filter(function (item) {
      return /laporan/i.test(item.type || "");
    });
    if (!reports.length) {
      outlet.innerHTML = '<div class="empty-state">Riwayat laporan akan tampil setelah laporan pertama distor.</div>';
      return;
    }
    outlet.innerHTML = reports.map(function (item) {
      return [
        '<article class="activity-item">',
        '<header>',
        '<strong>' + utils.escapeHtml(item.title || item.type) + '</strong>',
        '<span class="badge ' + utils.escapeHtml(item.status || "pending") + '">' + utils.statusLabel(item.status) + '</span>',
        '</header>',
        '<p>' + utils.escapeHtml(item.type || "-") + ' oleh ' + utils.escapeHtml(item.ownerName || "-") + '</p>',
        '<p>' + utils.formatDate(item.createdAt) + '</p>',
        '</article>'
      ].join("");
    }).join("");
  }

  function renderNotes() {
    var notes = (state.bootstrap && state.bootstrap.notes) || [];
    var outlet = utils.qs("#notesList");
    utils.qs("#noteCount").textContent = notes.length + " notes";
    if (!notes.length) {
      outlet.innerHTML = '<div class="empty-state">Notes cepat belum ada.</div>';
      return;
    }
    outlet.innerHTML = notes.map(function (item) {
      return [
        '<article class="note-item">',
        '<header>',
        '<strong>' + utils.escapeHtml(item.nama || item.name || "-") + '</strong>',
        '<span class="pill">' + utils.formatDate(item.dibuatPada || item.createdAt) + '</span>',
        '</header>',
        '<p>' + utils.escapeHtml(item.teks || item.text || "") + '</p>',
        item.audioUrl ? '<audio controls preload="none" src="' + utils.escapeHtml(item.audioUrl) + '"></audio>' : '',
        '</article>'
      ].join("");
    }).join("");
  }

  function renderShipments() {
    var dashboard = (state.bootstrap && state.bootstrap.dashboard) || {};
    var shipments = dashboard.shipments || [];
    var outlet = utils.qs("#shipmentList");
    utils.qs("#shipmentCount").textContent = shipments.length + " item";
    if (!shipments.length) {
      outlet.innerHTML = '<div class="empty-state">Tidak ada barang yang sedang berjalan.</div>';
      return;
    }
    outlet.innerHTML = shipments.map(function (item) {
      var status = item.ketepatan || item.status || "pending";
      var canConfirm = state.user && state.user.role.indexOf("admin_") === 0;
      return [
        '<article class="deadline-item">',
        '<header>',
        '<strong>' + utils.escapeHtml(item.asal) + ' ke ' + utils.escapeHtml(item.tujuan) + '</strong>',
        '<span class="badge ' + utils.escapeHtml(status) + '">' + utils.statusLabel(status) + '</span>',
        '</header>',
        '<p>' + utils.escapeHtml(item.ringkasanBarang || "-") + '</p>',
        '<p>Deadline tiba: ' + utils.formatDate(item.deadlineTibaPada) + '</p>',
        canConfirm ? '<button class="icon-text-button" type="button" data-arrival-id="' + utils.escapeHtml(item.id) + '"><i data-lucide="package-check"></i> Tandai tiba</button>' : '',
        '</article>'
      ].join("");
    }).join("");
  }

  function renderProfile() {
    if (!state.user) return;
    var permissions = (state.bootstrap && state.bootstrap.permissions) || {};
    utils.qs("#profileRole").textContent = utils.normalizeRole(state.user.role);
    utils.qs("#profileSummary").innerHTML = [
      profileRow("Nama", state.user.name || state.user.username),
      profileRow("Username", state.user.username),
      profileRow("Lokasi", state.user.location || "-"),
      profileRow("Role", utils.normalizeRole(state.user.role))
    ].join("");
    utils.qs(".profile-edit").classList.toggle("is-hidden", permissions.canEditProfile === false);
  }

  function profileRow(label, value) {
    return '<div class="profile-row"><span>' + utils.escapeHtml(label) + '</span><strong>' + utils.escapeHtml(value) + '</strong></div>';
  }

  async function toggleRecording() {
    var button = utils.qs("#recordBtn");
    var status = utils.qs("#recordingStatus");

    if (state.recorder && state.recorder.state === "recording") {
      state.recorder.stop();
      button.innerHTML = '<i data-lucide="mic"></i> Rekam';
      status.classList.remove("recording");
      status.textContent = "Rekaman selesai, akan ikut tersimpan bersama notes.";
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.audioChunks = [];
      state.audioBlob = null;
      state.recorder = new MediaRecorder(stream);
      state.recorder.addEventListener("dataavailable", function (event) {
        if (event.data.size > 0) state.audioChunks.push(event.data);
      });
      state.recorder.addEventListener("stop", function () {
        state.audioBlob = new Blob(state.audioChunks, { type: "audio/webm" });
        stream.getTracks().forEach(function (track) { track.stop(); });
      });
      state.recorder.start();
      button.innerHTML = '<i data-lucide="square"></i> Stop';
      status.classList.add("recording");
      status.textContent = "Sedang merekam audio...";
      if (window.lucide) window.lucide.createIcons();
    } catch (error) {
      utils.notify("Akses mikrofon ditolak atau tidak tersedia.", "error");
    }
  }

  async function handleNoteSubmit(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = event.submitter;
    var data = Object.fromEntries(new FormData(form).entries());
    utils.setBusy(button, true, "Menyimpan");
    try {
      var audioMeta = null;
      if (state.audioBlob) {
        var audioFile = new File([state.audioBlob], "notes-" + Date.now() + ".webm", { type: "audio/webm" });
        audioMeta = await api.uploadMedia(audioFile, "note-audio");
      }
      await api.saveNote({
        text: data.text,
        audioFileId: audioMeta ? audioMeta.fileId : "",
        audioUrl: audioMeta ? audioMeta.fileUrl : ""
      });
      state.audioBlob = null;
      state.audioChunks = [];
      utils.qs("#recordingStatus").textContent = "Tidak ada rekaman aktif.";
      form.reset();
      await loadBootstrap();
      utils.notify("Notes tersimpan.", "success");
    } catch (error) {
      utils.notify(error.message, "error");
    } finally {
      utils.setBusy(button, false);
    }
  }

  async function handleDailySubmit(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = event.submitter;
    var data = Object.fromEntries(new FormData(form).entries());
    utils.setBusy(button, true, "Menyimpan");
    try {
      var fileIds = await api.uploadFormAttachment(form, "daily-report");
      await api.submitDaily({
        reportDate: data.reportDate,
        summary: data.summary,
        obstacles: data.obstacles,
        fileIds: fileIds
      });
      form.reset();
      setDefaultDates();
      await loadBootstrap();
      utils.notify("Laporan harian tersimpan.", "success");
    } catch (error) {
      utils.notify(error.message, "error");
    } finally {
      utils.setBusy(button, false);
    }
  }

  async function handleWeeklySubmit(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = event.submitter;
    var data = Object.fromEntries(new FormData(form).entries());
    utils.setBusy(button, true, "Menyimpan");
    try {
      var fileIds = await api.uploadFormAttachment(form, "weekly-report");
      await api.submitWeekly({
        weekStart: data.weekStart,
        weekEnd: data.weekEnd,
        summary: data.summary,
        achievement: data.achievement,
        nextPlan: data.nextPlan,
        fileIds: fileIds
      });
      form.reset();
      setDefaultDates();
      await loadBootstrap();
      utils.notify("Laporan pekanan tersimpan.", "success");
    } catch (error) {
      utils.notify(error.message, "error");
    } finally {
      utils.setBusy(button, false);
    }
  }

  async function handleShipmentSubmit(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = event.submitter;
    var data = Object.fromEntries(new FormData(form).entries());
    if (data.origin === data.destination) {
      utils.notify("Asal dan tujuan harus berbeda.", "error");
      return;
    }
    utils.setBusy(button, true, "Menyimpan");
    try {
      var fileIds = await api.uploadFormAttachment(form, "shipment");
      await api.sendShipment({
        origin: data.origin,
        destination: data.destination,
        itemSummary: data.itemSummary,
        quantity: data.quantity,
        sentAt: data.sentAt,
        fileIds: fileIds
      });
      form.reset();
      setDefaultDates();
      setShipmentLocationDefaults();
      await loadBootstrap();
      utils.notify("Pengiriman barang tersimpan.", "success");
    } catch (error) {
      utils.notify(error.message, "error");
    } finally {
      utils.setBusy(button, false);
    }
  }

  async function handleArrival(button) {
    utils.setBusy(button, true, "Menyimpan");
    try {
      await api.confirmArrival({ shipmentId: button.dataset.arrivalId });
      await loadBootstrap();
      utils.notify("Barang ditandai tiba.", "success");
    } catch (error) {
      utils.notify(error.message, "error");
    } finally {
      utils.setBusy(button, false);
    }
  }

  async function handleAuditReviewSubmit(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = event.submitter;
    var data = Object.fromEntries(new FormData(form).entries());
    utils.setBusy(button, true, "Menyimpan");
    try {
      await api.submitAuditCheck({
        category: data.category,
        referenceId: data.referenceId,
        result: data.result,
        notes: data.notes
      });
      form.reset();
      await loadBootstrap();
      utils.notify("Review audit tersimpan.", "success");
    } catch (error) {
      utils.notify(error.message, "error");
    } finally {
      utils.setBusy(button, false);
    }
  }

  async function handleSyncSubmit(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = event.submitter;
    var data = Object.fromEntries(new FormData(form).entries());
    utils.setBusy(button, true, "Menyimpan");
    try {
      await api.submitAuditCheck({
        category: "sync_spreadsheet_ipos",
        referenceId: "",
        result: data.result,
        notes: data.notes
      });
      form.reset();
      await loadBootstrap();
      utils.notify("Cek sinkron tersimpan.", "success");
    } catch (error) {
      utils.notify(error.message, "error");
    } finally {
      utils.setBusy(button, false);
    }
  }

  async function handleDebtSubmit(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = event.submitter;
    var data = Object.fromEntries(new FormData(form).entries());
    utils.setBusy(button, true, "Menyimpan");
    try {
      var fileIds = await api.uploadFormAttachment(form, "debt-followup");
      await api.submitDebtFollowup({
        type: data.type,
        partyName: data.partyName,
        amount: data.amount,
        status: data.status,
        notes: data.notes,
        fileIds: fileIds
      });
      form.reset();
      await loadBootstrap();
      utils.notify("Followup tersimpan.", "success");
    } catch (error) {
      utils.notify(error.message, "error");
    } finally {
      utils.setBusy(button, false);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = event.submitter;
    var data = Object.fromEntries(new FormData(form).entries());
    utils.setBusy(button, true, "Mengubah");
    try {
      await api.changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword
      });
      form.reset();
      utils.notify("Password berhasil diubah.", "success");
    } catch (error) {
      utils.notify(error.message, "error");
    } finally {
      utils.setBusy(button, false);
    }
  }

  async function handleEnableBiometric() {
    var button = utils.qs("#enableBiometricBtn");
    utils.setBusy(button, true, "Mengaktifkan");
    try {
      await auth.registerBiometric(state.user);
      utils.notify("Sidik jari aktif di perangkat ini.", "success");
    } catch (error) {
      utils.notify(error.message, "error");
    } finally {
      utils.setBusy(button, false);
    }
  }

  async function handleBackup() {
    var button = utils.qs("#backupBtn");
    utils.setBusy(button, true, "Backup");
    try {
      var result = await api.backupSheets();
      var count = result && result.sheets ? result.sheets.length : 0;
      utils.notify("Backup selesai: " + count + " sheet disembunyikan.", "success");
    } catch (error) {
      utils.notify(error.message, "error");
    } finally {
      utils.setBusy(button, false);
    }
  }

  window.KPIApp = { init: init, loadBootstrap: loadBootstrap };
  document.addEventListener("DOMContentLoaded", init);
})();
