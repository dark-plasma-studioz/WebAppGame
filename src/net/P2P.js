// Minimal WebRTC P2P connector with manual offer/answer copy-paste.
// This is intentionally "serverless": it uses STUN only and relies on the user
// to pass the SDP blobs via chat/Discord. LAN usually works very reliably.

(function attachP2P() {
  const DEFAULT_RTC_CONFIG = {
    iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }]
  };

  function safeJsonParse(s) {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  /** Remove BOM, zero-width chars, and Unicode quotes that break JSON.parse after paste. */
  function stripPasteNoise(s) {
    return String(s || "")
      .replace(/^\uFEFF/, "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/[\u201C\u201D\u275D\u275E]/g, '"');
  }

  /** If the user copied only the JSON object from a larger message, isolate `{...}` (JSON strings use `"` only). */
  function extractBalancedJsonObject(s) {
    const start = s.indexOf("{");
    if (start < 0) return null;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') {
        inStr = true;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
    }
    return null;
  }

  /** Pasted plain SDP (no JSON) — WebRTC offers/answers always start a session with v=0. */
  function looksLikeRawSdp(s) {
    const t = String(s || "").trim();
    return /^v=0(\s|$|\r|\n)/m.test(t);
  }

  function normalizeSdpNewlines(sdp) {
    return String(sdp || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n/g, "\r\n");
  }

  /**
   * RTCSessionDescription is not a plain object — JSON.stringify(localDescription) is often "{}".
   * Always copy a real { type, sdp } JSON string for paste between peers.
   * @param {RTCSessionDescription | { type?: string; sdp?: string } | null} desc
   */
  function serializeRtcSessionDescription(desc) {
    if (!desc) return "";
    const type = desc.type;
    const sdp = desc.sdp;
    if (typeof type !== "string" || typeof sdp !== "string") return "";
    if (!type.trim() || !sdp.trim()) return "";
    try {
      return JSON.stringify({ type, sdp });
    } catch {
      return "";
    }
  }

  /**
   * @param {string} raw
   * @param {"offer" | "answer" | null} kindHint when paste is raw SDP only (not JSON)
   */
  function normalizeSessionDescriptionBlob(raw, kindHint = null) {
    let s = stripPasteNoise(String(raw || "")).trim();
    if (!s) return null;

    // Strip common Discord/Markdown wrappers (allow language tag on same or next line).
    if (s.startsWith("```")) {
      s = s.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```[\s\u200B]*$/m, "").trim();
    }
    // Leading labels like "Offer:" or "Answer:"
    s = s.replace(/^(offer|answer)\s*:\s*/i, "").trim();

    // First parse attempt on full string.
    let obj = safeJsonParse(s);

    // If failed, try extracting a single JSON object (ignores trailing chat text).
    if (!obj) {
      const balanced = extractBalancedJsonObject(s);
      if (balanced && balanced !== s) obj = safeJsonParse(balanced);
    }
    if (!obj) {
      const start = s.indexOf("{");
      const end = s.lastIndexOf("}");
      if (start >= 0 && end > start) obj = safeJsonParse(s.slice(start, end + 1));
    }

    // Discord / some apps wrap JSON as a JSON string.
    if (typeof obj === "string") {
      const obj2 = safeJsonParse(obj);
      if (obj2) obj = obj2;
    }

    // Some users paste a wrapper object {payload:{type,sdp}}; unwrap best-effort.
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      if (obj.payload && typeof obj.payload === "object") obj = obj.payload;
      if (obj.desc && typeof obj.desc === "object") obj = obj.desc;
      if (obj.data && typeof obj.data === "object") obj = obj.data;
      if (obj.sdp && typeof obj.sdp === "object" && obj.sdp.type && obj.sdp.sdp) obj = obj.sdp;
    }

    if ((!obj || typeof obj !== "object") && looksLikeRawSdp(s)) {
      const t = kindHint === "answer" ? "answer" : "offer";
      return { type: t, sdp: normalizeSdpNewlines(s) };
    }

    if (!obj || typeof obj !== "object") return null;
    const t = obj.type;
    const sdp = obj.sdp;
    if (typeof t !== "string" || typeof sdp !== "string") return null;
    if (!t.trim() || !sdp.trim()) return null;
    return { type: t, sdp: normalizeSdpNewlines(sdp) };
  }

  function createEl(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") el.className = v;
      else if (k === "style") el.setAttribute("style", v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v != null) el.setAttribute(k, String(v));
    });
    children.forEach((c) => {
      if (c == null) return;
      if (typeof c === "string") el.appendChild(document.createTextNode(c));
      else el.appendChild(c);
    });
    return el;
  }

  function ensureStyles() {
    if (document.getElementById("p2p-overlay-styles")) return;
    const css = `
      .p2p-overlay {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.55);
        z-index: 999999;
        padding: 16px;
      }
      .p2p-overlay.is-open { display: flex; }
      .p2p-panel {
        width: min(920px, 100%);
        max-height: min(740px, 100%);
        overflow: auto;
        background: rgba(14, 18, 28, 0.98);
        border: 2px solid rgba(95, 140, 200, 0.9);
        border-radius: 12px;
        box-shadow: 0 18px 55px rgba(0,0,0,0.55);
        padding: 14px 14px 16px;
        font-family: Consolas, Monaco, 'Courier New', monospace;
        color: #eaf2ff;
      }
      .p2p-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .p2p-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
      .p2p-title h2 { margin: 0; font-size: 16px; letter-spacing: 0.5px; }
      .p2p-close {
        appearance: none;
        border: 1px solid rgba(130, 170, 230, 0.7);
        background: rgba(25, 40, 66, 0.95);
        color: #eaf2ff;
        border-radius: 10px;
        padding: 8px 10px;
        cursor: pointer;
      }
      .p2p-close:focus { outline: 2px solid rgba(170, 220, 255, 0.9); outline-offset: 2px; }
      .p2p-section {
        border: 1px solid rgba(80, 120, 180, 0.5);
        border-radius: 10px;
        background: rgba(10, 14, 20, 0.55);
        padding: 12px;
      }
      .p2p-section h3 { margin: 0 0 8px; font-size: 13px; color: #bcd6ff; }
      .p2p-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 10px; }
      .p2p-btn {
        appearance: none;
        border: 1px solid rgba(120, 170, 230, 0.85);
        background: rgba(22, 34, 56, 0.95);
        color: #ffffff;
        border-radius: 10px;
        padding: 8px 10px;
        cursor: pointer;
        font-weight: 700;
        font-size: 12px;
      }
      .p2p-btn[disabled] { opacity: 0.55; cursor: not-allowed; }
      .p2p-btn:focus { outline: 2px solid rgba(170, 220, 255, 0.9); outline-offset: 2px; }
      .p2p-textarea {
        width: 100%;
        min-height: 140px;
        resize: vertical;
        border-radius: 10px;
        border: 1px solid rgba(90, 130, 190, 0.6);
        background: rgba(6, 10, 18, 0.95);
        color: #eaf2ff;
        padding: 10px;
        font-size: 12px;
        line-height: 1.35;
        box-sizing: border-box;
      }
      .p2p-label { font-size: 12px; color: #9fb8d8; display: block; margin: 8px 0 6px; }
      .p2p-status {
        margin-top: 10px;
        padding: 10px 12px;
        border-radius: 10px;
        background: rgba(0,0,0,0.35);
        border: 1px solid rgba(80, 120, 180, 0.45);
        font-size: 12px;
        color: #d7e7ff;
        display: flex;
        gap: 10px;
        align-items: baseline;
        justify-content: space-between;
      }
      .p2p-status strong { color: #ffffff; }
      .p2p-note { font-size: 11px; color: #a8c3e8; line-height: 1.4; }
      .p2p-connected-row {
        display: none;
        margin-top: 12px;
        flex-direction: column;
        gap: 10px;
        padding: 12px 12px 14px;
        border-radius: 10px;
        background: rgba(18, 52, 42, 0.55);
        border: 1px solid rgba(90, 200, 150, 0.45);
      }
      .p2p-connected-row.is-visible { display: flex; }
      .p2p-connected-row p { margin: 0; font-size: 12px; color: #d4f5e8; line-height: 1.45; }
      .p2p-btn-primary {
        border-color: rgba(120, 220, 170, 0.95) !important;
        background: rgba(28, 72, 58, 0.98) !important;
        font-size: 13px;
        padding: 10px 12px;
      }
      @media (max-width: 860px) {
        .p2p-row { grid-template-columns: 1fr; }
      }
    `;
    const style = document.createElement("style");
    style.id = "p2p-overlay-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function waitForIceGatheringComplete(pc, timeoutMs = 4000) {
    return new Promise((resolve) => {
      if (!pc) return resolve(false);
      if (pc.iceGatheringState === "complete") return resolve(true);
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        try { pc.removeEventListener("icegatheringstatechange", onChange); } catch { /* ignore */ }
        resolve(!!ok);
      };
      const onChange = () => {
        if (pc.iceGatheringState === "complete") finish(true);
      };
      pc.addEventListener("icegatheringstatechange", onChange);
      setTimeout(() => finish(pc.iceGatheringState === "complete"), timeoutMs);
    });
  }

  function buildOverlay() {
    ensureStyles();

    const statusText = createEl("div", {}, ["Idle"]);
    const statusRight = createEl("div", {}, [""]);
    const setStatus = (left, right = "") => {
      statusText.textContent = left;
      statusRight.textContent = right;
    };

    const hostOfferOut = createEl("textarea", { class: "p2p-textarea", readonly: "true", "aria-label": "Offer output" });
    const hostAnswerIn = createEl("textarea", { class: "p2p-textarea", "aria-label": "Paste answer here" });

    const joinOfferIn = createEl("textarea", { class: "p2p-textarea", "aria-label": "Paste offer here" });
    const joinAnswerOut = createEl("textarea", { class: "p2p-textarea", readonly: "true", "aria-label": "Answer output" });

    const btnHostCreate = createEl("button", { class: "p2p-btn", type: "button" }, ["Create Offer"]);
    const btnHostAccept = createEl("button", { class: "p2p-btn", type: "button", disabled: "true" }, ["Accept Answer"]);
    const btnJoinMake = createEl("button", { class: "p2p-btn", type: "button" }, ["Create Answer"]);

    const btnCopyOffer = createEl("button", { class: "p2p-btn", type: "button", disabled: "true" }, ["Copy Offer"]);
    const btnCopyAnswer = createEl("button", { class: "p2p-btn", type: "button", disabled: "true" }, ["Copy Answer"]);

    const btnClose = createEl("button", { class: "p2p-close", type: "button" }, ["Close"]);

    const overlay = createEl("div", { class: "p2p-overlay", role: "dialog", "aria-modal": "true", "aria-label": "P2P multiplayer connector" });
    const panel = createEl("div", { class: "p2p-panel" });

    const title = createEl("div", { class: "p2p-title" }, [
      createEl("h2", {}, ["P2P Multiplayer (WebRTC)"]),
      btnClose
    ]);

    const note = createEl("div", { class: "p2p-note" }, [
      "LAN-friendly, no server. Send the codes through Discord. ",
      "If it fails on some networks, you may need a TURN relay (not included)."
    ]);

    const hostSection = createEl("section", { class: "p2p-section" }, [
      createEl("h3", {}, ["Host (create Offer → receive Answer)"]),
      createEl("div", { class: "p2p-actions" }, [btnHostCreate, btnCopyOffer, btnHostAccept]),
      createEl("label", { class: "p2p-label" }, ["Offer (send to friend)"]),
      hostOfferOut,
      createEl("label", { class: "p2p-label" }, ["Answer (paste from friend)"]),
      hostAnswerIn
    ]);

    const joinSection = createEl("section", { class: "p2p-section" }, [
      createEl("h3", {}, ["Join (paste Offer → create Answer)"]),
      createEl("div", { class: "p2p-actions" }, [btnJoinMake, btnCopyAnswer]),
      createEl("label", { class: "p2p-label" }, ["Offer (paste from host)"]),
      joinOfferIn,
      createEl("label", { class: "p2p-label" }, ["Answer (send back to host)"]),
      joinAnswerOut
    ]);

    const status = createEl("div", { class: "p2p-status" }, [
      createEl("div", {}, [createEl("strong", {}, ["Status: "]), statusText]),
      statusRight
    ]);

    const connectedRow = createEl("div", { class: "p2p-connected-row", id: "p2p-connected-row" });
    const connectedHint = createEl("p", {}, [
      "Link is up. Both players should click the button below to open the character lobby (same as main menu → Deploy). Host picks P1 and match options; joiner picks P2."
    ]);
    const btnContinueLobby = createEl("button", {
      class: "p2p-btn p2p-btn-primary",
      type: "button"
    }, ["Continue → Character select"]);
    connectedRow.appendChild(connectedHint);
    connectedRow.appendChild(btnContinueLobby);

    const setConnectedUiVisible = (on) => {
      if (on) connectedRow.classList.add("is-visible");
      else connectedRow.classList.remove("is-visible");
    };

    panel.appendChild(title);
    panel.appendChild(note);
    panel.appendChild(createEl("div", { style: "height:10px" }));
    panel.appendChild(createEl("div", { class: "p2p-row" }, [hostSection, joinSection]));
    panel.appendChild(status);
    panel.appendChild(connectedRow);
    overlay.appendChild(panel);

    // State
    /** @type {RTCPeerConnection | null} */
    let pc = null;
    /** @type {RTCDataChannel | null} */
    let dc = null;
    let role = null; // "host" | "join"

    const resetState = () => {
      try { dc && dc.close(); } catch { /* ignore */ }
      try { pc && pc.close(); } catch { /* ignore */ }
      pc = null;
      dc = null;
      role = null;
      btnHostAccept.disabled = true;
      btnCopyOffer.disabled = true;
      btnCopyAnswer.disabled = true;
      hostOfferOut.value = "";
      hostAnswerIn.value = "";
      joinOfferIn.value = "";
      joinAnswerOut.value = "";
      setConnectedUiVisible(false);
      setStatus("Idle", "");
    };

    const persistSession = () => {
      window.NET_SESSION = {
        kind: "webrtc",
        role,
        pc,
        dc,
        onMessage: null,
        _sendSeq: 0,
        _recvSeq: 0,
        send: (type, payload = {}) => {
          const sess = window.NET_SESSION;
          if (!sess || !sess.dc || sess.dc.readyState !== "open") return false;
          sess._sendSeq = (sess._sendSeq || 0) + 1;
          const msg = { t: type, seq: sess._sendSeq, ...payload };
          try {
            sess.dc.send(JSON.stringify(msg));
            return true;
          } catch {
            return false;
          }
        },
        sendSceneSync: (sceneKey, payload) => {
          return window.NET_SESSION?.send?.("sceneSync", { sceneKey, payload }) || false;
        },
        sendJson: (obj) => {
          if (!dc || dc.readyState !== "open") return false;
          dc.send(JSON.stringify(obj));
          return true;
        }
      };
    };

    const wireDc = (channel) => {
      dc = channel;
      dc.binaryType = "arraybuffer";
      dc.onopen = () => {
        setStatus("Connected", role === "host" ? "Host" : "Join");
        setConnectedUiVisible(true);
        persistSession();
        // quick handshake ping
        try { dc.send(JSON.stringify({ t: "hello", role, at: Date.now() })); } catch { /* ignore */ }
      };
      dc.onclose = () => {
        setConnectedUiVisible(false);
        setStatus("Disconnected", "");
      };
      dc.onerror = () => {
        setConnectedUiVisible(false);
        setStatus("DataChannel error", "");
      };
      dc.onmessage = (ev) => {
        const data = ev?.data;
        window.NET_LAST_MSG = data;
        const sess = window.NET_SESSION;
        if (sess && typeof sess.onMessage === "function") {
          try {
            // Basic sequence tracking (best-effort). If messages are sent via sess.send(), they include seq.
            if (typeof data === "string" && data.length && data[0] === "{") {
              const parsed = safeJsonParse(data);
              if (parsed && Number.isFinite(parsed.seq)) {
                sess._recvSeq = Math.max(sess._recvSeq || 0, parsed.seq);
              }
            }
            sess.onMessage(data);
          } catch {
            // ignore
          }
        }
      };
    };

    const ensurePc = () => {
      if (pc) return pc;
      pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
      pc.oniceconnectionstatechange = () => {
        setStatus(`ICE: ${pc.iceConnectionState}`, role ? role.toUpperCase() : "");
      };
      pc.onconnectionstatechange = () => {
        setStatus(`RTC: ${pc.connectionState}`, role ? role.toUpperCase() : "");
      };
      pc.ondatachannel = (ev) => {
        if (!ev?.channel) return;
        wireDc(ev.channel);
      };
      return pc;
    };

    const copyText = async (value) => {
      const s = String(value || "");
      if (!s.trim()) return false;
      try {
        await navigator.clipboard.writeText(s);
        return true;
      } catch {
        // Fallback: select the text so user can Ctrl+C.
        return false;
      }
    };

    btnClose.addEventListener("click", () => {
      overlay.classList.remove("is-open");
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("is-open");
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.classList.contains("is-open")) overlay.classList.remove("is-open");
    });

    btnContinueLobby.addEventListener("click", () => {
      const g = window.__phaserGame;
      const sc = g && g.scene;
      if (!sc) {
        window.alert("Game is not ready yet. Reload the page and try again.");
        return;
      }
      if (sc.isActive("MainMenuScene")) {
        sc.start("CharacterSelectScene");
        overlay.classList.remove("is-open");
        return;
      }
      if (sc.isActive("CharacterSelectScene")) {
        overlay.classList.remove("is-open");
        return;
      }
      window.alert(
        "Return to the main menu first (ESC from most screens), then open P2P again and use Continue to open the character lobby."
      );
    });

    btnHostCreate.addEventListener("click", async () => {
      resetState();
      role = "host";
      setStatus("Creating offer…", "HOST");
      const p = ensurePc();
      wireDc(p.createDataChannel("game", { ordered: true }));
      const offer = await p.createOffer();
      await p.setLocalDescription(offer);
      await waitForIceGatheringComplete(p, 4500);
      const offerBlob = serializeRtcSessionDescription(p.localDescription);
      hostOfferOut.value = offerBlob;
      if (!offerBlob) {
        setStatus("Could not serialize offer — try another browser or reload", "HOST");
        btnHostAccept.disabled = true;
        btnCopyOffer.disabled = true;
        return;
      }
      btnHostAccept.disabled = false;
      btnCopyOffer.disabled = false;
      setStatus("Offer ready (send it)", "HOST");
    });

    btnHostAccept.addEventListener("click", async () => {
      const desc = normalizeSessionDescriptionBlob(hostAnswerIn.value, "answer");
      if (!desc || !desc.type || !desc.sdp) {
        setStatus("Could not read answer (paste JSON or raw SDP from joiner)", "HOST");
        return;
      }
      try {
        setStatus("Accepting answer…", "HOST");
        const p = ensurePc();
        await p.setRemoteDescription(new RTCSessionDescription(desc));
        setStatus("Waiting for connection…", "HOST");
      } catch (e) {
        setStatus("Failed to accept answer", String(e?.message || e));
      }
    });

    btnJoinMake.addEventListener("click", async () => {
      // Must snapshot before resetState — reset clears the join offer textarea.
      const offerRaw = joinOfferIn.value;
      resetState();
      joinOfferIn.value = offerRaw;
      role = "join";
      const offer = normalizeSessionDescriptionBlob(offerRaw, "offer");
      if (!offer || !offer.type || !offer.sdp) {
        setStatus("Could not read offer (paste JSON or raw SDP from host)", "JOIN");
        return;
      }
      try {
        setStatus("Creating answer…", "JOIN");
        const p = ensurePc();
        await p.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await p.createAnswer();
        await p.setLocalDescription(answer);
        await waitForIceGatheringComplete(p, 4500);
        const ansBlob = serializeRtcSessionDescription(p.localDescription);
        joinAnswerOut.value = ansBlob;
        if (!ansBlob) {
          setStatus("Could not serialize answer — try another browser or reload", "JOIN");
          btnCopyAnswer.disabled = true;
          return;
        }
        btnCopyAnswer.disabled = false;
        setStatus("Answer ready (send back)", "JOIN");
      } catch (e) {
        setStatus("Failed to create answer", String(e?.message || e));
      }
    });

    btnCopyOffer.addEventListener("click", async () => {
      const ok = await copyText(hostOfferOut.value);
      setStatus(ok ? "Copied offer to clipboard" : "Select offer and Ctrl+C", "HOST");
      if (!ok) {
        hostOfferOut.focus();
        hostOfferOut.select();
      }
    });
    btnCopyAnswer.addEventListener("click", async () => {
      const ok = await copyText(joinAnswerOut.value);
      setStatus(ok ? "Copied answer to clipboard" : "Select answer and Ctrl+C", "JOIN");
      if (!ok) {
        joinAnswerOut.focus();
        joinAnswerOut.select();
      }
    });

    return {
      overlay,
      open: () => {
        overlay.classList.add("is-open");
        const sess = window.NET_SESSION;
        if (sess && sess.dc && sess.dc.readyState === "open") {
          setStatus("Connected", sess.role === "host" ? "Host" : sess.role === "join" ? "Join" : "");
          setConnectedUiVisible(true);
        } else {
          setStatus("Idle", "");
          setConnectedUiVisible(false);
        }
      },
      resetState
    };
  }

  let _ui = null;
  window.P2P = {
    open() {
      if (!_ui) {
        _ui = buildOverlay();
        document.body.appendChild(_ui.overlay);
      }
      _ui.open();
    },
    reset() {
      if (_ui) _ui.resetState();
      window.NET_SESSION = null;
    }
  };
})();

