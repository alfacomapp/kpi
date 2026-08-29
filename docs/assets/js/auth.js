(function () {
  var config = window.KPI_CONFIG;

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(config.SESSION_STORAGE_KEY) || "null");
    } catch (error) {
      return null;
    }
  }

  function saveSession(session) {
    localStorage.setItem(config.SESSION_STORAGE_KEY, JSON.stringify(session));
  }

  function clearSession() {
    localStorage.removeItem(config.SESSION_STORAGE_KEY);
  }

  function getSessionToken() {
    var session = getSession();
    return session && session.sessionToken ? session.sessionToken : "";
  }

  function randomChallenge(length) {
    var bytes = new Uint8Array(length || 32);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  function textToBuffer(value) {
    return new TextEncoder().encode(String(value)).buffer;
  }

  function bufferToBase64Url(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = "";
    bytes.forEach(function (byte) {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlToBuffer(value) {
    var base64 = String(value).replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }

  function canUseBiometric() {
    return Boolean(window.PublicKeyCredential && window.crypto && crypto.getRandomValues);
  }

  async function login(username, password) {
    var data = await window.KPIApi.login({ username: username, password: password });
    saveSession(data);
    return data;
  }

  async function validateSession() {
    var token = getSessionToken();
    if (!token) return null;
    var data = await window.KPIApi.validateSession();
    saveSession(Object.assign({}, getSession(), data));
    return data;
  }

  async function registerBiometric(user) {
    if (!canUseBiometric()) {
      throw new Error("Browser belum mendukung sidik jari/passkey.");
    }

    var credential = await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(32),
        rp: { name: config.APP_NAME },
        user: {
          id: textToBuffer(user.id || user.username),
          name: user.username,
          displayName: user.name || user.username
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 }
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required"
        },
        timeout: 60000,
        attestation: "none"
      }
    });

    localStorage.setItem(config.BIOMETRIC_STORAGE_KEY, JSON.stringify({
      userId: user.id,
      username: user.username,
      credentialId: bufferToBase64Url(credential.rawId),
      createdAt: new Date().toISOString()
    }));
  }

  async function loginWithBiometric() {
    if (!canUseBiometric()) {
      throw new Error("Browser belum mendukung sidik jari/passkey.");
    }

    var biometric = JSON.parse(localStorage.getItem(config.BIOMETRIC_STORAGE_KEY) || "null");
    var session = getSession();
    if (!biometric || !session || !session.sessionToken) {
      throw new Error("Login password dulu sekali di perangkat ini.");
    }

    await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(32),
        allowCredentials: [{
          id: base64UrlToBuffer(biometric.credentialId),
          type: "public-key"
        }],
        userVerification: "required",
        timeout: 60000
      }
    });

    return validateSession();
  }

  window.KPIAuth = {
    getSession: getSession,
    saveSession: saveSession,
    clearSession: clearSession,
    getSessionToken: getSessionToken,
    login: login,
    validateSession: validateSession,
    registerBiometric: registerBiometric,
    loginWithBiometric: loginWithBiometric,
    canUseBiometric: canUseBiometric
  };
})();
