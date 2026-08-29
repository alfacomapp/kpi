(function () {
  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function formatDate(value, options) {
    if (!value) return "-";
    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", options || {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function formatDateOnly(value) {
    return formatDate(value, { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("id-ID").format(Number(value || 0));
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  function normalizeRole(role) {
    return String(role || "").replace(/_/g, " ");
  }

  function statusLabel(status) {
    var map = {
      on_time: "Tepat waktu",
      late: "Terlambat",
      pending: "Berjalan",
      overdue: "Lewat deadline",
      arrived: "Tiba",
      sent: "Dikirim"
    };
    return map[String(status || "").toLowerCase()] || status || "-";
  }

  function getTodayInputValue() {
    var date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 10);
  }

  function getLocalDateTimeValue() {
    var date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || "");
        resolve(result.split(",")[1] || "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function bytesToMb(bytes) {
    return bytes / 1024 / 1024;
  }

  function notify(message, tone) {
    var outlet = qs("#toastOutlet");
    if (!outlet) return;
    var item = document.createElement("div");
    item.className = "toast " + (tone || "info");
    item.textContent = message;
    outlet.appendChild(item);
    window.setTimeout(function () {
      item.classList.add("leaving");
      window.setTimeout(function () {
        item.remove();
      }, 240);
    }, 3600);
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<span class="spinner"></span>' + (label || "Memproses");
    } else {
      button.disabled = false;
      if (button.dataset.originalText) button.innerHTML = button.dataset.originalText;
    }
    if (window.lucide) window.lucide.createIcons();
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  window.KPIUtils = {
    qs: qs,
    qsa: qsa,
    formatDate: formatDate,
    formatDateOnly: formatDateOnly,
    formatNumber: formatNumber,
    formatCurrency: formatCurrency,
    normalizeRole: normalizeRole,
    statusLabel: statusLabel,
    getTodayInputValue: getTodayInputValue,
    getLocalDateTimeValue: getLocalDateTimeValue,
    escapeHtml: escapeHtml,
    toBase64: toBase64,
    bytesToMb: bytesToMb,
    notify: notify,
    setBusy: setBusy,
    uid: uid
  };
})();
