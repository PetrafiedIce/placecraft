// Placecraft frontend: textured collaborative canvas synced over Socket.IO.
// Layout: chrome-less stage, floating picker in bottom-right, frosted-glass picker modal,
// floating HUD buttons (3D / PNG / .litematic) in top-right.

  "use strict";

  // ---------- DOM ----------
  const stage         = document.getElementById("stage");
  const viewCanvas    = document.getElementById("view");
  const threeHost     = document.getElementById("three-host");
  const coordEl       = document.getElementById("coord");
  const zoomEl        = document.getElementById("zoom-hud");
  const connToastEl   = document.getElementById("conn-toast");
  const modeToggleBtn = document.getElementById("mode-toggle");
  const modeToggleLabel = document.getElementById("mode-toggle-label");

  const pickerBtn       = document.getElementById("picker-btn");
  const pickerOverlay   = document.getElementById("picker-overlay");
  const pickerSearch    = document.getElementById("picker-search");
  const pickerCloseBtn  = document.getElementById("picker-close");
  const pickerBody      = document.getElementById("picker-body");
  const pickerEmpty     = document.getElementById("picker-empty");
  const triggerSwatch   = document.getElementById("picker-trigger-swatch");
  const triggerName     = document.getElementById("picker-trigger-name");

  // ---------- Resources ----------
  let blocksData = null;
  let BLOCKS = null;
  let atlasImage = null;
  let TILE = 16;

  // ---------- World state ----------
  let WIDTH = 128;
  let HEIGHT = 128;
  let COOLDOWN_MS = 30000;
  let pixels = null;
  let colorCanvas, colorCtx;
  let textureCanvas, textureCtx;
  let initialized = false;

  // ---------- View ----------
  let viewOffsetX = 0, viewOffsetY = 0, scale = 4;
  let dpr = window.devicePixelRatio || 1;

  // ---------- Interaction ----------
  let selectedBlock = 1;
  let spaceHeld = false;
  let panning = false;
  let panLastX = 0, panLastY = 0;
  let dragMoved = false;
  let lastHoverX = -1, lastHoverY = -1;
  let pendingInit = null;

  // ---------- Cooldown ----------
  let cooldownUntil = 0;

  // ============================================================
  //  Load /atlas.png + /blocks-data.json
  // ============================================================
  function loadResources() {
    return Promise.all([
      fetch("/blocks-data.json").then((r) => r.json()).then((d) => {
        blocksData = d; BLOCKS = d.blocks; TILE = d.tileSize;
      }),
      new Promise((resolve, reject) => {
        atlasImage = new Image();
        atlasImage.onload = resolve;
        atlasImage.onerror = () => reject(new Error("Failed to load /atlas.png"));
        atlasImage.src = "/atlas.png";
      }),
    ]);
  }

  // ============================================================
  //  Build picker palette
  // ============================================================
  const SWATCH_PX = 48;          // exact CSS slot size — keep in sync with style.css .swatches

  function backgroundForBlock(block, px) {
    const bgScale = px / TILE;
    return {
      image: `url('/atlas.png')`,
      size: `${blocksData.atlasWidth * bgScale}px ${blocksData.atlasHeight * bgScale}px`,
      position: `-${block.atlasX * bgScale}px -${block.atlasY * bgScale}px`,
    };
  }

  function buildPalette() {
    pickerSearch.placeholder = `Search ${BLOCKS.length} blocks…`;
    pickerBody.innerHTML = "";

    const groups = new Map();
    BLOCKS.forEach((block, i) => {
      const g = block.group || "Other";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push({ block, index: i });
    });

    for (const [groupName, items] of groups) {
      const group = document.createElement("div");
      group.className = "group";
      group.dataset.group = groupName;

      const title = document.createElement("div");
      title.className = "group-title";
      title.innerHTML = `${groupName}<span class="group-count">${items.length}</span>`;
      group.appendChild(title);

      const grid = document.createElement("div");
      grid.className = "swatches";

      for (const { block, index } of items) {
        const sw = document.createElement("div");
        sw.className = "swatch";
        sw.dataset.idx = String(index);
        sw.dataset.id = block.id;
        sw.dataset.name = block.name;
        if (block.id === "minecraft:air") {
          sw.classList.add("swatch--air");
        } else {
          const bg = backgroundForBlock(block, SWATCH_PX);
          sw.style.backgroundImage = bg.image;
          sw.style.backgroundSize = bg.size;
          sw.style.backgroundPosition = bg.position;
        }
        sw.addEventListener("click", () => selectBlock(index));
        grid.appendChild(sw);
      }
      group.appendChild(grid);
      pickerBody.appendChild(group);
    }
    refreshSelection();
  }

  function applyFilters() {
    const q = pickerSearch.value.trim().toLowerCase();
    let anyVisible = false;
    for (const group of pickerBody.querySelectorAll(".group")) {
      let visibleInGroup = 0;
      for (const sw of group.querySelectorAll(".swatch")) {
        const name = (sw.dataset.name || "").toLowerCase();
        const id = (sw.dataset.id || "").toLowerCase();
        const ok = !q || name.includes(q) || id.includes(q);
        sw.classList.toggle("swatch--hidden", !ok);
        if (ok) visibleInGroup++;
      }
      group.classList.toggle("group--hidden", visibleInGroup === 0);
      if (visibleInGroup > 0) anyVisible = true;
    }
    pickerEmpty.hidden = anyVisible;
  }

  function selectBlock(idx) {
    selectedBlock = idx;
    refreshSelection();
    closePicker();
  }

  function refreshSelection() {
    if (!BLOCKS) return;
    const block = BLOCKS[selectedBlock];
    triggerName.textContent = block.name;
    if (block.id === "minecraft:air") {
      triggerSwatch.style.backgroundImage = "";
      triggerSwatch.classList.add("swatch--air");
    } else {
      triggerSwatch.classList.remove("swatch--air");
      // The trigger swatch is 44px. Scale background to fit.
      const swPx = 44;
      const bgScale = swPx / TILE;
      triggerSwatch.style.backgroundImage = `url('/atlas.png')`;
      triggerSwatch.style.backgroundSize = `${blocksData.atlasWidth * bgScale}px ${blocksData.atlasHeight * bgScale}px`;
      triggerSwatch.style.backgroundPosition = `-${block.atlasX * bgScale}px -${block.atlasY * bgScale}px`;
    }
    for (const el of pickerBody.querySelectorAll(".swatch")) {
      const i = parseInt(el.dataset.idx, 10);
      el.classList.toggle("swatch--selected", i === selectedBlock);
    }
  }

  function openPicker() {
    pickerOverlay.hidden = false;
    pickerSearch.value = "";
    applyFilters();
    setTimeout(() => pickerSearch.focus(), 30);
    // Scroll the currently-selected slot into view inside the body.
    const sel = pickerBody.querySelector(".swatch--selected");
    if (sel) sel.scrollIntoView({ block: "center", behavior: "auto" });
  }
  function closePicker() {
    pickerOverlay.hidden = true;
  }

  pickerBtn.addEventListener("click", openPicker);
  pickerCloseBtn.addEventListener("click", closePicker);
  pickerOverlay.addEventListener("click", (e) => {
    if (e.target === pickerOverlay) closePicker();
  });
  pickerSearch.addEventListener("input", applyFilters);
  pickerSearch.addEventListener("keydown", (e) => {
    if (e.code === "Enter") {
      const sw = pickerBody.querySelector(".swatch:not(.swatch--hidden)");
      if (sw) selectBlock(parseInt(sw.dataset.idx, 10));
    }
  });

  // ============================================================
  //  World canvases
  // ============================================================
  function initWorld(width, height, snapshotBuf) {
    WIDTH = width; HEIGHT = height;
    let ab;
    if (snapshotBuf instanceof ArrayBuffer) ab = snapshotBuf;
    else if (ArrayBuffer.isView(snapshotBuf)) {
      ab = snapshotBuf.buffer.slice(snapshotBuf.byteOffset, snapshotBuf.byteOffset + snapshotBuf.byteLength);
    } else ab = new ArrayBuffer(WIDTH * HEIGHT * 2);
    pixels = new Uint16Array(ab);

    colorCanvas = document.createElement("canvas");
    colorCanvas.width = WIDTH; colorCanvas.height = HEIGHT;
    colorCtx = colorCanvas.getContext("2d");

    textureCanvas = document.createElement("canvas");
    textureCanvas.width = WIDTH * TILE; textureCanvas.height = HEIGHT * TILE;
    textureCtx = textureCanvas.getContext("2d");
    textureCtx.imageSmoothingEnabled = false;

    repaintAll();
    initialized = true;
    fitView();
    render();
  }

  function repaintAll() {
    const img = colorCtx.createImageData(WIDTH, HEIGHT);
    for (let i = 0; i < pixels.length; i++) {
      const block = BLOCKS[pixels[i]] || BLOCKS[0];
      const o = i * 4;
      img.data[o]     = block.r;
      img.data[o + 1] = block.g;
      img.data[o + 2] = block.b;
      img.data[o + 3] = block.a;
    }
    colorCtx.putImageData(img, 0, 0);

    textureCtx.clearRect(0, 0, textureCanvas.width, textureCanvas.height);
    for (let py = 0; py < HEIGHT; py++) {
      for (let px = 0; px < WIDTH; px++) {
        const block = BLOCKS[pixels[py * WIDTH + px]];
        if (!block || block.id === "minecraft:air") continue;
        textureCtx.drawImage(
          atlasImage, block.atlasX, block.atlasY, TILE, TILE,
          px * TILE, py * TILE, TILE, TILE
        );
      }
    }
  }

  function paintPixel(x, y, idx) {
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
    pixels[y * WIDTH + x] = idx;
    const block = BLOCKS[idx] || BLOCKS[0];

    colorCtx.clearRect(x, y, 1, 1);
    if (block.a !== 0) {
      colorCtx.fillStyle = `rgba(${block.r},${block.g},${block.b},${block.a / 255})`;
      colorCtx.fillRect(x, y, 1, 1);
    }
    textureCtx.clearRect(x * TILE, y * TILE, TILE, TILE);
    if (block.id !== "minecraft:air") {
      textureCtx.drawImage(
        atlasImage, block.atlasX, block.atlasY, TILE, TILE,
        x * TILE, y * TILE, TILE, TILE
      );
    }
  }

  // ============================================================
  //  View rendering
  // ============================================================
  function resizeView() {
    dpr = window.devicePixelRatio || 1;
    const w = stage.clientWidth, h = stage.clientHeight;
    viewCanvas.width = Math.floor(w * dpr);
    viewCanvas.height = Math.floor(h * dpr);
    viewCanvas.style.width = w + "px";
    viewCanvas.style.height = h + "px";
    render();
  }

  function fitView() {
    const w = stage.clientWidth, h = stage.clientHeight;
    const pad = 48;
    const sx = (w - pad * 2) / WIDTH;
    const sy = (h - pad * 2) / HEIGHT;
    scale = Math.max(1, Math.min(sx, sy));
    viewOffsetX = (w - WIDTH * scale) / 2;
    viewOffsetY = (h - HEIGHT * scale) / 2;
    render();
  }

  function render() {
    if (!viewCanvas.width) return;
    const ctx = viewCanvas.getContext("2d");
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewCanvas.width / dpr, viewCanvas.height / dpr);
    ctx.imageSmoothingEnabled = false;

    // Canvas "card" — white surface with a soft shadow so it floats above the page.
    const cx = viewOffsetX, cy = viewOffsetY;
    const cw = WIDTH * scale, ch = HEIGHT * scale;
    ctx.save();
    ctx.shadowColor = "rgba(15, 18, 28, 0.10)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx, cy, cw, ch);
    ctx.restore();

    if (initialized) {
      const useTextures = scale >= 6;
      const src = useTextures ? textureCanvas : colorCanvas;
      ctx.drawImage(src, cx, cy, cw, ch);
    }

    // Grid (only when zoomed in)
    if (scale >= 8) {
      ctx.strokeStyle = "rgba(15, 18, 28, 0.07)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= WIDTH; x++) {
        const px = Math.round(cx + x * scale) + 0.5;
        ctx.moveTo(px, cy); ctx.lineTo(px, cy + ch);
      }
      for (let y = 0; y <= HEIGHT; y++) {
        const py = Math.round(cy + y * scale) + 0.5;
        ctx.moveTo(cx, py); ctx.lineTo(cx + cw, py);
      }
      ctx.stroke();
    }

    // Subtle border
    ctx.strokeStyle = "rgba(15, 18, 28, 0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(cx) - 0.5, Math.round(cy) - 0.5, Math.round(cw) + 1, Math.round(ch) + 1);

    // Hover highlight
    if (lastHoverX >= 0) {
      ctx.strokeStyle = "rgba(40, 103, 255, 0.95)";
      ctx.lineWidth = 2;
      ctx.strokeRect(cx + lastHoverX * scale, cy + lastHoverY * scale, scale, scale);
    }

    ctx.restore();
    zoomEl.textContent = `${Math.round(scale * 100 / 4)}%`;
  }

  function screenToWorld(mx, my) {
    return { x: Math.floor((mx - viewOffsetX) / scale), y: Math.floor((my - viewOffsetY) / scale) };
  }

  function zoomAt(mx, my, factor) {
    const newScale = Math.max(0.5, Math.min(64, scale * factor));
    const wx = (mx - viewOffsetX) / scale;
    const wy = (my - viewOffsetY) / scale;
    scale = newScale;
    viewOffsetX = mx - wx * scale;
    viewOffsetY = my - wy * scale;
    render();
  }

  // ============================================================
  //  Mouse / keyboard
  // ============================================================
  function viewMousePos(e) {
    const rect = viewCanvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  viewCanvas.addEventListener("mousedown", (e) => {
    viewCanvas.focus();
    const { x, y } = viewMousePos(e);
    if (e.button === 2 || e.button === 1 || (e.button === 0 && spaceHeld)) {
      panning = true; panLastX = x; panLastY = y; dragMoved = false;
      viewCanvas.classList.add("panning");
      e.preventDefault();
    } else if (e.button === 0) {
      panning = false; dragMoved = false; panLastX = x; panLastY = y;
    }
  });

  viewCanvas.addEventListener("mousemove", (e) => {
    const { x, y } = viewMousePos(e);
    if (panning) {
      viewOffsetX += x - panLastX;
      viewOffsetY += y - panLastY;
      panLastX = x; panLastY = y; dragMoved = true;
      render(); return;
    }
    const w = screenToWorld(x, y);
    if (w.x >= 0 && w.x < WIDTH && w.y >= 0 && w.y < HEIGHT) {
      coordEl.textContent = `${w.x}, ${w.y}`;
      if (w.x !== lastHoverX || w.y !== lastHoverY) {
        lastHoverX = w.x; lastHoverY = w.y; render();
      }
    } else {
      coordEl.textContent = "—";
      if (lastHoverX !== -1) { lastHoverX = -1; lastHoverY = -1; render(); }
    }
  });

  viewCanvas.addEventListener("mouseup", (e) => {
    const { x, y } = viewMousePos(e);
    if (panning) { panning = false; viewCanvas.classList.remove("panning"); return; }
    if (e.button === 0 && !dragMoved) {
      const w = screenToWorld(x, y);
      if (w.x >= 0 && w.x < WIDTH && w.y >= 0 && w.y < HEIGHT) {
        attemptPlace(w.x, w.y, e.clientX, e.clientY);
      }
    }
  });

  viewCanvas.addEventListener("mouseleave", () => {
    if (lastHoverX !== -1) { lastHoverX = -1; lastHoverY = -1; coordEl.textContent = "—"; render(); }
  });

  viewCanvas.addEventListener("contextmenu", (e) => e.preventDefault());

  viewCanvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const { x, y } = viewMousePos(e);
    zoomAt(x, y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && !pickerOverlay.hidden) {
      closePicker(); e.preventDefault(); return;
    }
    // Don't capture editing keys when the search box has focus.
    if (document.activeElement === pickerSearch) return;
    if (e.code === "Space" && !spaceHeld) {
      spaceHeld = true; viewCanvas.classList.add("pan-ready"); e.preventDefault();
    } else if (e.code === "KeyR") {
      viewOffsetX = (stage.clientWidth - WIDTH * scale) / 2;
      viewOffsetY = (stage.clientHeight - HEIGHT * scale) / 2;
      render();
    } else if (e.code === "KeyF") {
      fitView();
    } else if (e.code === "KeyB" || e.code === "Slash") {
      // Quick keyboard access to the picker.
      openPicker(); e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") { spaceHeld = false; viewCanvas.classList.remove("pan-ready"); }
  });

  window.addEventListener("resize", resizeView);

  // ============================================================
  //  Cooldown (state only — the floating number on click is the UI)
  // ============================================================
  function setCooldown(ms) { cooldownUntil = Date.now() + ms; }

  function spawnFloater(clientX, clientY, text, kind /* "good"|"bad"|"" */) {
    const f = document.createElement("div");
    f.className = "floater" + (kind ? " floater--" + kind : "");
    f.textContent = text;
    f.style.left = clientX + "px";
    f.style.top = clientY + "px";
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1200);
  }

  // ============================================================
  //  Socket
  // ============================================================
  const socket = io({ transports: ["websocket", "polling"] });

  socket.on("connect",    () => { connToastEl.hidden = true; });
  socket.on("disconnect", () => { connToastEl.textContent = "Reconnecting…"; connToastEl.hidden = false; });
  socket.on("connect_error", () => { connToastEl.textContent = "Offline"; connToastEl.hidden = false; });

  socket.on("init", (msg) => {
    if (!BLOCKS || !atlasImage || !atlasImage.complete) { pendingInit = msg; return; }
    handleInit(msg);
  });

  function handleInit(msg) {
    COOLDOWN_MS = msg.cooldownMs;
    initWorld(msg.width, msg.height, msg.snapshot);
    if (msg.remainingCooldown > 0) setCooldown(msg.remainingCooldown);
  }

  socket.on("placed", ({ x, y, b }) => { paintPixel(x, y, b); render(); });
  socket.on("clear", () => { pixels.fill(0); repaintAll(); render(); });

  function attemptPlace(x, y, clientX, clientY) {
    // Already on cooldown locally — refuse and show the remaining time as a floater.
    if (Date.now() < cooldownUntil) {
      const secs = Math.ceil((cooldownUntil - Date.now()) / 1000);
      spawnFloater(clientX, clientY, `wait ${secs}s`, "bad");
      return;
    }
    // Optimistic paint, rollback on server rejection.
    const prev = pixels[y * WIDTH + x];
    paintPixel(x, y, selectedBlock);
    render();

    socket.emit("place", { x, y, blockIndex: selectedBlock }, (ack) => {
      if (!ack || !ack.ok) {
        paintPixel(x, y, prev);
        render();
        if (ack && ack.reason === "cooldown" && typeof ack.remaining === "number") {
          setCooldown(ack.remaining);
          spawnFloater(clientX, clientY, `wait ${Math.ceil(ack.remaining / 1000)}s`, "bad");
        } else if (ack && ack.reason === "block_limit") {
          spawnFloater(clientX, clientY, `max ${ack.max || 3}`, "bad");
        } else {
          spawnFloater(clientX, clientY, "blocked", "bad");
        }
        return;
      }
      setCooldown(ack.cooldownMs);
      spawnFloater(clientX, clientY, `${Math.round(ack.cooldownMs / 1000)}s`, "good");
    });
  }

  // ============================================================
  //  Boot
  // ============================================================
  loadResources()
    .then(() => {
      buildPalette();
      resizeView();
      if (pendingInit) {
        const m = pendingInit; pendingInit = null;
        handleInit(m);
      }
    })
    .catch((err) => {
      console.error("Resource load failed:", err);
      pickerBody.innerHTML =
        `<div style="padding:20px;color:#ef4444;font-weight:700;">
           Failed to load /atlas.png or /blocks-data.json.<br>
           Run <code>node scripts/build-textures.js</code> on the server.
         </div>`;
    });

  // ============================================================
  //  3D preview mode (loads Three.js on first toggle)
  // ============================================================
  let renderer3D = null;
  let mode3D = false;

  modeToggleBtn.addEventListener("click", async () => {
    if (mode3D) {
      // Back to 2D
      mode3D = false;
      document.body.classList.remove("mode-3d");
      threeHost.hidden = true;
      modeToggleLabel.textContent = "3D";
      modeToggleBtn.classList.remove("hud-btn--active");
      if (renderer3D) renderer3D.pause();
      // The 2D canvas was hidden via CSS — resize on return so it picks up dimensions again.
      requestAnimationFrame(() => { resizeView(); render(); });
      return;
    }

    if (!initialized) return;  // can't preview before snapshot arrives

    if (!renderer3D) {
      modeToggleBtn.disabled = true;
      modeToggleLabel.textContent = "loading…";
      try {
        const mod = await import("/three3d.js");
        renderer3D = new mod.Renderer3D(threeHost, {
          atlasUrl: "/atlas.png",
          blocks: BLOCKS,
          width: WIDTH,
          height: HEIGHT,
          tileSize: TILE,
          atlasWidth: blocksData.atlasWidth,
          atlasHeight: blocksData.atlasHeight,
        });
      } catch (e) {
        console.error("Three.js load failed:", e);
        modeToggleBtn.disabled = false;
        modeToggleLabel.textContent = "3D";
        spawnFloater(window.innerWidth / 2, 80, "3D failed to load", "bad");
        return;
      }
      modeToggleBtn.disabled = false;
    }

    mode3D = true;
    document.body.classList.add("mode-3d");
    threeHost.hidden = false;
    modeToggleLabel.textContent = "2D";
    modeToggleBtn.classList.add("hud-btn--active");
    renderer3D.setPixels(pixels);
    renderer3D.resume();
  });

  // Keep the 3D scene in sync with live placements (other users' edits, etc.).
  socket.on("placed", ({ x, y, b }) => {
    if (renderer3D) renderer3D.setBlock(x, y, b);
  });
  socket.on("clear", () => {
    if (renderer3D) renderer3D.setPixels(pixels);
  });
