(function () {
  var config = window.KPI_CONFIG;
  var utils = window.KPIUtils;
  var demoStorageKey = "kpi_demo_db_v1";
  var initialPassword = "GantiSekarang#2026!";

  function useDemo() {
    return !config.API_BASE_URL && config.DEMO_MODE_WHEN_API_EMPTY;
  }

  async function request(action, payload, options) {
    if (useDemo()) {
      return demoRequest(action, payload || {}, options || {});
    }

    var response = await fetch(config.API_BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: action,
        payload: payload || {},
        sessionToken: window.KPIAuth.getSessionToken()
      })
    });

    var json = await response.json().catch(function () {
      throw new Error("Respons API tidak valid.");
    });

    if (!response.ok || !json.ok) {
      throw new Error((json.error && json.error.message) || "Permintaan gagal.");
    }

    return json.data;
  }

  async function uploadMedia(file, kind) {
    if (!file) return null;
    if (utils.bytesToMb(file.size) > config.MAX_UPLOAD_MB) {
      throw new Error("Ukuran file melebihi " + config.MAX_UPLOAD_MB + " MB.");
    }

    if (useDemo()) {
      return {
        fileId: utils.uid("demo_file"),
        fileUrl: URL.createObjectURL(file),
        fileName: file.name,
        mimeType: file.type || "application/octet-stream"
      };
    }

    return request("uploadMedia", {
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      kind: kind || "attachment",
      base64: await utils.toBase64(file)
    });
  }

  function uploadFormAttachment(form, kind) {
    var input = form.querySelector('input[type="file"]');
    if (!input || !input.files || !input.files[0]) return Promise.resolve([]);
    return uploadMedia(input.files[0], kind).then(function (media) {
      return media ? [media.fileId] : [];
    });
  }

  function demoSeed() {
    var now = new Date();
    var nextSixHours = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    var yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return {
      users: [
        { id: "u_owner", username: "owner", name: "Owner", role: "owner", location: "Pusat", canEditProfile: true },
        { id: "u_auditor", username: "auditor", name: "Auditor", role: "auditor", location: "Pusat", canEditProfile: false },
        { id: "u_kendari", username: "admin.kendari", name: "Admin Kendari", role: "admin_kendari", location: "Kendari", canEditProfile: true },
        { id: "u_raha", username: "admin.raha", name: "Admin Raha", role: "admin_raha", location: "Raha", canEditProfile: true }
      ],
      passwords: {
        "owner": initialPassword,
        "auditor": initialPassword,
        "admin.kendari": initialPassword,
        "admin.raha": initialPassword
      },
      notes: [
        {
          id: "note_demo_1",
          userId: "u_kendari",
          nama: "Admin Kendari",
          role: "admin_kendari",
          lokasi: "Kendari",
          teks: "Followup bukti kirim barang batch pagi.",
          audioUrl: "",
          dibuatPada: yesterday.toISOString()
        }
      ],
      dailyReports: [
        {
          id: "harian_demo_1",
          tanggalLaporan: utils.getTodayInputValue(),
          userId: "u_kendari",
          nama: "Admin Kendari",
          lokasi: "Kendari",
          ringkasan: "Input laporan kas dan rekap penjualan.",
          dibuatPada: now.toISOString(),
          deadlinePada: nextSixHours.toISOString(),
          ketepatan: "on_time"
        }
      ],
      weeklyReports: [],
      shipments: [
        {
          id: "barang_demo_1",
          asal: "Kendari",
          tujuan: "Raha",
          pengirimId: "u_kendari",
          pengirimNama: "Admin Kendari",
          ringkasanBarang: "Dokumen penjualan dan sparepart",
          jumlah: 3,
          dikirimPada: now.toISOString(),
          deadlineTibaPada: new Date(now.getTime() + 44 * 60 * 60 * 1000).toISOString(),
          status: "sent",
          ketepatan: "pending"
        }
      ],
      auditChecks: [],
      debtFollowups: [],
      backups: []
    };
  }

  function demoDb() {
    var db;
    try {
      db = JSON.parse(localStorage.getItem(demoStorageKey) || "null");
    } catch (error) {
      db = null;
    }
    if (!db) {
      db = demoSeed();
      demoSave(db);
    }
    return db;
  }

  function demoSave(db) {
    localStorage.setItem(demoStorageKey, JSON.stringify(db));
  }

  function demoDelay(value) {
    return new Promise(function (resolve) {
      window.setTimeout(function () {
        resolve(value);
      }, 180);
    });
  }

  function demoCurrentUser() {
    var session = window.KPIAuth.getSession();
    if (!session || !session.user) return null;
    return session.user;
  }

  function isOwnerOrAuditor(user) {
    return user && (user.role === "owner" || user.role === "auditor");
  }

  function visibleByRole(items, user, locationField, userField) {
    if (isOwnerOrAuditor(user)) return items;
    return items.filter(function (item) {
      return item[userField || "userId"] === user.id || item[locationField || "lokasi"] === user.location;
    });
  }

  function evaluateDeadline(deadlineAt, completedAt) {
    var deadline = new Date(deadlineAt);
    if (completedAt) return new Date(completedAt) <= deadline ? "on_time" : "late";
    return Date.now() <= deadline.getTime() ? "pending" : "overdue";
  }

  function buildDemoBootstrap(db, user) {
    var daily = visibleByRole(db.dailyReports, user, "lokasi", "userId");
    var weekly = visibleByRole(db.weeklyReports, user, "lokasi", "userId");
    var shipments = isOwnerOrAuditor(user)
      ? db.shipments
      : db.shipments.filter(function (item) {
        return item.pengirimId === user.id || item.asal === user.location || item.tujuan === user.location;
      });
    var audit = visibleByRole(db.auditChecks, user, "lokasi", "auditorId");
    var debt = visibleByRole(db.debtFollowups, user, "lokasi", "dibuatOleh");
    var all = []
      .concat(daily.map(function (item) { return Object.assign({ type: "Laporan harian" }, item); }))
      .concat(weekly.map(function (item) { return Object.assign({ type: "Laporan pekanan" }, item); }))
      .concat(shipments.map(function (item) { return Object.assign({ type: "Barang" }, item); }))
      .concat(audit.map(function (item) { return Object.assign({ type: "Audit" }, item); }))
      .concat(debt.map(function (item) { return Object.assign({ type: "Followup" }, item); }));

    var deadlines = shipments
      .filter(function (item) { return item.status !== "arrived"; })
      .map(function (item) {
        return {
          id: item.id,
          type: "Barang tiba",
          title: item.asal + " ke " + item.tujuan,
          ownerName: item.pengirimNama,
          deadlineAt: item.deadlineTibaPada,
          status: evaluateDeadline(item.deadlineTibaPada),
          meta: item.ringkasanBarang
        };
      });

    if (user.role === "auditor" || user.role === "owner") {
      deadlines.push({
        id: "audit_sync_demo",
        type: "Cek sinkron",
        title: "Spreadsheet dan IPOS",
        ownerName: "Auditor",
        deadlineAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        status: "pending",
        meta: "Deadline berjalan tiap 7x24 jam"
      });
    }

    var onTime = all.filter(function (item) {
      return item.ketepatan === "on_time";
    }).length;
    var late = all.filter(function (item) {
      return item.ketepatan === "late";
    }).length;
    var overdue = deadlines.filter(function (item) {
      return item.status === "overdue";
    }).length;
    var pending = deadlines.filter(function (item) {
      return item.status === "pending";
    }).length;
    var denominator = onTime + late + overdue;
    var successRate = denominator ? Math.round((onTime / denominator) * 100) : 100;

    var employees = db.users
      .filter(function (item) { return item.role.indexOf("admin_") === 0; })
      .map(function (employee) {
        var employeeItems = all.filter(function (item) {
          return item.userId === employee.id || item.pengirimId === employee.id;
        });
        var success = employeeItems.filter(function (item) { return item.ketepatan === "on_time"; }).length;
        var fail = employeeItems.filter(function (item) { return item.ketepatan === "late"; }).length;
        var score = success + fail ? Math.round((success / (success + fail)) * 100) : 100;
        return {
          id: employee.id,
          name: employee.name,
          location: employee.location,
          onTime: success,
          late: fail,
          score: score
        };
      });

    var recentActivity = all
      .sort(function (a, b) {
        return new Date(b.dibuatPada || b.dikirimPada || 0) - new Date(a.dibuatPada || a.dikirimPada || 0);
      })
      .slice(0, 8)
      .map(function (item) {
        return {
          id: item.id,
          type: item.type,
          title: item.ringkasan || item.ringkasanBarang || item.hasil || item.catatan || item.type,
          ownerName: item.nama || item.pengirimNama || item.auditorNama || "-",
          createdAt: item.dibuatPada || item.dikirimPada,
          status: item.ketepatan || item.status || "pending"
        };
      });

    return {
      user: user,
      permissions: {
        canBackup: user.role === "owner",
        canEditProfile: user.canEditProfile !== false,
        canAudit: user.role === "auditor" || user.role === "owner",
        canSubmitAdminReports: user.role.indexOf("admin_") === 0
      },
      dashboard: {
        metrics: {
          pending: pending,
          onTime: onTime,
          late: late,
          overdue: overdue,
          successRate: successRate
        },
        deadlines: deadlines,
        employees: employees,
        recentActivity: recentActivity,
        shipments: shipments.filter(function (item) { return item.status !== "arrived"; })
      },
      notes: visibleByRole(db.notes, user, "lokasi", "userId").slice(-30).reverse()
    };
  }

  async function demoRequest(action, payload) {
    var db = demoDb();
    var user = demoCurrentUser();
    var now = new Date();

    if (action === "login") {
      var username = String(payload.username || "").trim().toLowerCase();
      var found = db.users.find(function (item) { return item.username === username; });
      if (!found || db.passwords[username] !== payload.password) {
        throw new Error("Username atau password salah.");
      }
      return demoDelay({
        sessionToken: "demo_" + utils.uid("session"),
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        user: found
      });
    }

    if (action === "validateSession") {
      if (!user) throw new Error("Sesi tidak aktif.");
      return demoDelay({ user: user, sessionToken: window.KPIAuth.getSessionToken() });
    }

    if (!user) throw new Error("Silakan login ulang.");

    if (action === "getBootstrap") {
      return demoDelay(buildDemoBootstrap(db, user));
    }

    if (action === "saveNote") {
      db.notes.push({
        id: utils.uid("note"),
        userId: user.id,
        nama: user.name,
        role: user.role,
        lokasi: user.location,
        teks: payload.text,
        audioFileId: payload.audioFileId || "",
        audioUrl: payload.audioUrl || "",
        dibuatPada: now.toISOString(),
        diperbaruiPada: now.toISOString(),
        pinned: false,
        archived: false
      });
      demoSave(db);
      return demoDelay({ saved: true });
    }

    if (action === "submitDaily") {
      db.dailyReports.push({
        id: utils.uid("harian"),
        tanggalLaporan: payload.reportDate,
        userId: user.id,
        nama: user.name,
        lokasi: user.location,
        ringkasan: payload.summary,
        kendala: payload.obstacles || "",
        fileIds: (payload.fileIds || []).join(","),
        dibuatPada: now.toISOString(),
        deadlinePada: new Date(new Date(payload.reportDate).getTime() + 24 * 60 * 60 * 1000).toISOString(),
        ketepatan: "on_time",
        dibuatOleh: user.username
      });
      demoSave(db);
      return demoDelay({ saved: true });
    }

    if (action === "submitWeekly") {
      db.weeklyReports.push({
        id: utils.uid("pekanan"),
        pekanMulai: payload.weekStart,
        pekanSelesai: payload.weekEnd,
        userId: user.id,
        nama: user.name,
        lokasi: user.location,
        ringkasan: payload.summary,
        capaian: payload.achievement || "",
        rencana: payload.nextPlan || "",
        fileIds: (payload.fileIds || []).join(","),
        dibuatPada: now.toISOString(),
        deadlinePada: new Date(new Date(payload.weekStart).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        ketepatan: "on_time",
        dibuatOleh: user.username
      });
      demoSave(db);
      return demoDelay({ saved: true });
    }

    if (action === "sendShipment") {
      db.shipments.push({
        id: utils.uid("barang"),
        asal: payload.origin,
        tujuan: payload.destination,
        pengirimId: user.id,
        pengirimNama: user.name,
        ringkasanBarang: payload.itemSummary,
        jumlah: payload.quantity,
        dikirimPada: payload.sentAt || now.toISOString(),
        deadlineTibaPada: new Date(new Date(payload.sentAt || now).getTime() + 48 * 60 * 60 * 1000).toISOString(),
        tibaPada: "",
        penerimaNama: "",
        status: "sent",
        ketepatan: "pending",
        fileIds: (payload.fileIds || []).join(",")
      });
      demoSave(db);
      return demoDelay({ saved: true });
    }

    if (action === "confirmArrival") {
      var shipment = db.shipments.find(function (item) { return item.id === payload.shipmentId; });
      if (!shipment) throw new Error("Data barang tidak ditemukan.");
      shipment.tibaPada = now.toISOString();
      shipment.penerimaNama = user.name;
      shipment.status = "arrived";
      shipment.ketepatan = evaluateDeadline(shipment.deadlineTibaPada, shipment.tibaPada);
      demoSave(db);
      return demoDelay({ saved: true });
    }

    if (action === "submitAuditCheck") {
      db.auditChecks.push({
        id: utils.uid("audit"),
        kategori: payload.category,
        referensiId: payload.referenceId || "",
        auditorId: user.id,
        auditorNama: user.name,
        hasil: payload.result,
        catatan: payload.notes || "",
        dibuatPada: now.toISOString(),
        deadlinePada: payload.deadlineAt || now.toISOString(),
        ketepatan: "on_time"
      });
      demoSave(db);
      return demoDelay({ saved: true });
    }

    if (action === "submitDebtFollowup") {
      db.debtFollowups.push({
        id: utils.uid("debt"),
        tipe: payload.type,
        pihak: payload.partyName,
        nominal: payload.amount || 0,
        status: payload.status,
        catatan: payload.notes,
        fileIds: (payload.fileIds || []).join(","),
        dibuatPada: now.toISOString(),
        deadlinePada: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        ketepatan: "on_time",
        dibuatOleh: user.id
      });
      demoSave(db);
      return demoDelay({ saved: true });
    }

    if (action === "changePassword") {
      if (user.canEditProfile === false) throw new Error("Akun ini tidak diizinkan mengubah password dari profil.");
      if (db.passwords[user.username] !== payload.currentPassword) throw new Error("Password saat ini salah.");
      db.passwords[user.username] = payload.newPassword;
      demoSave(db);
      return demoDelay({ saved: true });
    }

    if (action === "backupSheets") {
      db.backups.push({ id: utils.uid("backup"), dibuatPada: now.toISOString(), dibuatOleh: user.username });
      demoSave(db);
      return demoDelay({ sheets: ["Demo_backup_" + now.toISOString().slice(0, 10)] });
    }

    throw new Error("Action demo tidak dikenal: " + action);
  }

  window.KPIApi = {
    request: request,
    login: function (payload) { return request("login", payload, { public: true }); },
    validateSession: function () { return request("validateSession", {}, { public: true }); },
    getBootstrap: function () { return request("getBootstrap"); },
    saveNote: function (payload) { return request("saveNote", payload); },
    uploadMedia: uploadMedia,
    uploadFormAttachment: uploadFormAttachment,
    submitDaily: function (payload) { return request("submitDaily", payload); },
    submitWeekly: function (payload) { return request("submitWeekly", payload); },
    sendShipment: function (payload) { return request("sendShipment", payload); },
    confirmArrival: function (payload) { return request("confirmArrival", payload); },
    submitAuditCheck: function (payload) { return request("submitAuditCheck", payload); },
    submitDebtFollowup: function (payload) { return request("submitDebtFollowup", payload); },
    changePassword: function (payload) { return request("changePassword", payload); },
    backupSheets: function () { return request("backupSheets"); }
  };
})();
