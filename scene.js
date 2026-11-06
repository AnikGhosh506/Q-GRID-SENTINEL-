import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let aliceNode, bobNode, eveNode;
let aliceMaterial, bobMaterial, eveMaterial;
let aliceRing, bobRing, eveRing, eveShockwaveRing;
let eveLight;
let directBeamLine, interceptBeamAliceEve, interceptBeamEveBob;
let photonParticles = [];
let isEveAttackingState = false;
let animationFrameId;

export function init3DScene(container) {
  if (!container) return;

  // 1. Scene & Atmospheric Depth
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050811);
  scene.fog = new THREE.FogExp2(0x050811, 0.025);

  // 2. Camera Setup
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 9.5, 18.5);

  // 3. WebGL Renderer Setup
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  container.appendChild(renderer.domElement);

  // 4. Orbit Controls (Drag to rotate, scroll/pinch to zoom)
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.minDistance = 6;
  controls.maxDistance = 36;
  controls.target.set(0, 1.5, -1.5);

  // 5. Three-Point Calibrated Studio & Telemetry Lighting
  const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.55);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0x00f0ff, 1.8);
  keyLight.position.set(12, 22, 14);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x00ff88, 1.4);
  fillLight.position.set(-12, 16, -10);
  scene.add(fillLight);

  // 6. Dual-Resolution Wireframe Floor Grid
  const primaryGrid = new THREE.GridHelper(48, 24, 0x00ff88, 0x0f2942);
  primaryGrid.position.y = 0;
  if (primaryGrid.material instanceof THREE.Material) {
    primaryGrid.material.opacity = 0.35;
    primaryGrid.material.transparent = true;
  }
  scene.add(primaryGrid);

  const subGrid = new THREE.GridHelper(48, 96, 0x00f0ff, 0x091526);
  subGrid.position.y = -0.02;
  if (subGrid.material instanceof THREE.Material) {
    subGrid.material.opacity = 0.16;
    subGrid.material.transparent = true;
  }
  scene.add(subGrid);

  // 7. Create Alice, Bob, and Eve 3D Nodes
  const coreGeo = new THREE.OctahedronGeometry(1.25, 2);
  const eveGeo = new THREE.OctahedronGeometry(1.35, 1);

  // ALICE NODE (Substation Quantum Transmitter - Electric Cyan)
  aliceMaterial = new THREE.MeshStandardMaterial({
    color: 0x00f0ff,
    emissive: 0x00a8ff,
    emissiveIntensity: 0.75,
    roughness: 0.2,
    metalness: 0.85,
  });
  aliceNode = new THREE.Mesh(coreGeo, aliceMaterial);
  aliceNode.position.set(-7.5, 2.2, 1.5);
  scene.add(aliceNode);

  // BOB NODE (Substation Quantum Receiver - Phosphor Neon Green)
  bobMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ff88,
    emissive: 0x00cc66,
    emissiveIntensity: 0.75,
    roughness: 0.2,
    metalness: 0.85,
  });
  bobNode = new THREE.Mesh(coreGeo, bobMaterial);
  bobNode.position.set(7.5, 2.2, 1.5);
  scene.add(bobNode);

  // EVE NODE (Eavesdropper / Man-in-the-Middle Node - Default Muted Gray)
  eveMaterial = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    emissive: 0x1e293b,
    emissiveIntensity: 0.2,
    roughness: 0.45,
    metalness: 0.6,
  });
  eveNode = new THREE.Mesh(eveGeo, eveMaterial);
  eveNode.position.set(0, 2.4, -5.0);
  scene.add(eveNode);

  // Eve Alert Point Light
  eveLight = new THREE.PointLight(0xff0055, 0, 22);
  eveLight.position.copy(eveNode.position);
  scene.add(eveLight);

  // Outer Wireframe Shells & Orbital Telemetry Rings
  const shellGeo = new THREE.IcosahedronGeometry(1.65, 1);
  const aliceShell = new THREE.Mesh(
    shellGeo,
    new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0.32 })
  );
  const bobShell = new THREE.Mesh(
    shellGeo,
    new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.32 })
  );
  const eveShell = new THREE.Mesh(
    shellGeo,
    new THREE.MeshBasicMaterial({ color: 0x64748b, wireframe: true, transparent: true, opacity: 0.25 })
  );
  eveShell.name = 'eveShell';

  aliceNode.add(aliceShell);
  bobNode.add(bobShell);
  eveNode.add(eveShell);

  // Ground Pedestal Rings under Alice, Bob, and Eve
  const ringGeo = new THREE.RingGeometry(1.8, 2.05, 48);
  aliceRing = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.45 })
  );
  aliceRing.rotation.x = Math.PI / 2;
  aliceRing.position.set(aliceNode.position.x, 0.05, aliceNode.position.z);
  scene.add(aliceRing);

  bobRing = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide, transparent: true, opacity: 0.45 })
  );
  bobRing.rotation.x = Math.PI / 2;
  bobRing.position.set(bobNode.position.x, 0.05, bobNode.position.z);
  scene.add(bobRing);

  eveRing = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({ color: 0x64748b, side: THREE.DoubleSide, transparent: true, opacity: 0.3 })
  );
  eveRing.rotation.x = Math.PI / 2;
  eveRing.position.set(eveNode.position.x, 0.05, eveNode.position.z);
  scene.add(eveRing);

  eveShockwaveRing = new THREE.Mesh(
    new THREE.RingGeometry(2.1, 2.4, 48),
    new THREE.MeshBasicMaterial({ color: 0xff0055, side: THREE.DoubleSide, transparent: true, opacity: 0.0 })
  );
  eveShockwaveRing.rotation.x = Math.PI / 2;
  eveShockwaveRing.position.set(eveNode.position.x, 0.08, eveNode.position.z);
  scene.add(eveShockwaveRing);

  // 8. Quantum Transmission Beams
  directBeamLine = createBeam(aliceNode.position, bobNode.position, 0x00ff88, 0.75);
  interceptBeamAliceEve = createBeam(aliceNode.position, eveNode.position, 0x475569, 0.28);
  interceptBeamEveBob = createBeam(eveNode.position, bobNode.position, 0x475569, 0.28);

  // 9. Quantum Photon Stream Particles
  photonParticles = [];
  const photonGeo = new THREE.SphereGeometry(0.18, 12, 12);
  for (let i = 0; i < 14; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const mesh = new THREE.Mesh(photonGeo, mat);
    scene.add(mesh);
    photonParticles.push({
      mesh,
      progress: i / 14,
      speed: 0.32 + (i % 3) * 0.04,
    });
  }

  // 10. Render Loop
  const clock = new THREE.Clock();

  function animate() {
    animationFrameId = requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    // Rotate nodes
    aliceNode.rotation.y = elapsedTime * 0.55;
    bobNode.rotation.y = -elapsedTime * 0.55;
    eveNode.rotation.y = elapsedTime * (isEveAttackingState ? 1.8 : 0.35);

    aliceShell.rotation.x = -elapsedTime * 0.4;
    bobShell.rotation.x = elapsedTime * 0.4;
    eveShell.rotation.z = elapsedTime * (isEveAttackingState ? 1.5 : 0.25);

    // Floating motion
    aliceNode.position.y = 2.2 + Math.sin(elapsedTime * 2.0) * 0.22;
    bobNode.position.y = 2.2 + Math.cos(elapsedTime * 2.0) * 0.22;
    eveNode.position.y = 2.4 + Math.sin(elapsedTime * (isEveAttackingState ? 5.0 : 1.5)) * 0.22;

    // Pulse Eve Shockwave when attacking
    if (isEveAttackingState && eveShockwaveRing) {
      const pulse = (elapsedTime * 1.8) % 1;
      const scale = 1 + pulse * 1.8;
      eveShockwaveRing.scale.set(scale, scale, 1);
      eveShockwaveRing.material.opacity = (1 - pulse) * 0.75;
    }

    // Move photon stream particles along either Alice->Bob (Nominal) or Alice->Eve->Bob (Intercepted)
    photonParticles.forEach((p) => {
      p.progress = (p.progress + 0.0045 * (isEveAttackingState ? 1.45 : 1.0)) % 1;
      if (!isEveAttackingState) {
        p.mesh.position.lerpVectors(aliceNode.position, bobNode.position, p.progress);
        p.mesh.material.color.setHex(0x00ff88);
      } else {
        if (p.progress < 0.5) {
          const t = p.progress * 2;
          p.mesh.position.lerpVectors(aliceNode.position, eveNode.position, t);
        } else {
          const t = (p.progress - 0.5) * 2;
          p.mesh.position.lerpVectors(eveNode.position, bobNode.position, t);
        }
        p.mesh.material.color.setHex(0xff0055);
      }
    });

    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  function handleResize() {
    if (!container || !renderer || !camera) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  window.addEventListener('resize', handleResize);

  return () => {
    window.removeEventListener('resize', handleResize);
    cancelAnimationFrame(animationFrameId);
    if (renderer && renderer.domElement) {
      renderer.dispose();
    }
  };
}

// Instantly turns the Eve node glowing red when isAttacking is true, or muted gray when false
export function triggerEveAlert(isAttacking) {
  isEveAttackingState = Boolean(isAttacking);
  if (!eveNode || !eveMaterial) return;

  const eveShell = eveNode.getObjectByName('eveShell');

  if (isEveAttackingState) {
    eveMaterial.color.setHex(0xff0055);
    eveMaterial.emissive.setHex(0xff0055);
    eveMaterial.emissiveIntensity = 2.8;

    if (eveShell && eveShell.material) {
      eveShell.material.color.setHex(0xff0055);
      eveShell.material.opacity = 0.85;
    }
    if (eveRing && eveRing.material) {
      eveRing.material.color.setHex(0xff0055);
      eveRing.material.opacity = 0.85;
    }
    if (eveLight) {
      eveLight.color.setHex(0xff0055);
      eveLight.intensity = 10.0;
    }
    if (directBeamLine && directBeamLine.material) {
      directBeamLine.material.color.setHex(0x475569);
      directBeamLine.material.opacity = 0.2;
    }
    if (interceptBeamAliceEve && interceptBeamAliceEve.material) {
      interceptBeamAliceEve.material.color.setHex(0xff0055);
      interceptBeamAliceEve.material.opacity = 0.9;
    }
    if (interceptBeamEveBob && interceptBeamEveBob.material) {
      interceptBeamEveBob.material.color.setHex(0xff0055);
      interceptBeamEveBob.material.opacity = 0.9;
    }
  } else {
    eveMaterial.color.setHex(0x64748b);
    eveMaterial.emissive.setHex(0x1e293b);
    eveMaterial.emissiveIntensity = 0.2;

    if (eveShell && eveShell.material) {
      eveShell.material.color.setHex(0x64748b);
      eveShell.material.opacity = 0.25;
    }
    if (eveRing && eveRing.material) {
      eveRing.material.color.setHex(0x64748b);
      eveRing.material.opacity = 0.3;
    }
    if (eveShockwaveRing && eveShockwaveRing.material) {
      eveShockwaveRing.material.opacity = 0.0;
    }
    if (eveLight) {
      eveLight.intensity = 0;
    }
    if (directBeamLine && directBeamLine.material) {
      directBeamLine.material.color.setHex(0x00ff88);
      directBeamLine.material.opacity = 0.75;
    }
    if (interceptBeamAliceEve && interceptBeamAliceEve.material) {
      interceptBeamAliceEve.material.color.setHex(0x475569);
      interceptBeamAliceEve.material.opacity = 0.28;
    }
    if (interceptBeamEveBob && interceptBeamEveBob.material) {
      interceptBeamEveBob.material.color.setHex(0x475569);
      interceptBeamEveBob.material.opacity = 0.28;
    }
  }
}

export function setCameraPreset(preset) {
  if (!camera || !controls) return;
  if (preset === 'top') {
    camera.position.set(0, 22, 2);
    controls.target.set(0, 0, -1.5);
  } else if (preset === 'eve') {
    camera.position.set(0, 5.5, 4.5);
    controls.target.set(0, 2.2, -5.0);
  } else if (preset === 'channel') {
    camera.position.set(0, 4.5, 13.5);
    controls.target.set(0, 2.0, 1.5);
  } else {
    camera.position.set(0, 9.5, 18.5);
    controls.target.set(0, 1.5, -1.5);
  }
  controls.update();
}

if (typeof window !== 'undefined') {
  window.triggerEveAlert = triggerEveAlert;
  window.setCameraPreset = setCameraPreset;
}

function createBeam(startPos, endPos, colorHex, opacity) {
  const points = [startPos, endPos];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineDashedMaterial({
    color: colorHex,
    dashSize: 0.6,
    gapSize: 0.3,
    linewidth: 2,
    transparent: true,
    opacity,
  });
  const line = new THREE.Line(geometry, material);
  line.computeLineDistances();
  scene.add(line);
  return line;
}
