import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, positionView, metalness, roughness, vec2, vec4, smoothstep } from 'three/tsl';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { createPostProcessing } from './post-processing.js';
import { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js';
import { getLocationLabel, isTypingInField, ROADS, NYC_LANDMARKS, TELEPORT_LOCATIONS } from './city-config.js';
import { buildCityGrid } from './city-grid.js';
import { IS_MELBOURNE } from './city.js';
import { Q, QUALITY, QUALITY_SOURCE, GPU_NAME, QUALITY_LEVELS, setQuality } from './quality.js';
import { buildCityBlocks } from './buildings.js';
import { buildStreetDetails } from './street-details.js';
import { createTrafficSystem, createHighwayTraffic } from './traffic.js';
import { buildRoadPaint } from './road-paint.js';
import { ThirdPersonControllerManager } from './controllers.js';
import { TouchControls } from './touch-controls.js';
import { GamepadControls } from './gamepad-controls.js';
import { CameraSystem, CAMERA_PRESETS } from './cameras.js';
import { LightingSystem } from './lighting.js';
import { NYCMapSystem } from './nyc-map.js';
import { setupSceneCulling, updateSceneCulling } from './scene-culling.js';
import { CityAudioSystem } from './audio-system.js';

// Saved player positions, per city (the frames differ)
const PLAYER_STATE_KEY = IS_MELBOURNE ? 'melbourne-player-state' : 'nyc-player-state';

// A point (the player on foot, radius r) pushed out of any of the boxes { x, z, yaw, halfL, halfW } it's inside
function pushOutOfBoxes(p, r, boxes) {
  for (const b of boxes) {
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    const dx = p.x - b.x, dz = p.z - b.z;
    const a = dx * fx + dz * fz, s = dx * fz - dz * fx;
    const pa = b.halfL + r - Math.abs(a), ps = b.halfW + r - Math.abs(s);
    if (pa <= 0 || ps <= 0) continue;
    // out along the shallower side
    if (ps < pa) { const k = Math.sign(s || 1) * ps; p.x += fz * k; p.z -= fx * k; }
    else { const k = Math.sign(a || 1) * pa; p.x += fx * k; p.z += fz * k; }
  }
}

// Application setup, shader warm-up and frame loop.

async function initApp() {
  const container = document.getElementById('canvas-container');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingStatus = document.getElementById('loading-status');
  const loadingFill = document.getElementById('loading-progress');

  // One progress bar for the whole start-up. Each stage fills a share of it sized after its typical duration (the
  // "[init]" timings logged below, on an M1 MacBook Air; `data` is fetching the code and data before this runs, which
  // the stylesheet animates). The fill glides through a stage as a compositor transition, so it keeps moving while the
  // stage's synchronous work blocks the main thread, at the pace the earlier stages ran at on this machine.
  const STAGE_MS = {
    data: 1800, renderer: 50, lighting: 60, cityGrid: 1800, landmarks: 200, blocks: 2100,
    streetDetails: 2200, traffic: 860, roadPaint: 170, controllers: 50, culling: 730, ui: 50, postFX: 60,
    compile: 3900, warmup: 1950, gpu: 300
  };
  const stageNames = Object.keys(STAGE_MS);
  const totalStageMs = stageNames.reduce((sum, name) => sum + STAGE_MS[name], 0);
  const loadingStartedAt = performance.now();
  let loadingStage = { from: 0, to: STAGE_MS.data / totalStageMs };

  const setLoadingProgress = (p, seconds = 0.3) => {
    if (!loadingFill) return;
    loadingFill.style.animation = 'none';
    loadingFill.style.transition = `transform ${seconds}s ${seconds > 0.3 ? 'linear' : 'ease'}`;
    loadingFill.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`;
  };
  // Progress through the current stage, for stages that can measure it
  const setStageProgress = (f) => setLoadingProgress(loadingStage.from + (loadingStage.to - loadingStage.from) * f);

  function beginLoadingStage(message, name, glide = true) {
    if (loadingStatus) loadingStatus.textContent = message;
    const index = stageNames.indexOf(name);
    const before = stageNames.slice(0, index).reduce((sum, n) => sum + STAGE_MS[n], 0);
    loadingStage = { from: before / totalStageMs, to: (before + STAGE_MS[name]) / totalStageMs };
    if (!glide) return setLoadingProgress(loadingStage.from);
    const ranMs = before - STAGE_MS.data;
    const pace = ranMs >= 1000 ? Math.min(4, Math.max(0.5, (performance.now() - loadingStartedAt) / ranMs)) : 1;
    setLoadingProgress(loadingStage.to, (STAGE_MS[name] * pace) / 1000);
  }

  async function showLoadingStage(message, name, glide) {
    beginLoadingStage(message, name, glide);
    if (document.hidden) return;
    // Let the label paint before synchronous work. The timeout also lets hidden tabs keep loading.
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 100);
      requestAnimationFrame(() => {
        clearTimeout(timeout);
        setTimeout(resolve, 0);
      });
    });
  }

  await showLoadingStage('Initializing graphics...', 'renderer');

  // 1. Initialize Three.js WebGPURenderer with 32-bit float reversedDepthBuffer.
  // Firefox WebGL2 incurs a heavy renderbufferStorageMultisample + blitFramebuffer stall
  // on multisampled floating-point MRT post-processing render targets, so disable MSAA on Firefox.
  const isFirefox = typeof navigator !== 'undefined' && /Firefox\//.test(navigator.userAgent);
  const renderer = new THREE.WebGPURenderer({
    // ?webgl forces three's WebGL2 backend (for browsers whose WebGPU is missing or unstable, and for testing)
    forceWebGL: new URLSearchParams(location.search).has('webgl'),
    antialias: !isFirefox && Q.antialias,
    powerPreference: 'high-performance',
    reversedDepthBuffer: true
  });
  // Render scale by graphics quality (js/quality.js); adapted to the frame rate as the game runs (see the loop)
  let pixelRatio = Q.pixelRatio;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = Q.shadows;
  console.info(`[quality] ${QUALITY} (${QUALITY_SOURCE}${GPU_NAME ? `: ${GPU_NAME}` : ''})`);
  renderer.lighting = new ClusteredLighting(256, 32, 28, 48);
  container.appendChild(renderer.domElement);

  // Start-up phase timings (logged once as "[init] ...") to keep load-time regressions traceable
  let initTimings = [];
  let initMark = performance.now();
  const markInit = (label) => {
    const now = performance.now();
    initTimings.push(`${label} ${Math.round(now - initMark)}ms`);
    initMark = now;
  };

  await renderer.init();
  markInit('renderer');

  // 2. Scene, atmosphere and lighting
  await showLoadingStage('Creating sky and environment lighting...', 'lighting');
  const scene = new THREE.Scene();
  const lightingSystem = new LightingSystem(scene, renderer);
  markInit('lighting');

  // 3. Build Manhattan Geography, Iconic Landmarks, Blocks, Street Details & Traffic
  await showLoadingStage('Building streets, parks and waterfronts...', 'cityGrid');
  const cityGrid = buildCityGrid(scene);
  markInit('cityGrid');
  await showLoadingStage('Building landmarks...', 'landmarks');
  // Melbourne: the old game's landmark models on their real sites (js/melbourne-landmarks.js)
  const { colliders: landmarkColliders } = await (await import('./melbourne-landmarks.js')).buildMelbourneLandmarks(scene);
  markInit('landmarks');
  await showLoadingStage('Generating building footprints and facades...', 'blocks');
  const cityBlocks = buildCityBlocks(scene, landmarkColliders);
  markInit('blocks');
  const allColliders = [...landmarkColliders, ...cityBlocks.colliders, ...(cityGrid.colliders || [])];

  await showLoadingStage('Placing trees, streetlights and street furniture...', 'streetDetails');
  const streetDetails = buildStreetDetails(scene, allColliders);
  markInit('streetDetails');
  await showLoadingStage('Creating traffic and pedestrian routes...', 'traffic');
  // Buildings turned along non-grid streets have oriented colliders whose world bounds reach past their lots: they stay
  // inside the property line anyway, so the road network (lanes & sidewalks) doesn't need them.
  // Elevated building sections that clear even a bus don't obstruct ground traffic.
  const trafficSystem = createTrafficSystem(scene, cityGrid.sidewalks, [
    ...cityGrid.footprints,
    ...streetDetails.footprints,
    ...allColliders.filter((c) => !c.obb && (c.minY ?? 0) < 3.5)
  ], streetDetails.signalIntersections);
  markInit('traffic');
  const highwayTraffic = createHighwayTraffic(scene, cityGrid.highwayLanes);
  // Melbourne's trams on the real routes (js/trams.js)
  const tramSystem = IS_MELBOURNE ? await (await import('./trams.js')).createTramSystem(scene) : null;
  await showLoadingStage('Adding road markings...', 'roadPaint');
  buildRoadPaint(scene, trafficSystem.network, cityGrid.roadPaint);
  markInit('roadPaint');

  // 4. Initialize Third-Person Controllers (Person, Car, Cyclist, Helicopter) & Multi-Camera System
  await showLoadingStage('Preparing player, vehicles and controls...', 'controllers');
  const controllerManager = new ThirdPersonControllerManager(scene, allColliders);
  let gameplay = null; // js/gameplay.js (Melbourne), created once the HUD is up
  let race = null; // js/race.js, the Albert Park Grand Prix
  // Reuse teleport placement so saved players return at rest, close to their last positions.
  try {
    const saved = JSON.parse(localStorage.getItem(PLAYER_STATE_KEY));
    if (saved?.version === 1) {
      for (const mode of Object.keys(controllerManager.entities)) {
        const p = saved.entities?.[mode];
        if (!p || ![p.x, p.y, p.z, p.heading].every(Number.isFinite)) continue;
        controllerManager.setMode(mode);
        controllerManager.teleportActiveTo(p.x, p.z, p.heading, p.y);
      }
      controllerManager.setMode(Object.hasOwn(controllerManager.entities, saved.activeMode) ? saved.activeMode : 'car');
    }
  } catch { /* Missing or unavailable storage does not prevent playing. */ }

  function savePlayerState() {
    try {
      const entities = Object.fromEntries(Object.entries(controllerManager.entities).map(([mode, entity]) => [mode, {
        x: entity.position.x, y: entity.position.y, z: entity.position.z, heading: entity.heading
      }]));
      localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify({ version: 1, activeMode: controllerManager.activeMode, entities }));
    } catch { /* Storage may be disabled or full. */ }
  }

  const cameraSystem = new CameraSystem(renderer.domElement, controllerManager);
  const touchControls = new TouchControls(controllerManager);
  const soundButton = document.getElementById('btn-sound');
  const audioSystem = new CityAudioSystem({ controllerManager, trafficSystem, highwayTraffic, streetDetails }, {
    onStateChange: updateSoundButton
  });
  function updateSoundButton() {
    if (!soundButton) return;
    soundButton.disabled = !audioSystem.supported;
    soundButton.setAttribute('aria-pressed', String(audioSystem.enabled));
    soundButton.setAttribute('aria-label', audioSystem.enabled ? 'Mute sound' : 'Enable sound');
    soundButton.title = audioSystem.supported ? `${audioSystem.enabled ? 'Mute' : 'Enable'} sound [N]` : 'Web Audio is unavailable';
    soundButton.querySelector('use').setAttribute('href', audioSystem.enabled ? '#i-sound' : '#i-sound-off');
  }
  soundButton?.addEventListener('click', () => audioSystem.setEnabled(!audioSystem.enabled));
  updateSoundButton();
  // pagehide also covers navigation away on mobile; preserve the context across back-forward cache restores.
  window.addEventListener('pagehide', (event) => {
    savePlayerState();
    if (!event.persisted) audioSystem.dispose();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) savePlayerState(); });
  markInit('controllers');

  // Island-wide static geometry: chunk & distance-cull the small props, shadow stand-ins for the big casters
  // (scene-culling.js)
  await showLoadingStage('Preparing scene visibility and shadows...', 'culling');
  const cullingRoots = ['ManhattanCityGrid', 'MelbourneCityGrid', 'ManhattanCityBlocks', 'ManhattanStreetDetails', 'ManhattanLandmarks', 'Boroughs', 'RoadMarkings']
    .map((name) => scene.getObjectByName(name))
    .filter(Boolean);
  setupSceneCulling(scene, cullingRoots, lightingSystem.sunLight.shadow);

  // Initialize static world matrices once, including the chunks and shadow proxies created above.
  // Crowd, tree and building-detail animation changes instance/pose buffers, not Object3D transforms.
  const dynamicRoots = [
    trafficSystem.group,
    ...(tramSystem ? [tramSystem.group] : []),
    highwayTraffic.group,
    scene.getObjectByName('StoreClusteredLights'),
    scene.getObjectByName('StreetClusteredLights'),
    ...Object.values(controllerManager.entities).map((entity) => entity.mesh),
    controllerManager.entities.cyclist.helmet
  ];
  scene.updateMatrixWorld(true);
  scene.matrixWorldAutoUpdate = false;
  // Everything added to the scene after this (mission markers, gunfire effects, the people, ...) moves: keep its
  // world matrices up to date every frame too
  const staticChildren = new Set(scene.children);
  markInit('culling');

  // 5. TSL RenderPipeline with Half-Res Screen Space Reflections (SSRNode), Bloom & Filmic Toning
  //    Fade out distant and matte surfaces so SSR spends its rays on visible glossy reflections.
  await showLoadingStage('Setting up visual effects, map and interface...', 'ui');
  // Low quality renders straight to the screen (tone mapping only); medium adds bloom and the grade; high also has the
  // screen-space reflections
  let colorGrade, renderPipeline;
  let compileTarget = null, compileMRT = null; // what precompileShaders() renders into (the scene pass, if any)
  if (Q.postFX === 'none') {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    colorGrade = { applyPreset() {} };
    renderPipeline = { render: () => renderer.render(scene, cameraSystem.camera) };
  } else if (Q.postFX === 'bloom') {
    const scenePass = pass(scene, cameraSystem.camera);
    scenePass.renderTarget.storeMultisampledColorBuffer = false;
    colorGrade = createPostProcessing(renderer, scenePass.getTextureNode('output'), vec4(0));
    compileTarget = scenePass.renderTarget;
    renderPipeline = new THREE.RenderPipeline(renderer, colorGrade.outputNode);
  } else {
    const scenePass = pass(scene, cameraSystem.camera);
    // The multisampled colour attachments (output, normal, metalRough) only need resolving, never storing: discarding
    // them spares the GPU writing 3 x 4 samples per pixel to memory every frame (transient, memoryless attachments where
    // the browser supports them). The multisampled depth stays stored: SSR reads it.
    scenePass.renderTarget.storeMultisampledColorBuffer = false;
    const ssrFade = smoothstep(360.0, 180.0, positionView.z.negate());
    const maxSSRRoughness = 0.75;
    const sceneMRT = mrt({
      output: output,
      normal: normalView,
      metalRough: vec2(roughness.lessThan(maxSSRRoughness).select(metalness.mul(ssrFade), 0), roughness)
    });
    sceneMRT.setBlendMode('normal', new THREE.BlendMode(THREE.MaterialBlending));
    sceneMRT.setBlendMode('metalRough', new THREE.BlendMode(THREE.MaterialBlending));
    scenePass.setMRT(sceneMRT);

    const scenePassColor = scenePass.getTextureNode('output');
    const scenePassDepth = scenePass.getTextureNode('depth');
    const scenePassNormal = scenePass.getTextureNode('normal');
    const scenePassMetalRough = scenePass.getTextureNode('metalRough');

    const ssrPass = ssr(scenePassColor, scenePassDepth, scenePassNormal, {
      metalnessNode: scenePassMetalRough.r,
      roughnessNode: scenePassMetalRough.g,
      camera: cameraSystem.camera
    });
    ssrPass.resolutionScale = 0.5;
    ssrPass.blurQuality = 1;
    ssrPass.maxDistance.value = 42;
    ssrPass.thickness.value = 0.85;
    // Fewer coarse steps, then refine detected hits to keep reflection edges precise.
    ssrPass.quality.value = 0.25;
    ssrPass.binaryRefine = true;
    ssrPass.intensity.value = 0.50;
    ssrPass.screenEdgeFadeBlack = true;

    // Roughness mip blur must not spread reflections back onto matte or nonreflective surfaces.
    const reflectionMask = scenePassMetalRough.r.greaterThan(0).select(smoothstep(maxSSRRoughness, 0.55, scenePassMetalRough.g), 0);
    const reflections = ssrPass.mul(reflectionMask);
    colorGrade = createPostProcessing(renderer, scenePassColor, reflections);
    compileTarget = scenePass.renderTarget;
    compileMRT = sceneMRT;
    renderPipeline = new THREE.RenderPipeline(renderer, colorGrade.outputNode);
  }


  // Melbourne's teleport destinations replace the New York ones in the popover
  if (IS_MELBOURNE) {
    const pop = document.getElementById('teleport-popover');
    for (const b of pop.querySelectorAll('[data-teleport]')) b.remove();
    for (const [key, loc] of Object.entries(TELEPORT_LOCATIONS)) {
      const b = document.createElement('button');
      b.className = 'pop-item tp-btn';
      b.type = 'button';
      b.dataset.teleport = key;
      const n = document.createElement('span');
      n.className = 'pop-name';
      n.textContent = loc.name;
      const sub = document.createElement('span');
      sub.className = 'pop-sub';
      sub.textContent = loc.sub;
      b.append(n, sub);
      pop.append(b);
    }
  }

  // 6. Wire UI Controls (Strictly using safe DOM APIs: textContent, classList, addEventListener)
  const modeButtons = document.querySelectorAll('[data-mode]');
  const cameraButtons = document.querySelectorAll('[data-camera]');
  const timeButtons = document.querySelectorAll('[data-time]');
  const teleportButtons = document.querySelectorAll('[data-teleport]');
  const hudToggleBtn = document.getElementById('btn-toggle-hud');
  const modeSwitch = document.getElementById('mode-switch');
  touchControls.onAvailabilityChange = placeModeIndicator;

  // The car and weather buttons: one press, the next one (also X and Y)
  const carCycleBtn = document.getElementById('btn-car-cycle');
  const weatherBtn = document.getElementById('btn-weather');
  const weatherLabel = document.getElementById('weather-label');
  if (!IS_MELBOURNE) { if (carCycleBtn) carCycleBtn.hidden = true; }
  const nextWeather = () => { const name = lightingSystem.cycleWeather(); if (weatherLabel) weatherLabel.textContent = name; };
  if (weatherBtn) weatherBtn.addEventListener('click', nextWeather);
  if (carCycleBtn) carCycleBtn.addEventListener('click', () => gameplay?.cycleCar());
  window.addEventListener('keydown', (e) => {
    if (isTypingInField(e) || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'KeyY') nextWeather();
    else if (e.code === 'KeyX' && gameplay) gameplay.cycleCar();
  });

  // Graphics menu: High / Medium / Low, the current one ticked; picking another saves it and reloads (js/quality.js)
  {
    const label = document.getElementById('quality-label');
    const names = { low: 'GFX Low', medium: 'GFX Med', high: 'GFX High' };
    if (label) label.textContent = names[QUALITY];
    const note = document.getElementById('quality-note');
    if (note) note.textContent = GPU_NAME ? `Graphics card: ${GPU_NAME}` : '';
    for (const b of document.querySelectorAll('[data-quality]')) {
      const level = b.dataset.quality;
      b.classList.toggle('active', level === QUALITY);
      b.setAttribute('aria-pressed', String(level === QUALITY));
      b.addEventListener('click', () => {
        if (level === QUALITY) { closePopovers(); return; }
        setQuality(level);
      });
    }
  }
  const elFps = document.getElementById('hud-fps');
  const fpsWindow = [];
  const elMode = document.getElementById('hud-active-mode');
  const elCamera = document.getElementById('hud-active-camera');
  const elSpeed = document.getElementById('hud-speed');
  const elSpeedMeter = document.getElementById('hud-speed-meter');
  const elAltitude = document.getElementById('hud-altitude');
  const elLocation = document.getElementById('hud-location');
  const elControlsHint = document.getElementById('hud-controls-hint');
  const gamepadControls = new GamepadControls(controllerManager, cameraSystem, {
    onCycleMode: (step) => {
      const modes = ['person', 'car', 'cyclist', 'helicopter'];
      selectMode(modes[(modes.indexOf(controllerManager.activeMode) + step + modes.length) % modes.length]);
    },
    onCycleCamera: cycleCamera,
    onToggleMap: () => mapSystem.toggleFullMap(!mapSystem.isFullMapOpen),
    onCloseMap: () => mapSystem.toggleFullMap(false)
  });

  // Keyboard guide for each mode: [keys, action]
  const controlHints = {
    person: IS_MELBOURNE
      ? [[['WASD'], 'Move'], [['Shift'], 'Sprint'], [['F'], 'Get in'], [['RMB', 'Q'], 'Aim (mouse turns)'], [['Click', 'J'], 'Shoot'], [['T'], 'Talk']]
      : [[['W', 'S'], 'Walk / Run'], [['A', 'D'], 'Turn'], [['Space'], 'Jump'], [['Drag'], 'Orbit']],
    car: IS_MELBOURNE
      ? [[['W', 'S'], 'Drive / Reverse'], [['A', 'D'], 'Steer'], [['Space'], 'Handbrake'], [['F'], 'Get out'], [['B'], 'Horn']]
      : [[['W', 'S'], 'Drive / Reverse'], [['A', 'D'], 'Steer'], [['B'], 'Horn'], [['Drag'], 'Orbit']],
    cyclist: [[['W', 'S'], 'Pedal / Brake'], [['A', 'D'], 'Lean & Turn'], [['Drag'], 'Orbit']],
    helicopter: [[['W', 'S'], 'Pitch'], [['A', 'D'], 'Yaw'], [['Space', 'E'], 'Ascend'], [['Q', 'C'], 'Descend']]
  };
  // Top speeds in mph (controllers.js caps them at 8.2, 36, 19 & 52 m/s): full scale of the speed meter
  // (km/h in Melbourne)
  const topSpeedMph = { person: 30, car: 130, cyclist: 70, helicopter: 187 };

  function renderControlHints(mode) {
    if (!elControlsHint) return;
    const items = (controlHints[mode] || []).map(([keys, action]) => {
      const item = document.createElement('span');
      item.className = 'hint';
      for (const key of keys) {
        const kbd = document.createElement('kbd');
        kbd.textContent = key;
        item.appendChild(kbd);
      }
      const label = document.createElement('span');
      label.className = 'hint-label';
      label.textContent = action;
      item.appendChild(label);
      return item;
    });
    elControlsHint.replaceChildren(...items);
  }

  // The taxi-yellow pill under the selected mode glides from button to button
  function placeModeIndicator() {
    const active = modeSwitch ? modeSwitch.querySelector('.mode-btn.active') : null;
    if (!active) return;
    modeSwitch.style.setProperty('--ind-x', `${active.offsetLeft}px`);
    modeSwitch.style.setProperty('--ind-w', `${active.offsetWidth}px`);
  }

  function selectMode(mode) {
    // Melbourne: getting into and out of cars goes through js/gameplay.js, which keeps taken and parked cars straight
    if (gameplay && !gameplay.beforeMode(mode)) return;
    controllerManager.setMode(mode);
    touchControls.setMode(controllerManager.activeMode);
    gamepadControls.reset();
    modeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });
    document.body.dataset.mode = mode;
    placeModeIndicator();
    const ent = controllerManager.getActiveEntity();
    if (elMode) elMode.textContent = ent.label;
    renderControlHints(mode);

    // If currently on a static scenic camera, switch to 3rd-Person Chase so user sees their selected character/vehicle
    const currentCam = cameraSystem.getActivePreset();
    if (currentCam.category !== 'follow') {
      selectCamera('chase', false);
    }
  }

  function selectCamera(camId, snap = false) {
    cameraSystem.setCameraPreset(camId, snap);
    cameraButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-camera') === camId);
    });
    const preset = cameraSystem.getActivePreset();
    if (elCamera) elCamera.textContent = preset.name;
  }

  // Steps through CAMERA_PRESETS (V / Shift+V, and the arrows either side of the camera name)
  function cycleCamera(step) {
    const n = CAMERA_PRESETS.length;
    const idx = CAMERA_PRESETS.findIndex((p) => p.id === cameraSystem.activePresetId);
    selectCamera(CAMERA_PRESETS[(idx + step + n) % n].id, true);
  }

  function selectTime(timeId) {
    lightingSystem.applyPreset(timeId);
    colorGrade.applyPreset(lightingSystem.activePresetId);
    timeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-time') === timeId);
    });
  }

  // Popovers (native [popover]: light dismiss & Esc for free) open against the control that toggles them: data-anchor
  // names the element they sit above / below, data-align the one whose right edge they line up with
  const popovers = document.querySelectorAll('.popover[popover]');
  const supportsPopover = typeof HTMLElement.prototype.togglePopover === 'function';
  function closePopovers() {
    if (!supportsPopover) return;
    popovers.forEach((pop) => {
      if (pop.matches(':popover-open')) pop.hidePopover();
    });
  }
  popovers.forEach((pop) => {
    const invoker = document.querySelector(`[popovertarget="${pop.id}"]`);
    pop.addEventListener('beforetoggle', (e) => {
      const open = e.newState === 'open';
      if (invoker) invoker.classList.toggle('is-open', open);
      if (!open) return;
      const anchor = document.getElementById(pop.dataset.anchor) || invoker;
      const align = document.getElementById(pop.dataset.align) || invoker;
      if (!anchor || !align) return;
      const r = anchor.getBoundingClientRect();
      const spaceAbove = Math.max(0, r.top - 20);
      const spaceBelow = Math.max(0, window.innerHeight - r.bottom - 20);
      let above = pop.dataset.side === 'above';
      // The camera control moves to the top on touch screens; open toward the available space.
      if ((above ? spaceAbove : spaceBelow) < 160) above = spaceAbove > spaceBelow;
      pop.style.right = `${Math.max(8, window.innerWidth - align.getBoundingClientRect().right)}px`;
      if (above) {
        pop.style.top = 'auto';
        pop.style.bottom = `${window.innerHeight - r.top + 8}px`;
        pop.style.maxHeight = `${spaceAbove}px`;
      } else {
        pop.style.bottom = 'auto';
        pop.style.top = `${r.bottom + 8}px`;
        pop.style.maxHeight = `${spaceBelow}px`;
      }
    });
  });

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectMode(btn.getAttribute('data-mode'));
    });
  });

  cameraButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectCamera(btn.getAttribute('data-camera'), true);
      closePopovers();
    });
  });

  const camPrevBtn = document.getElementById('cam-prev');
  const camNextBtn = document.getElementById('cam-next');
  if (camPrevBtn) camPrevBtn.addEventListener('click', () => cycleCamera(-1));
  if (camNextBtn) camNextBtn.addEventListener('click', () => cycleCamera(1));

  timeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectTime(btn.getAttribute('data-time'));
    });
  });

  // A mouse click mustn't leave the focus on a HUD button, or Space (jump / ascend) and Enter would press it again
  document.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('button') : null;
    if (btn && e.detail > 0) btn.blur();
  });

  // Where you are: the place's name over its street corner, drawn as a pair of NYC street-name signs
  const roadNames = new Set(ROADS.map((r) => r.name));
  const placeNames = new Set(NYC_LANDMARKS.map((l) => l.name));
  let locationText = '';
  function renderLocation(label) {
    if (!elLocation || label === locationText) return;
    locationText = label;
    let place = '';
    let streets = label;
    const split = label.indexOf(' · ');
    if (split >= 0) {
      place = label.slice(0, split);
      streets = label.slice(split + 3);
    } else if (placeNames.has(label) || (!label.includes(' & ') && !roadNames.has(label))) {
      place = label;
      streets = '';
    }
    const nodes = [];
    if (place) {
      const el = document.createElement('div');
      el.className = 'location-place';
      el.textContent = place;
      nodes.push(el);
    }
    if (streets) {
      const row = document.createElement('div');
      row.className = 'location-signs';
      if (streets.startsWith('near ')) {
        streets = streets.slice(5);
        const near = document.createElement('span');
        near.className = 'location-near';
        near.textContent = 'near';
        row.appendChild(near);
      }
      for (const name of streets.split(' & ')) {
        const sign = document.createElement('span');
        sign.className = 'street-sign';
        sign.textContent = name;
        row.appendChild(sign);
      }
      nodes.push(row);
    }
    elLocation.replaceChildren(...nodes);
  }

  function teleportTo(x, z, heading = Math.PI) {
    const destination = controllerManager.teleportActiveTo(x, z, heading);
    touchControls.reset();
    gamepadControls.reset();
    cameraSystem.resetForTeleport();
    selectCamera('chase', true);
    mapSystem.waypoint = {
      x: destination.x,
      z: destination.z,
      name: getLocationLabel(destination.x, destination.z)
    };
    return destination;
  }
  // Hooks for scripted checks (tools and the browser console): teleport, switch modes and cameras
  window.__city = { scene, renderer, controllerManager, cameraSystem, trafficSystem, teleportTo, selectCamera: (id) => selectCamera(id, true) };

  const mapSystem = new NYCMapSystem({
    controllerManager,
    cameraSystem,
    allBlocks: cityBlocks.allBlocks,
    onToggle: (open) => {
      controllerManager.resetInput();
      touchControls.setEnabled(!open);
      gamepadControls.setEnabled(!open);
      const mapHint = document.getElementById('fullmap-hover-info');
      if (open && touchControls.available && mapHint) {
        mapHint.textContent = 'Tap to teleport · Drag to pan · Use + / − to zoom';
      }
    },
    onTeleport: teleportTo
  });

  // GTA Melbourne's story missions (js/missions.js), and a Jobs list in the teleport menu that takes you to any job
  // The cast (js/people.js): the player's character, the nearest pedestrians as realistic Rocketbox people
  // (MIT), and Vince and Kaz at their jobs
  const cast = IS_MELBOURNE ? (await import('./people.js')) : null;
  const castSystem = cast ? cast.createCast({ scene, controllerManager }) : null;
  if (cast) cast.castHook.cast = castSystem;
  window.__city.cast = castSystem;
  // St Kilda: the café on Acland Street and St Kilda Pier (js/stkilda.js)
  const stkilda = IS_MELBOURNE ? (await import('./stkilda.js')).createStKilda({ scene, cast: castSystem, controllerManager }) : null;
  // Recorded Australian voices for the characters, pedestrians and police (js/voice-manager.js, data/character-voices.json)
  const voices = IS_MELBOURNE ? await (await import('./voice-manager.js')).createVoiceManager({
    audioSystem, cameraSystem, trafficSystem, controllerManager, isCinematic: () => document.body.classList.contains('cinematic')
  }).catch((e) => { console.warn('[voices]', e); return null; }) : null;
  window.__city.voices = voices;
  window.__city.audio = audioSystem;
  const missionSystem = IS_MELBOURNE ? (await import('./missions.js')).createMissionSystem({ scene, controllerManager, mapSystem, cameraSystem, voices, cast: castSystem, stkilda }) : null;
  // The wanted level and the police (js/wanted.js)
  const wanted = IS_MELBOURNE ? (await import('./wanted.js')).createWanted({ scene, controllerManager, trafficSystem, voices, missionSystem, audioSystem }) : null;
  window.__city.wanted = wanted;
  // Taking cars, guns and talking to people (js/gameplay.js)
  gameplay = IS_MELBOURNE ? (await import('./gameplay.js')).createGameplay({
    scene, renderer, controllerManager, cameraSystem, trafficSystem, missionSystem, selectMode, voices, cast: castSystem, audioSystem, wanted
  }) : null;
  window.__city.gameplay = gameplay;
  if (missionSystem && gameplay) missionSystem.attach(gameplay, trafficSystem);
  // the Albert Park Grand Prix
  race = IS_MELBOURNE ? (await import('./race.js')).createRace({ scene, controllerManager, missionSystem, teleportTo, selectMode }) : null;
  window.__city.race = race;
  // The opening cut scene (js/intro.js): golden-hour wide shots and the story's set-up
  const intro = IS_MELBOURNE ? (await import('./intro.js')).createIntro({
    cameraSystem, controllerManager, lightingSystem, selectTime, selectMode, missionSystem, teleportTo, voices, gameplay, cast: castSystem
  }) : null;
  window.__city.intro = intro;
  if (intro) {
    const pop = document.getElementById('teleport-popover');
    const b = document.createElement('button');
    b.className = 'pop-item tp-btn';
    b.type = 'button';
    const n = document.createElement('span');
    n.className = 'pop-name';
    n.textContent = 'Watch the intro';
    const sub = document.createElement('span');
    sub.className = 'pop-sub';
    sub.textContent = 'Tonight, and 2004 as he remembers it';
    b.append(n, sub);
    b.addEventListener('click', () => { closePopovers(); intro.play(); });
    pop.prepend(b);
    // your own cars from BeamNG mods (js/car-mods.js): opened in this browser, never uploaded
    const carMods = (await import('./car-mods.js')).createCarMods({ gameplay, trafficSystem, missionSystem });
    window.__city.carMods = carMods;
    const cm = document.createElement('button');
    cm.className = 'pop-item tp-btn';
    cm.type = 'button';
    const cmn = document.createElement('span');
    cmn.className = 'pop-name';
    cmn.textContent = 'Load a car mod';
    const cms = document.createElement('span');
    cms.className = 'pop-sub';
    cms.textContent = 'A BeamNG .zip from your computer (or drop it on the game)';
    cm.append(cmn, cms);
    cm.addEventListener('click', () => { closePopovers(); carMods.pick(); });
    pop.prepend(cm);
    // and to be rid of them (a mod that draws wrongly would otherwise come back every start)
    const cf = document.createElement('button');
    cf.className = 'pop-item tp-btn';
    cf.type = 'button';
    const cfn = document.createElement('span');
    cfn.className = 'pop-name';
    cfn.textContent = 'Remove my car mods';
    const cfs = document.createElement('span');
    cfs.className = 'pop-sub';
    cfs.textContent = 'Forget the mods kept in this browser (from the next start)';
    cf.append(cfn, cfs);
    cf.addEventListener('click', () => { closePopovers(); carMods.clear(); });
    cm.after(cf);
    // the sports car, brought round beside the player
    const sc = document.createElement('button');
    sc.className = 'pop-item tp-btn';
    sc.type = 'button';
    const sn = document.createElement('span');
    sn.className = 'pop-name';
    sn.textContent = 'Get the sports car';
    const ss = document.createElement('span');
    ss.className = 'pop-sub';
    ss.textContent = 'HSB Clubbie R8 · 280 km/h';
    sc.append(sn, ss);
    sc.addEventListener('click', () => { closePopovers(); gameplay?.summonSports(); });
    b.after(sc);
  }
  if (missionSystem) {
    window.__city.missions = missionSystem;
    const pop = document.getElementById('teleport-popover');
    const title = document.createElement('div');
    title.className = 'pop-title';
    title.textContent = 'Jobs';
    pop.append(title);
    // the Albert Park Grand Prix (js/race.js): a race against five AI cars, any time
    if (race) {
      const rb = document.createElement('button');
      rb.className = 'pop-item tp-btn';
      rb.type = 'button';
      const rn = document.createElement('span');
      rn.className = 'pop-name';
      rn.textContent = 'Race: Albert Park Grand Prix';
      const rs = document.createElement('span');
      rs.className = 'pop-sub';
      rs.textContent = 'Two laps against five cars · $5,000 to win';
      rb.append(rn, rs);
      rb.addEventListener('click', () => { closePopovers(); race.start(); });
      pop.append(rb);
    }
    missionSystem.missions.forEach((m, i) => {
      const b = document.createElement('button');
      b.className = 'pop-item tp-btn';
      b.type = 'button';
      const n = document.createElement('span');
      n.className = 'pop-name';
      n.textContent = `${i + 1}. ${m.name}`;
      const sub = document.createElement('span');
      sub.className = 'pop-sub';
      sub.textContent = `${m.giver} · ${m.crew} · $${m.reward.toLocaleString('en-AU')}`;
      b.append(n, sub);
      b.addEventListener('click', () => {
        // go to the job and start it straight away
        const p = missionSystem.jumpTo(i);
        teleportTo(p.x + 3, p.z + 3, Math.atan2(-3, -3));
        closePopovers();
        missionSystem.startNow(i);
      });
      pop.append(b);
    });
  }

  teleportButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-teleport');
      const loc = TELEPORT_LOCATIONS[key];
      if (loc) {
        teleportTo(loc.x, loc.z, loc.heading);
      }
      closePopovers();
    });
  });

  const openMapBtn = document.getElementById('btn-open-map');
  if (openMapBtn) openMapBtn.addEventListener('click', () => mapSystem.toggleFullMap(true));

  if (hudToggleBtn) {
    hudToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('hud-minimized');
      const isMin = document.body.classList.contains('hud-minimized');
      hudToggleBtn.setAttribute('aria-pressed', String(isMin));
      hudToggleBtn.setAttribute('aria-label', isMin ? 'Show HUD' : 'Hide HUD');
      hudToggleBtn.title = isMin ? 'Show the HUD [H]' : 'Clean view: hide the HUD [H]';
      if (isMin) closePopovers();
    });
  }

  // Global keyboard shortcuts for modes (1-4), cameras (V / 5-0), and HUD (H)
  window.addEventListener('keydown', (e) => {
    if (isTypingInField(e)) return;
    switch (e.code) {
      case 'Digit1':
        selectMode('person');
        break;
      case 'Digit2':
        selectMode('car');
        break;
      case 'Digit3':
        selectMode('cyclist');
        break;
      case 'Digit4':
        selectMode('helicopter');
        break;
      case 'Digit5':
        selectCamera('chase', true);
        break;
      case 'Digit6':
        selectCamera('action', true);
        break;
      case 'Digit7':
        selectCamera('pov', true);
        break;
      case 'Digit8':
        selectCamera('fifthAve', true);
        break;
      case 'Digit9':
        selectCamera('timesSquare', true);
        break;
      case 'Digit0':
        selectCamera('chryslerGCT', true);
        break;
      case 'KeyV':
        cycleCamera(e.shiftKey ? -1 : 1);
        break;
      case 'KeyH':
        if (hudToggleBtn) hudToggleBtn.click();
        break;
      case 'KeyN':
        if (!e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) audioSystem.setEnabled(!audioSystem.enabled);
        break;
      // (B is the horn: js/gameplay.js, held, with js/car-sounds.js)
    }
  });

  window.addEventListener('resize', () => {
    cameraSystem.onResize(window.innerWidth, window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);
    placeModeIndicator();
    if (mapSystem.isFullMapOpen) {
      mapSystem.resizeFullCanvas();
      mapSystem.renderFullMap();
    }
  });

  // Initialize the UI and chase camera around the restored player, or the default taxi on a first visit.
  selectMode(controllerManager.activeMode);
  selectCamera('chase', true);
  selectTime('golden');
  // the web fonts change the buttons' widths once they arrive
  if (document.fonts) document.fonts.ready.then(placeModeIndicator);
  markInit('ui');

  // Compile shaders behind the loading screen. Overlapping compileAsync() jobs keep compilation moving
  // while individual jobs yield to the browser.
  const COMPILE_POOL = 16;
  const nextTask = () => (globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0)));
  async function precompileShaders() {
    await showLoadingStage('Preparing reflections and bloom...', 'postFX');
    // An empty frame first: it sets up the post-processing chain, which configures the scene pass's render target
    // (MSAA samples, depth format), so the pipelines compiled below are the very ones the scene pass asks for
    scene.visible = false;
    renderPipeline.render();
    scene.visible = true;
    markInit('postFX');

    // Every visible object with frustum culling off (like the warm-up frame, see the loop). Plain meshes that share
    // a material share its shader, so one job compiles them in turn (the first build serves the rest); every
    // instanced mesh gets a build of its own unless its chunks share a pipeline
    const culled = [];
    const jobs = [];
    const jobByMaterial = new Map();
    const pipelines = new Set();
    scene.traverseVisible((o) => {
      if (o.frustumCulled) {
        culled.push(o);
        o.frustumCulled = false;
      }
      if (!o.isMesh && !o.isLine && !o.isPoints && !o.isSprite) return;
      // Use the first visible chunk: the original representative may be in an inactive tree cell. Shadow stand-ins
      // only draw in the shadow maps (the warm-up frame compiles those).
      if (o.userData.shadowProxy) return;
      const pipeline = o.userData.sharesPipelineWith || o;
      if (pipelines.has(pipeline)) return;
      pipelines.add(pipeline);
      if (o.isInstancedMesh || Array.isArray(o.material)) {
        jobs.push([o]);
        return;
      }
      let job = jobByMaterial.get(o.material);
      if (!job) {
        job = [];
        jobByMaterial.set(o.material, job);
        jobs.push(job);
      }
      job.push(o);
    });

    await showLoadingStage(`Compiling scene shaders... 0 / ${jobs.length} batches`, 'compile', false);
    renderer.setRenderTarget(compileTarget);
    renderer.setMRT(compileMRT);
    const compile = async (object) => {
      // Each compile starts in a task of its own: compileAsync() keeps one precompilation state on the renderer,
      // which must not be mid-step for two of them in the same microtask checkpoint
      await nextTask();
      try {
        await renderer.compileAsync(object, cameraSystem.camera, scene);
      } catch (e) {
        console.warn('[compile]', e); // the warm-up frame compiles it instead
      }
    };
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        for (const object of job) await compile(object);
        done++;
        if (loadingStatus) loadingStatus.textContent = `Compiling scene shaders... ${done} / ${jobs.length} batches`;
        setStageProgress(done / jobs.length);
      }
    };
    await Promise.all(Array.from({ length: COMPILE_POOL }, worker));
    renderer.setMRT(null);
    renderer.setRenderTarget(null);
    for (const o of culled) o.frustumCulled = true;
  }

  await precompileShaders();
  markInit('compile');
  await showLoadingStage('Preparing shadows and the first frame...', 'warmup');

  // 6. Animation Loop
  let lastTime = performance.now();
  let elapsed = 0;
  let frameCount = 0;
  let fpsTimer = 0;
  let nextPlayerSave = 0;
  let warmedUp = false; // see the first frame below

  if (elFps) elFps.textContent = '60';

  renderer.setAnimationLoop((now) => {
    const rawDt = (now - lastTime) * 0.001;
    lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    elapsed += dt;

    // Update 3rd-person controllers, camera, signals, traffic & vehicle collisions, building LODs, and dynamic shadow focus
    gamepadControls.update(dt);
    // the follow camera's yaw: on foot the movement keys are relative to it (controllers.js)
    if (cameraSystem.initialized) {
      controllerManager.cameraYaw = Math.atan2(cameraSystem.currentLookAt.x - cameraSystem.currentPos.x, cameraSystem.currentLookAt.z - cameraSystem.currentPos.z);
    }
    controllerManager.update(dt, elapsed, cameraSystem.initialized ? cameraSystem.currentPos : null);
    // on foot, nobody walks through a car, a bus or a tram: pushed out of its footprint
    if (IS_MELBOURNE && controllerManager.activeMode === 'person') {
      const pp = controllerManager.entities.person.position;
      const boxes = [];
      for (const v of [...trafficSystem.cars, ...(trafficSystem.buses || [])]) {
        if (v.driven || !(v.edge || v.parked) || Math.abs(v.x - pp.x) > 9 || Math.abs(v.z - pp.z) > 9) continue;
        boxes.push({ x: v.x, z: v.z, yaw: Math.atan2(v.tx, v.tz) + (v.yawOffset || 0), halfL: v.halfL || v.half, halfW: v.halfWidth });
      }
      if (tramSystem) boxes.push(...tramSystem.footprints(pp.x, pp.z, 12));
      // the player's own car where they left it, and the race's cars
      const own = controllerManager.entities.car;
      if (own && own.mesh && own.mesh.visible && Math.abs(own.position.x - pp.x) < 9 && Math.abs(own.position.z - pp.z) < 9) {
        boxes.push({ x: own.position.x, z: own.position.z, yaw: own.heading, halfL: 2.25, halfW: 0.92 });
      }
      if (race) boxes.push(...race.boxes());
      const tail = missionSystem?.pursuerBox?.();
      if (tail) boxes.push(tail);
      if (wanted) boxes.push(...wanted.boxes());
      // a sports car of the player's own, parked
      const sp = gameplay?.sportsBox?.();
      if (sp) boxes.push(sp);
      pushOutOfBoxes(pp, 0.4, boxes);
    }
    if (castSystem && voices) castSystem.setVoiceLevel(voices.level || 0);
    castSystem?.tick(dt);
    castSystem?.posePlayer(dt);
    if (gameplay) gameplay.update(dt);
    cameraSystem.update(dt, elapsed);
    if (intro) intro.apply(dt);
    missionSystem?.applyCamera(dt); // a job's cut scene takes the camera
    streetDetails.signalClock.value = elapsed;
    trafficSystem.update(
      dt,
      elapsed,
      cameraSystem.currentPos,
      controllerManager.getActiveEntity(),
      controllerManager.activeMode,
      cameraSystem.camera
    );
    highwayTraffic.update(dt, cameraSystem.camera, controllerManager.getActiveEntity(), controllerManager.activeMode);
    // trams stop for people, cars and the player on the track ahead
    if (tramSystem) tramSystem.update(dt, () => ({ peds: trafficSystem.peds, cars: trafficSystem.cars, player: controllerManager.getActiveEntity().position }));
    // the traffic slows and stops behind trams in its lane
    if (tramSystem && trafficSystem.setExternals) {
      const f = controllerManager.getActiveEntity().position;
      trafficSystem.setExternals(tramSystem.footprints(f.x, f.z, 500));
    }
    if (!document.hidden && now >= nextPlayerSave) {
      savePlayerState();
      nextPlayerSave = now + 5000;
    }
    cityBlocks.update(cameraSystem.currentPos.x, cameraSystem.currentPos.z);
    if (cityBlocks.updateLights) cityBlocks.updateLights(cameraSystem.camera);
    if (streetDetails.update) streetDetails.update(cameraSystem.camera);
    lightingSystem.update(cameraSystem.currentPos);
    mapSystem.update();
    if (missionSystem) missionSystem.update(dt, elapsed);
    if (wanted) wanted.update(dt);
    race?.update(dt);
    audioSystem.update(dt, elapsed, cameraSystem.camera, lightingSystem.activePresetId === 'midnight');
    voices?.update(dt);
    if (warmedUp) updateSceneCulling(cameraSystem.camera.position); // the warm-up frame draws every chunk
    // Traffic collisions can move the player after controller updates; finalize moving hierarchies here.
    for (const root of dynamicRoots) root.updateMatrixWorld();
    for (const child of scene.children) if (!staticChildren.has(child) && child.visible) child.updateMatrixWorld();

    // Render frame via TSL RenderPipeline (SSR + Bloom)
    if (!warmedUp) {
      // First frame = pipeline warm-up behind the loading screen, for what precompileShaders() can't reach (the shadow
      // map passes): with frustum culling off, every visible material's pipelines compile now instead of stalling the
      // first time the camera turns towards it (one chunk / shadow stand-in per shared pipeline is enough)
      const culled = [];
      const pipelines = new Set();
      scene.traverseVisible((o) => {
        const pipeline = o.userData.sharesPipelineWith || o;
        if (pipelines.has(pipeline)) return;
        pipelines.add(pipeline);
        if (o.frustumCulled) {
          culled.push(o);
          o.frustumCulled = false;
        }
      });
      renderPipeline.render();
      for (const o of culled) o.frustumCulled = true;
      markInit('warmup');
    }
    renderPipeline.render();
    if (!warmedUp) {
      warmedUp = true;
      markInit('firstFrame');
      // The loading screen stays up until the GPU has got through the first frame (and the pipelines its warm-up
      // compiled), i.e. until the city is actually on screen
      const device = renderer.backend.device;
      beginLoadingStage('Waiting for graphics to finish the first frame...', 'gpu');
      Promise.resolve(device && device.queue.onSubmittedWorkDone()).catch(() => {}).then(() => {
        markInit('gpu');
        console.log(`[init] ${initTimings.join(', ')}`);
        initTimings = null;
        setLoadingProgress(1);
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        if (intro) { if (intro.shouldAutoplay) intro.prompt(); else intro.skip(); }
        audioSystem.ready = true;
      });
    }

    // Telemetry uses wall time, not the clamped simulation step, so slow frames and high-refresh displays report
    // their actual frame rate (updates DOM every 250ms).
    frameCount++;
    fpsTimer += Math.max(0, rawDt);
    if (fpsTimer >= 0.25) {
      const currentFps = Math.round(frameCount / fpsTimer);
      frameCount = 0;
      fpsTimer = 0;
      // Dynamic resolution: every 2 s, scale the render down while the frame rate is under 28 and back up over 48
      fpsWindow.push(currentFps);
      if (fpsWindow.length >= 8) {
        const avg = fpsWindow.reduce((t, v) => t + v, 0) / fpsWindow.length;
        fpsWindow.length = 0;
        const next = avg < 28 ? Math.max(Q.minPixelRatio, pixelRatio * 0.85) : avg > 48 ? Math.min(Q.pixelRatio, pixelRatio * 1.1) : pixelRatio;
        if (Math.abs(next - pixelRatio) > 0.01) {
          pixelRatio = next;
          renderer.setPixelRatio(pixelRatio);
        }
      }

      const activeEnt = controllerManager.getActiveEntity();
      const mode = controllerManager.activeMode;
      const mph = Math.round(Math.abs(activeEnt.speed) * 3.6); // km/h
      const altFt = Math.max(0, Math.round(activeEnt.position.y * 3.281));

      if (elFps) {
        elFps.textContent = String(currentFps);
        elFps.className = currentFps >= 50 ? 'fps-ok' : currentFps >= 30 ? 'fps-warn' : 'fps-bad';
      }
      if (elSpeed) elSpeed.textContent = String(mph);
      const topSpeed = mode === 'car' && gameplay && gameplay.topSpeedKmh ? gameplay.topSpeedKmh : topSpeedMph[mode] || 80; // the car's own scale
      if (elSpeedMeter) elSpeedMeter.style.transform = `scaleX(${Math.min(1, mph / topSpeed)})`;
      if (elAltitude) elAltitude.textContent = altFt.toLocaleString('en-US');
      // The street corner of the player on the follow cameras, of the camera itself on the scenic ones
      const where = cameraSystem.getActivePreset().category === 'follow' ? activeEnt.position : cameraSystem.currentPos;
      renderLocation(getLocationLabel(where.x, where.z));
    }
  });
}

initApp();
