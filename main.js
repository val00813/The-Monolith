import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';


// 1. Basic scene settings
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.02); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);  //透视相机
camera.position.z = 30;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);


// 2. UVA effects
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 2.0, 0.5, 0.1);

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);


// 3. Particles
const particleGeometry = new THREE.BufferGeometry();
const particleCount = 1500;
const posArray = new Float32Array(particleCount * 3);
for(let i=0; i<particleCount * 3; i++){
    posArray[i] = (Math.random() - 0.5) * 8; 
}
particleGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

const particleMaterial = new THREE.PointsMaterial({
    size: 0.15,
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending  //叠加混合：particles superposition produce a brighter light
});

const particles = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particles);


// 4. Walls
const walls = [];
const wallMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x555555, 
    wireframe: true, 
    transparent: true, 
    opacity: 0.4 
});
const wallGeometry = new THREE.PlaneGeometry(500, 500, 40, 40);  //wall dimensions and number of mesh

for(let i=0; i<4; i++) {
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    scene.add(wall);
    walls.push(wall);  //record to wall and store in array
}
walls[0].rotation.x = Math.PI / 2;  
walls[1].rotation.x = -Math.PI / 2; 
walls[2].rotation.y = Math.PI / 2;  
walls[3].rotation.y = -Math.PI / 2; 


// 5. Microphone interaction
let audioContext, analyser, dataArray;
let isSystemActive = false;
let smoothedVolume = 0;

let fatigue = 0; 
const baseDistance = 20;  //initial distance
const minCrushDistance = 7;  //minimum compression distance

let targetWallDistance = baseDistance; 
let currentWallDisplayDistance = baseDistance; //target distance vs real distance: resistance effect

document.addEventListener('click', async () => {
    if(isSystemActive) return; 
    
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = audioContext.createMediaStreamSource(stream);   //request microphone permission
        analyser = audioContext.createAnalyser(); 
        analyser.fftSize = 256;
        source.connect(analyser);
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        isSystemActive = true;
        document.getElementById('intro').style.display = 'none';  //hide text after opening
    } catch (err) {
        alert('Microphone access is required to experience this project!');
        console.error(err);
    }
});


// 6. Animation loop effect ！！
function animate() {
    requestAnimationFrame(animate);

    let volume = 0;
    if(isSystemActive) {
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for(let i = 5; i < dataArray.length; i++) {
            sum += dataArray[i];  //i=5: filter out the first five groups of low-frequency noise
        }  
        let rawVolume = sum / (dataArray.length - 5); 
        
        const noise = 15; 
        if (rawVolume < noise) {
            rawVolume = 0; 
        }  //filter out noise

        smoothedVolume += (rawVolume - smoothedVolume) * 0.1; 
        volume = smoothedVolume;

        fatigue += 0.001;  //wall automatic compression value
    }

    // a. the effect of the wall being pushed
    const outwardForce = volume * 0.2;
    let calculatedTarget = baseDistance - fatigue + outwardForce;
    if (calculatedTarget > baseDistance) calculatedTarget = baseDistance;

    let isCrushed = false;
    if (calculatedTarget < minCrushDistance) {
        calculatedTarget = minCrushDistance; 
        isCrushed = true;
    }

    const wallSmoothingFactor = 0.05; 
    currentWallDisplayDistance += (calculatedTarget - currentWallDisplayDistance) * wallSmoothingFactor;  //add weight to walls

    walls[0].position.y = currentWallDisplayDistance;
    walls[1].position.y = -currentWallDisplayDistance;
    walls[2].position.x = -currentWallDisplayDistance;
    walls[3].position.x = currentWallDisplayDistance;

    // b. the effect of particles
    const compressionRatio = (currentWallDisplayDistance - minCrushDistance) / (baseDistance - minCrushDistance);
    const minScale = 0.3; 
    const maxScale = 1.0; 
    let baseScale = minScale + (maxScale - minScale) * compressionRatio;  //particle scale is compressed by walls
    
    const soundSensitivity = 0.03;  //the higher the value, the wider the explosion
    let expansionOffset = volume * soundSensitivity;
    let finalObjectScale = baseScale + expansionOffset;
    particles.scale.set(finalObjectScale, finalObjectScale, finalObjectScale);  //particles explode when sound is detected

    particles.rotation.y += 0.002;
    particles.rotation.x += 0.001;
    
    if (isSystemActive) {
        if (isCrushed) {
            particleMaterial.opacity = Math.random() * 0.5;
            bloomPass.strength = 1.0 + (expansionOffset * 2.0);   //shining brightly
        } else {
            particleMaterial.opacity = 0.8;
            bloomPass.strength = 1.0 + (expansionOffset * 1.5); 
        }
    }

    composer.render();
}

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    composer.setSize(window.innerWidth, window.innerHeight);
});

animate();