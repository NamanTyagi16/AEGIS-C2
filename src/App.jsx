import React, { useState, useEffect, useRef, useMemo } from 'react';
import { playTacticalSound, speakTactical } from './audio';
import TacticalCanvas from './TacticalCanvas';
import { 
  Shield, AlertTriangle, Radio, Navigation, Crosshair, 
  Battery, Wifi, Cpu, Eye, Video, FileText, Send, 
  MapPin, Compass, Play, Pause, RefreshCw, Zap, Volume2, VolumeX,
  Target, AlertOctagon, CheckCircle2, ChevronRight, Download, Copy,
  Layers, Sliders, ShieldAlert, Disc, ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Maximize2, Activity, Globe, Satellite, Terminal, Lock, Unlock, Database,
  Route, Camera, Flame, Share2, PlusCircle, Trash2, Save, FolderOpen
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// Utility: NATO Military Grid Reference Calculator (Approximation for IMSEC 28.67N, 77.48E)
function toMGRS(lat, lng) {
  const easting = Math.floor((lng - 77.40) * 10000);
  const northing = Math.floor((lat - 28.60) * 10000);
  return `43R FM ${String(Math.abs(easting)).padStart(4, '0')} ${String(Math.abs(northing)).padStart(4, '0')}`;
}

// Utility: Distance calculator in Kilometers (Haversine)
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return (R * c).toFixed(2);
}

// Project a live contact along its declared heading for an operator-friendly track estimate.
function projectTrack(lat, lng, heading, distanceMeters = 1300) {
  const headingRadians = heading * Math.PI / 180;
  const latitudeOffset = (Math.cos(headingRadians) * distanceMeters) / 111320;
  const longitudeOffset = (Math.sin(headingRadians) * distanceMeters) / (111320 * Math.cos(lat * Math.PI / 180));
  return [lat + latitudeOffset, lng + longitudeOffset];
}

// Lightweight vector vehicle models keep the map legible while giving each asset a distinct identity.
const vehicleSvg = (type, accent) => {
  const stroke = accent;
  if (type === 'UGV') return `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="#101722" stroke="${stroke}" stroke-width="2"><rect x="15" y="24" width="34" height="19" rx="4"/><path d="M23 24 27 16h10l4 8M32 16V9" fill="none"/><path d="M12 29v10M52 29v10" fill="none"/><rect x="11" y="28" width="7" height="14" rx="3"/><rect x="46" y="28" width="7" height="14" rx="3"/></g><circle cx="32" cy="10" r="2.5" fill="${stroke}"/></svg>`;
  if (type === 'INTERCEPTOR') return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4 43 28 59 44 38 42 32 59 26 42 5 44 21 28Z" fill="#162334" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/><path d="M32 13v29M20 38h24" stroke="${stroke}" stroke-width="1.3" opacity=".8"/><circle cx="32" cy="25" r="3" fill="${stroke}"/></svg>`;
  if (type === 'HOSTILE') return `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="#2a1115" stroke="${stroke}" stroke-width="2"><path d="M32 22v20M18 18l10 10M46 18 36 28M18 46l10-10M46 46 36 36" fill="none"/><circle cx="16" cy="16" r="6"/><circle cx="48" cy="16" r="6"/><circle cx="16" cy="48" r="6"/><circle cx="48" cy="48" r="6"/><rect x="25" y="25" width="14" height="14" rx="3"/></g><circle cx="32" cy="32" r="3" fill="${stroke}"/></svg>`;
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4 39 27 58 37 55 43 39 39 36 60h-8l-3-21-16 4-3-6 19-10Z" fill="#10222e" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/><path d="M32 13v29M18 37h28" stroke="${stroke}" stroke-width="1.2" opacity=".8"/><circle cx="32" cy="25" r="3" fill="${stroke}"/></svg>`;
};

const createVehicleIcon = ({ designation, type = 'RECON', heading = 0, selected = false, hostile = false, neutralized = false, scrambled = false }) => {
  const accent = neutralized ? '#64748b' : hostile ? '#fb7185' : scrambled ? '#fbbf24' : selected ? '#67e8f9' : '#38bdf8';
  const vehicleType = hostile ? 'HOSTILE' : type;
  return L.divIcon({
    className: 'tactical-vehicle-icon',
    html: `<div class="vehicle-marker ${hostile ? 'is-hostile' : ''} ${selected ? 'is-selected' : ''} ${scrambled ? 'is-intercepting' : ''} ${neutralized ? 'is-neutralized' : ''}" style="--vehicle-accent:${accent}">
      ${!neutralized ? '<span class="vehicle-scan-ring"></span>' : ''}
      <div class="vehicle-model" style="--heading:${heading}deg">${vehicleSvg(vehicleType, accent)}</div>
      <span class="vehicle-label">${designation}</span>
    </div>`,
    iconSize: [62, 76],
    iconAnchor: [31, 31]
  });
};

// Mission Waypoint Icon (Numbered sequence)
const createNumberedWaypointIcon = (index) => {
  return L.divIcon({
    className: 'mil-num-wp-pin',
    html: `
      <div class="relative flex items-center justify-center">
        <div class="w-5 h-5 border-2 border-emerald-400 bg-black text-emerald-300 text-[9px] font-mono font-bold flex items-center justify-center shadow">
          WP${index + 1}
        </div>
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
};

function MapController({ center, focusKey }) {
  const map = useMap();
  const previousFocusKey = useRef(null);
  useEffect(() => {
    if (center && previousFocusKey.current !== focusKey) {
      map.flyTo(center, map.getZoom(), { duration: 1.0 });
      previousFocusKey.current = focusKey;
    }
  }, [center, focusKey, map]);
  return null;
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    }
  });
  return null;
}

const interpolateHeading = (from, to, progress) => {
  const shortestTurn = ((to - from + 540) % 360) - 180;
  return (from + shortestTurn * progress + 360) % 360;
};

// Turns low-frequency telemetry into continuous, frame-by-frame marker motion.
function SmoothVehicleMarker({ vehicle, type, selected = false, hostile = false, neutralized = false, scrambled = false, onClick, children }) {
  const [initialPosition] = useState(() => ({
    lat: vehicle.lat,
    lng: vehicle.lng,
    heading: vehicle.heading ?? 45
  }));
  const currentPosition = useRef(initialPosition);
  const markerRef = useRef(null);
  const markerIcon = useMemo(() => createVehicleIcon({
    designation: vehicle.name || vehicle.id,
    type,
    heading: 0,
    selected,
    hostile,
    neutralized,
    scrambled
  }), [vehicle.id, vehicle.name, type, selected, hostile, neutralized, scrambled]);

  useEffect(() => {
    const startPosition = currentPosition.current;
    const targetPosition = { lat: vehicle.lat, lng: vehicle.lng, heading: vehicle.heading ?? startPosition.heading };
    const startTime = performance.now();
    const duration = 1260;
    let frame;

    const animate = (now) => {
      const rawProgress = Math.min((now - startTime) / duration, 1);
      // Smoothstep keeps arrival and departure calm rather than robotic.
      const progress = rawProgress * rawProgress * (3 - 2 * rawProgress);
      const nextPosition = {
        lat: startPosition.lat + (targetPosition.lat - startPosition.lat) * progress,
        lng: startPosition.lng + (targetPosition.lng - startPosition.lng) * progress,
        heading: interpolateHeading(startPosition.heading, targetPosition.heading, progress)
      };
      currentPosition.current = nextPosition;
      const marker = markerRef.current;
      if (marker) {
        marker.setLatLng([nextPosition.lat, nextPosition.lng]);
        const model = marker.getElement()?.querySelector('.vehicle-model');
        if (model) model.style.transform = `rotate(${nextPosition.heading}deg)`;
      }
      if (rawProgress < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [vehicle.lat, vehicle.lng, vehicle.heading]);

  return (
    <Marker
      ref={markerRef}
      position={[initialPosition.lat, initialPosition.lng]}
      icon={markerIcon}
      eventHandlers={onClick ? { click: onClick } : undefined}
    >
      {children}
    </Marker>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedAsset, setSelectedAsset] = useState('UAV-01');
  const [isSimulating, setIsSimulating] = useState(true);
  const [audioMuted, setAudioMuted] = useState(false);
  const [mapLayer, setMapLayer] = useState('satellite'); // 'satellite' or 'tactical'
  const [geofenceRadius, setGeofenceRadius] = useState(1600); // meters
  const [screenAlertFlash, setScreenAlertFlash] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Optical Feed Controls
  const [cameraMode, setCameraMode] = useState('thermal'); // 'thermal', 'nvg', 'optical'
  const [cameraZoom, setCameraZoom] = useState(2.8);
  const [useWebcam, setUseWebcam] = useState(false);

  // 1. MULTI-WAYPOINT MISSION FLIGHT PLANNER STATE
  const [plannerMode, setPlannerMode] = useState('OFF'); // 'OFF', 'RECORDING', 'EXECUTING'
  const [missionWaypoints, setMissionWaypoints] = useState([]);
  const [currentLegIndex, setCurrentLegIndex] = useState(0);
  const [missionName, setMissionName] = useState('PATROL ALPHA');
  const [savedMissions, setSavedMissions] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('aegis-saved-missions') || '[]');
    } catch {
      return [];
    }
  });
  const [showPredictions, setShowPredictions] = useState(true);

  // 2. INTERACTIVE EW (ELECTRONIC WARFARE) CONSOLE STATE
  const [ewBand, setEwBand] = useState('2.4_GHZ'); // '2.4_GHZ', '5.8_GHZ', 'GNSS_L1'
  const [ewMode, setEwMode] = useState('BARRAGE'); // 'SPOT', 'BARRAGE'
  const [ewPower, setEwPower] = useState(45); // Watts (10 - 100)
  const [isJammingActive, setIsJammingActive] = useState(false);

  // 3. THREAT SPAWN MODE (Judge's Challenge)
  const [spawnThreatMode, setSpawnThreatMode] = useState(false);

  // 4. TELEMETRY HISTORY FOR REAL CSV EXPORT
  const [telemetryHistory, setTelemetryHistory] = useState([]);

  // SITREP State
  const [sitrepLoading, setSitrepLoading] = useState(false);
  const [sitrepText, setSitrepText] = useState('');

  // IMSEC Ghaziabad Defense Anchor
  const BASE_COORDS = [28.6722, 77.4890];

  // Military Fleet Roster
  const [assets, setAssets] = useState([
    {
      id: 'UAV-01',
      name: 'GARUDA-01',
      callsign: 'VIPER-LEAD',
      natoRole: 'UAV-RECON',
      lat: 28.6722,
      lng: 77.4890,
      alt: 145,
      speed: 46.4,
      heading: 42,
      battery: 84.2,
      rssi: -72,
      snr: 29.4,
      ber: '1.2e-7',
      status: 'AIRBORNE // AUTONOMOUS PATROL',
      payload: 'EO/IR FLIR POD & 3D LIDAR',
      isScrambled: false,
      path: [
        [28.6700, 77.4850],
        [28.6710, 77.4870],
        [28.6722, 77.4890]
      ]
    },
    {
      id: 'UAV-02',
      name: 'VAJRA-02',
      callsign: 'HUNTER-LEAD',
      natoRole: 'C-UAS INTERCEPTOR',
      lat: 28.6810,
      lng: 77.4950,
      alt: 230,
      speed: 78.0,
      heading: 118,
      battery: 74.0,
      rssi: -68,
      snr: 32.1,
      ber: '0.8e-7',
      status: 'COMBAT CAP // VECTOR READY',
      payload: 'DIR-RF BARRAGE & NET LAUNCHER',
      isScrambled: false,
      path: [
        [28.6780, 77.4910],
        [28.6810, 77.4950]
      ]
    },
    {
      id: 'UGV-01',
      name: 'ASHOKA-01',
      callsign: 'ANVIL-BASE',
      natoRole: 'UGV-RECON',
      lat: 28.6675,
      lng: 77.4830,
      alt: 4,
      speed: 18.2,
      heading: 270,
      battery: 62.5,
      rssi: -79,
      snr: 22.0,
      ber: '3.4e-6',
      status: 'GROUND PERIMETER PATROL',
      payload: 'CBRN SENSORS & ACOUSTIC MAST',
      isScrambled: false,
      path: [
        [28.6660, 77.4810],
        [28.6675, 77.4830]
      ]
    }
  ]);

  // Detected Threats List
  const [threats, setThreats] = useState([
    {
      id: 'TRK-904',
      type: 'UAV-HOSTILE // CLASS 1 ROTARY',
      lat: 28.6840,
      lng: 77.4990,
      alt: 110,
      speed: 62.4,
      confidence: 98.2,
      rcs: '0.012 M²',
      frequency: '2440.000 MHZ ISM',
      iffStatus: 'MODE 3/A SQUAWK: 7700 [UNKNOWN / NO IFF]',
      classification: 'HOSTILE RECONNAISSANCE',
      status: 'ACTIVE AIRSPACE PENETRATION',
      heading: 135,
      isNeutralized: false
    }
  ]);

  // Real Audit Log with DTG
  const [eventLogs, setEventLogs] = useState([
    { dtg: '260045Z', source: 'C4ISR-NODE', text: 'Doppler frequency lock engaged on Vector 042.', level: 'INFO' },
    { dtg: '260040Z', source: 'EW-SUITE', text: 'Directional RF capacitor bank charged to 100%.', level: 'SUCCESS' },
    { dtg: '260038Z', source: 'RADAR-01', text: 'BREACH DETECTED: Hostile contact TRK-904 entered Northern buffer.', level: 'DANGER' },
    { dtg: '260020Z', source: 'GRID-INIT', text: 'AEGIS C2 Tactical Node online at IMSEC Ghaziabad.', level: 'INFO' }
  ]);

  useEffect(() => {
    localStorage.setItem('aegis-saved-missions', JSON.stringify(savedMissions));
  }, [savedMissions]);

  const currentAsset = assets.find(a => a.id === selectedAsset) || assets[0];
  const activeThreatsCount = threats.filter(t => !t.isNeutralized).length;

  // Real Jamming Radius modeled on Inverse-Square ERP
  const calculatedJammingRadius = Math.round(Math.sqrt(ewPower) * 260);

  // Live Telemetry Simulation Loop & Multi-Waypoint Navigation Execution
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      // Record telemetry history for CSV export (keep last 50 points)
      setTelemetryHistory(prev => [
        ...prev.slice(-49),
        {
          dtg: new Date().toISOString(),
          id: currentAsset.id,
          callsign: currentAsset.callsign,
          nato: currentAsset.natoRole,
          mgrs: toMGRS(currentAsset.lat, currentAsset.lng),
          lat: currentAsset.lat.toFixed(6),
          lng: currentAsset.lng.toFixed(6),
          alt: currentAsset.alt,
          speed: currentAsset.speed,
          battery: currentAsset.battery,
          rssi: currentAsset.rssi,
          snr: currentAsset.snr,
          ber: currentAsset.ber
        }
      ]);

      setAssets(prev => prev.map(asset => {
        let newLat = asset.lat;
        let newLng = asset.lng;
        let newSpeed = asset.speed;
        let newStatus = asset.status;
        let newHeading = asset.heading;

        // 1. Autonomous Dogfight / Interceptor Scramble
        if (asset.id === 'UAV-02' && asset.isScrambled) {
          const targetThreat = threats.find(t => !t.isNeutralized);
          if (targetThreat) {
            const step = 0.0013;
            newSpeed = 138.0;
            const latDiff = targetThreat.lat - asset.lat;
            const lngDiff = targetThreat.lng - asset.lng;
            const distRemaining = Math.hypot(latDiff, lngDiff);

            newHeading = Math.round((Math.atan2(lngDiff, latDiff) * 180 / Math.PI + 360) % 360);

            if (distRemaining < 0.001) {
              newStatus = 'ENGAGING TARGET // DISRUPTING RF';
              handleJamThreat(targetThreat.id);
              asset.isScrambled = false;
            } else {
              newLat = asset.lat + (latDiff / distRemaining) * step;
              newLng = asset.lng + (lngDiff / distRemaining) * step;
              newStatus = `INTERCEPT VECTOR: ${targetThreat.id} // ETA: ${Math.round(distRemaining * 3000)}s`;
            }
          } else {
            asset.isScrambled = false;
            newStatus = 'INTERCEPT TERMINATED // ORBIT';
          }
        }
        // 2. Multi-Waypoint Flight Corridor Execution
        else if (asset.id === selectedAsset && plannerMode === 'EXECUTING' && missionWaypoints.length > 0) {
          const targetWp = missionWaypoints[currentLegIndex];
          if (targetWp) {
            const step = 0.0008;
            const latDiff = targetWp.lat - asset.lat;
            const lngDiff = targetWp.lng - asset.lng;
            const distRemaining = Math.hypot(latDiff, lngDiff);

            newHeading = Math.round((Math.atan2(lngDiff, latDiff) * 180 / Math.PI + 360) % 360);

            if (distRemaining < 0.0008) {
              // Reached this waypoint! Advance to next
              if (currentLegIndex + 1 < missionWaypoints.length) {
                setCurrentLegIndex(i => i + 1);
                setEventLogs(l => [{ dtg: '260052Z', source: asset.name, text: `WP${currentLegIndex + 1} Cleared. Steering to WP${currentLegIndex + 2}.`, level: 'SUCCESS' }, ...l]);
                if (!audioMuted) playTacticalSound('waypoint');
              } else {
                // All waypoints completed!
                setPlannerMode('OFF');
                setCurrentLegIndex(0);
                newStatus = 'FLIGHT PLAN COMPLETE // ON-STATION';
                setEventLogs(l => [{ dtg: '260055Z', source: asset.name, text: 'All flight corridor waypoints executed. Mission accomplished.', level: 'SUCCESS' }, ...l]);
                speakTactical('Flight mission corridor completed.', audioMuted);
              }
            } else {
              newLat = asset.lat + (latDiff / distRemaining) * step;
              newLng = asset.lng + (lngDiff / distRemaining) * step;
              newStatus = `CORRIDOR LEG ${currentLegIndex + 1}/${missionWaypoints.length} (ETA: ${Math.round(distRemaining * 3800)}s)`;
            }
          }
        }
        // 3. Normal Patrol Drift
        else {
          newLat = asset.lat + (Math.random() - 0.49) * 0.00035;
          newLng = asset.lng + (Math.random() - 0.49) * 0.00035;
          newHeading = (asset.heading + Math.floor((Math.random() - 0.5) * 4) + 360) % 360;
        }

        const newAlt = Math.max(15, asset.alt + Math.floor((Math.random() - 0.5) * 2));

        return {
          ...asset,
          lat: newLat,
          lng: newLng,
          alt: newAlt,
          speed: newSpeed,
          heading: newHeading,
          status: newStatus,
          path: [...asset.path.slice(-20), [newLat, newLng]]
        };
      }));

      // Hostile drift
      setThreats(prev => prev.map(t => {
        if (t.isNeutralized) return t;
        const latStep = (Math.random() - 0.52) * 0.00035;
        const lngStep = (Math.random() - 0.52) * 0.00035;
        return {
          ...t,
          lat: t.lat + latStep,
          lng: t.lng + lngStep,
          heading: Math.round((Math.atan2(lngStep, latStep) * 180 / Math.PI + 360) % 360)
        };
      }));

    }, 1400);

    return () => clearInterval(interval);
  }, [isSimulating, plannerMode, missionWaypoints, currentLegIndex, selectedAsset, audioMuted, threats]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleSimulateIncursion();
      } else if (e.key === 'j' || e.key === 'J') {
        const activeT = threats.find(t => !t.isNeutralized);
        if (activeT) handleJamThreat(activeT.id);
      } else if (e.key === 's' || e.key === 'S') {
        handleGenerateSITREP();
      } else if (e.key === 'm' || e.key === 'M') {
        setMapLayer(l => l === 'satellite' ? 'tactical' : 'satellite');
        if (!audioMuted) playTacticalSound('blip');
      } else if (e.key === '1') {
        setSelectedAsset('UAV-01');
      } else if (e.key === '2') {
        setSelectedAsset('UAV-02');
      } else if (e.key === '3') {
        setSelectedAsset('UGV-01');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [threats, audioMuted]);

  // Map Click Handler: Deals with Waypoint Planning OR Judge's Custom Threat Spawn
  const handleMapClick = (latlng) => {
    // A. Judge's Custom Threat Injection Mode
    if (spawnThreatMode) {
      const newThreatId = `TRK-${Math.floor(100 + Math.random() * 900)}`;
      const newThreat = {
        id: newThreatId,
        type: 'UAV-HOSTILE // DETECTED VIA USER DESIGNATION',
        lat: latlng.lat,
        lng: latlng.lng,
        alt: 120,
        speed: 58.0,
        confidence: 99.1,
        rcs: '0.014 M²',
        frequency: `${ewBand === '2.4_GHZ' ? '2440' : '5820'}.000 MHZ`,
        iffStatus: 'MODE 3/A SQUAWK: 7700 [HOSTILE / NO RESPONSE]',
        classification: 'TACTICAL AIR INTRUSION',
        status: 'ACTIVE AIRSPACE PENETRATION',
      heading: 180,
        isNeutralized: false
      };

      setThreats(prev => [newThreat, ...prev]);
      setSpawnThreatMode(false);
      if (!audioMuted) playTacticalSound('alert');
      speakTactical('New hostile contact designated on map.', audioMuted);
      setEventLogs(prev => [
        { dtg: '260058Z', source: 'RADAR-GRID', text: `USER DESIGNATION: Hostile contact ${newThreatId} designated at ${toMGRS(latlng.lat, latlng.lng)}.`, level: 'DANGER' },
        ...prev
      ]);
      return;
    }

    // B. Multi-Waypoint Mission Route Planner Mode
    if (plannerMode === 'RECORDING') {
      const wpNumber = missionWaypoints.length + 1;
      const lastCoord = missionWaypoints.length > 0 ? missionWaypoints[missionWaypoints.length - 1] : currentAsset;
      const legDist = calculateDistanceKm(lastCoord.lat, lastCoord.lng, latlng.lat, latlng.lng);

      setMissionWaypoints(prev => [
        ...prev,
        {
          id: `WP-${wpNumber}`,
          index: prev.length,
          lat: latlng.lat,
          lng: latlng.lng,
          legDist
        }
      ]);

      if (!audioMuted) playTacticalSound('waypoint');
      setEventLogs(prev => [
        { dtg: '260059Z', source: 'MISSION-PLAN', text: `WP${wpNumber} added [MGRS: ${toMGRS(latlng.lat, latlng.lng)}] +${legDist} KM.`, level: 'INFO' },
        ...prev
      ]);
    }
  };

  // Trigger Hostile Drone Incursion with Voice Announcement
  const handleSimulateIncursion = () => {
    if (!audioMuted) playTacticalSound('alert');
    speakTactical('Alert. Airspace breach detected in Sector 2.', audioMuted);
    
    setScreenAlertFlash(true);
    setTimeout(() => setScreenAlertFlash(false), 700);

    const newThreatId = `TRK-${Math.floor(100 + Math.random() * 900)}`;
    const newThreat = {
      id: newThreatId,
      type: 'UAV-HOSTILE // CLASS 1 RECON',
      lat: 28.6750 + (Math.random() - 0.5) * 0.016,
      lng: 77.4950 + (Math.random() - 0.5) * 0.016,
      alt: 95,
      speed: 64.0,
      confidence: 98.4,
      rcs: '0.015 M²',
      frequency: '5820.000 MHZ FPV',
      iffStatus: 'SQUAWK: 7700 [NON-COOPERATIVE]',
      classification: 'HOSTILE RECON PROBE',
      status: 'ACTIVE AIRSPACE PENETRATION',
      heading: 225,
      isNeutralized: false
    };

    setThreats(prev => [newThreat, ...prev]);
    setEventLogs(prev => [
      { dtg: '260100Z', source: 'RADAR-01', text: `RADAR BREACH: ${newThreat.type} [${newThreatId}] penetrated outer buffer.`, level: 'DANGER' },
      ...prev
    ]);
  };

  // Scramble Interceptor
  const handleScrambleInterceptor = () => {
    speakTactical('Interceptor Vajra scrambled. Vectoring to target.', audioMuted);
    if (!audioMuted) playTacticalSound('lock');
    setSelectedAsset('UAV-02');
    setAssets(prev => prev.map(a => a.id === 'UAV-02' ? { ...a, isScrambled: true, status: 'SCRAMBLED // PURSUIT VECTOR' } : a));
    setEventLogs(prev => [
      { dtg: '260101Z', source: 'AIR-OPS', text: 'VAJRA-02 interceptor tasked to target intercept vector.', level: 'DANGER' },
      ...prev
    ]);
  };

  // Real Electronic Warfare Jammer Engagement
  const handleJamThreat = (threatId) => {
    setIsJammingActive(true);
    if (!audioMuted) playTacticalSound('jamming');
    speakTactical(`Electronic counter measures engaged on ${ewBand.replace('_', ' ')}.`, audioMuted);

    setEventLogs(prev => [
      { dtg: '260102Z', source: 'EW-SUITE', text: `Transmitting ${ewPower}W ${ewMode} jamming on ${ewBand} band. Effective radius: ${calculatedJammingRadius}m.`, level: 'DANGER' },
      ...prev
    ]);

    setTimeout(() => {
      setThreats(prev => prev.map(t => {
        if (t.id === threatId) {
          return {
            ...t,
            speed: 0,
            alt: 0,
            confidence: 0,
            status: 'NEUTRALIZED // SIGNAL SEVERED',
            isNeutralized: true
          };
        }
        return t;
      }));
      setIsJammingActive(false);
      speakTactical('Threat neutralized. Airspace secure.', audioMuted);
      setEventLogs(prev => [
        { dtg: '260104Z', source: 'COUNTER-UAS', text: `TARGET HARD KILL: ${threatId} link severed via ${ewBand}. Forced descent.`, level: 'SUCCESS' },
        ...prev
      ]);
      if (!audioMuted) playTacticalSound('blip');
    }, 1800);
  };

  // Dynamic SITREP
  const handleGenerateSITREP = () => {
    setSitrepLoading(true);
    speakTactical('Compiling tactical situation report.', audioMuted);
    setTimeout(() => {
      const activeCount = threats.filter(t => !t.isNeutralized).length;
      const neutCount = threats.filter(t => t.isNeutralized).length;
      const totalMissionDist = missionWaypoints.reduce((acc, wp) => acc + parseFloat(wp.legDist || 0), 0).toFixed(2);
      const report = `================================================================
CLASSIFICATION: SECRET // NOFORN // REL TO IND / AF-C2
DTG (DATE-TIME GROUP): ${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z
ORIGINATING NODE: C4ISR-IMSEC-GHZ-04 (28°40'N 77°29'E)
DEFENSE CONDITION: DEFCON ${activeCount > 0 ? '3 [YELLOW]' : '4 [GREEN]'}
================================================================

1. SITUATION OVERVIEW:
   - SECTOR: IMSEC Ghaziabad Defense Buffer (Radius: ${geofenceRadius}M)
   - EW READINESS: ${ewPower}W ERP ON ${ewBand.replace('_', ' ')} (${ewMode} MODE)
   - EFFECTIVE JAMMING ENVELOPE: ${calculatedJammingRadius} METERS
   - ACTIVE FLIGHT CORRIDOR: ${missionWaypoints.length} WAYPOINTS (TOTAL ${totalMissionDist} KM)
   - NAVIC SATELLITE LOCK: 7 GEOSAT ACTIVE // GDOP 1.1 // DGPS 3D FIX

2. FRIENDLY ASSET DISPOSITION:
   - GARUDA-01 [VIPER-LEAD]: ALT ${assets[0].alt}M | BATT ${assets[0].battery}% | ${assets[0].status}
   - VAJRA-02 [HUNTER-LEAD]: ALT ${assets[1].alt}M | BATT ${assets[1].battery}% | ${assets[1].status}
   - ASHOKA-01 [ANVIL-BASE]: GROUND RECON | PERIMETER MONITORING

3. ENEMY / UNKNOWN TRACKS DETECTED:
   - TOTAL CONTACTS LOGGED: ${threats.length}
   - ACTIVE AIRBORNE THREATS: ${activeCount}
   - NEUTRALIZED VIA EW: ${neutCount}
   ${threats.map(t => `   * [${t.id}] ${t.type} | STATUS: ${t.status} | FREQ: ${t.frequency}`).join('\n')}

4. TACTICAL DIRECTIVE & ROE (RULES OF ENGAGEMENT):
   - AUTHORIZE IMMEDIATE DIRECTIONAL RF SEVERANCE ON CONTACTS PENETRATING ${geofenceRadius}M BUFFER.
   - PRESERVE ENCRYPTED TELEMETRY LOGS FOR POST-MISSION BDA (BATTLE DAMAGE ASSESSMENT).
================================================================`;
      
      setSitrepText(report);
      setSitrepLoading(false);
      setEventLogs(prev => [
        { dtg: '260105Z', source: 'C4ISR-INTEL', text: 'Operational SITREP generated and stored in mission ledger.', level: 'SUCCESS' },
        ...prev
      ]);
    }, 850);
  };

  // Real CSV Telemetry Log File Download
  const handleExportCSV = () => {
    const headers = "Timestamp_UTC,Asset_ID,Callsign,Role,MGRS,Lat,Lng,Alt_M,Speed_KTS,Battery_Pct,RSSI_dBm,SNR_dB,BER\n";
    const rows = telemetryHistory.map(t => 
      `"${t.dtg}","${t.id}","${t.callsign}","${t.nato}","${t.mgrs}",${t.lat},${t.lng},${t.alt},${t.speed},${t.battery},${t.rssi},${t.snr},"${t.ber}"`
    ).join("\n");

    const csvContent = headers + (rows || `"${new Date().toISOString()}","${currentAsset.id}","${currentAsset.callsign}","${currentAsset.natoRole}","${toMGRS(currentAsset.lat, currentAsset.lng)}",${currentAsset.lat},${currentAsset.lng},${currentAsset.alt},${currentAsset.speed},${currentAsset.battery},${currentAsset.rssi},${currentAsset.snr},"${currentAsset.ber}"`);
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `STANAG_TELEMETRY_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSITREP = () => {
    const blob = new Blob([sitrepText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SITREP_AEGIS_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySITREP = () => {
    navigator.clipboard.writeText(sitrepText);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2000);
  };

  const handleSaveMission = () => {
    if (missionWaypoints.length === 0) return;
    const mission = {
      id: `mission-${Date.now()}`,
      name: missionName.trim() || 'UNNAMED PATROL',
      createdAt: new Date().toLocaleString(),
      waypoints: missionWaypoints
    };
    setSavedMissions(prev => [mission, ...prev].slice(0, 8));
    setEventLogs(prev => [
      { dtg: '260106Z', source: 'MISSION-PLAN', text: `${mission.name} saved with ${mission.waypoints.length} waypoints.`, level: 'SUCCESS' },
      ...prev
    ]);
    if (!audioMuted) playTacticalSound('waypoint');
  };

  const handleLoadMission = (mission) => {
    setMissionWaypoints(mission.waypoints);
    setMissionName(mission.name);
    setCurrentLegIndex(0);
    setPlannerMode('OFF');
    setEventLogs(prev => [
      { dtg: '260107Z', source: 'MISSION-PLAN', text: `${mission.name} loaded. Route ready for execution.`, level: 'INFO' },
      ...prev
    ]);
    setActiveTab('missions');
    if (!audioMuted) playTacticalSound('blip');
  };

  const handleDeleteMission = (missionId) => {
    setSavedMissions(prev => prev.filter(mission => mission.id !== missionId));
  };

  return (
    <div className="app-shell flex flex-col h-screen w-screen bg-[#090c12] text-slate-300 overflow-hidden text-xs relative select-none font-mono">
      
      {/* Alert Screen Flash */}
      {screenAlertFlash && (
        <div className="absolute inset-0 z-[9999] pointer-events-none bg-red-600/15 border-2 border-red-500 animate-pulse"></div>
      )}

      {/* 1. TOP MILITARY CLASSIFICATION BANNER */}
      <div className="h-5 bg-[#7f1d1d] text-white text-[10px] font-bold tracking-widest flex items-center justify-between px-3 border-b border-red-950">
        <span>SECRET // REL TO ARMED FORCES C4ISR // NOFORN</span>
        <span className="hidden sm:inline">IMSEC DEFENSE SECTOR // GRID NODE GHZ-04</span>
        <span>DTG: 260048Z OCT 2026</span>
      </div>

      {/* 2. INDUSTRIAL TECHNICAL C2 HEADER */}
      <header className="app-header h-12 border-b border-slate-800 bg-[#0c1017] px-3 flex items-center justify-between z-50">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-black border border-slate-700 flex items-center justify-center text-cyan-400 font-bold">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-100 tracking-wider text-xs">AEGIS-C2</span>
              <span className="px-1 border border-slate-700 bg-black text-[9px] text-slate-400 uppercase">
                STANAG 4586 // C4ISR GRID
              </span>
            </div>
          </div>
        </div>

        {/* Center Real Military Telemetry */}
        <div className="hidden lg:flex items-center gap-5 text-[10px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">POSTURE:</span>
            <span className={`px-1.5 py-0.2 border text-[9px] font-bold ${
              activeThreatsCount > 0 
                ? 'bg-red-950 border-red-500 text-red-300 animate-pulse' 
                : 'bg-emerald-950 border-emerald-500 text-emerald-300'
            }`}>
              DEFCON {activeThreatsCount > 0 ? '3 [INCURSION]' : '4 [NORMAL]'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-slate-500">MGRS:</span>
            <span className="text-slate-200">{toMGRS(currentAsset.lat, currentAsset.lng)}</span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-slate-500">NAVIC:</span>
            <span className="text-emerald-400">7 SV (3D DGPS // GDOP 1.1)</span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-slate-500">COMM LINK:</span>
            <span className="text-slate-200">DDL-256 (AES-GCM TYPE-1)</span>
          </div>
        </div>

        {/* Tactical Controls & Real Tools */}
        <div className="flex items-center gap-1.5">
          {/* Judge's Challenge: Custom Threat Placement Tool */}
          <button 
            onClick={() => {
              setSpawnThreatMode(!spawnThreatMode);
              if (!audioMuted) playTacticalSound('blip');
            }}
            className={`px-2 py-1 text-[9px] font-bold border transition flex items-center gap-1 ${
              spawnThreatMode 
                ? 'bg-red-600 text-white border-white animate-pulse' 
                : 'bg-black border-red-700 text-red-300 hover:bg-red-950'
            }`}
            title="Click on the map to place a hostile contact"
          >
            <PlusCircle className="w-3 h-3" />
            <span>{spawnThreatMode ? 'CLICK MAP TO DROP THREAT' : 'INJECT THREAT'}</span>
          </button>

          {/* Real CSV Telemetry Log Export */}
          <button 
            onClick={handleExportCSV}
            className="px-2 py-1 bg-black hover:bg-slate-900 border border-slate-700 text-slate-300 text-[9px] font-bold flex items-center gap-1"
            title="Export time-series telemetry data as CSV file"
          >
            <Database className="w-3 h-3 text-cyan-400" />
            <span>EXPORT CSV</span>
          </button>

          {/* Map Layer */}
          <div className="flex border border-slate-700 bg-black p-0.5 text-[9px]">
            <button 
              onClick={() => { setMapLayer('satellite'); if (!audioMuted) playTacticalSound('blip'); }}
              className={`px-1.5 py-0.5 ${mapLayer === 'satellite' ? 'bg-slate-700 text-white font-bold' : 'text-slate-400'}`}
            >
              SAT
            </button>
            <button 
              onClick={() => { setMapLayer('tactical'); if (!audioMuted) playTacticalSound('blip'); }}
              className={`px-1.5 py-0.5 ${mapLayer === 'tactical' ? 'bg-slate-700 text-white font-bold' : 'text-slate-400'}`}
            >
              GRID
            </button>
          </div>

          <button 
            onClick={() => setIsSimulating(!isSimulating)}
            className="px-2 py-1 bg-[#151b26] hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] flex items-center gap-1"
          >
            {isSimulating ? <Pause className="w-3 h-3 text-emerald-400" /> : <Play className="w-3 h-3 text-amber-400" />}
            <span>{isSimulating ? 'PAUSE' : 'RUN'}</span>
          </button>

          <button
            onClick={() => setIsFocusMode(!isFocusMode)}
            className={`focus-control p-1 bg-[#151b26] hover:bg-slate-800 border text-slate-400 ${isFocusMode ? 'border-cyan-400 text-cyan-300' : 'border-slate-700'}`}
            title={isFocusMode ? 'Restore workspace panels' : 'Focus on tactical map'}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <button 
            onClick={handleSimulateIncursion}
            className="px-2 py-1 bg-red-950 hover:bg-red-900 border border-red-600 text-red-200 text-[10px] font-bold flex items-center gap-1"
            title="Hotkey: Space"
          >
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <span>BREACH [SPC]</span>
          </button>

          <button 
            onClick={() => setAudioMuted(!audioMuted)}
            className="p-1 bg-[#151b26] hover:bg-slate-800 border border-slate-700 text-slate-400"
            title="Audio & Voice Toggle"
          >
            {audioMuted ? <VolumeX className="w-3.5 h-3.5 text-slate-500" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
          </button>
        </div>
      </header>

      {/* 3. MAIN 3-COLUMN WORKSPACE (INDUSTRIAL DENSITY) */}
      <div className={`app-workspace flex-1 flex overflow-hidden ${isFocusMode ? 'is-focus-mode' : ''}`}>
        
        {/* LEFT COLUMN: ORDER OF BATTLE (ORBAT) + INTERACTIVE EW CONSOLE (320px) */}
        <aside className="app-sidebar app-left-sidebar w-80 border-r border-slate-800 bg-[#0c1017] flex flex-col shrink-0">
          
          <div className="p-2 border-b border-slate-800 bg-[#121722] flex items-center justify-between text-[10px] text-slate-300">
            <span className="font-bold flex items-center gap-1.5">
              <Crosshair className="w-3 h-3 text-cyan-400" /> ORDER OF BATTLE ({assets.length} ASSETS)
            </span>
            <span className="text-slate-500">IFF MODE 3/A</span>
          </div>

          {/* Friendly Assets */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {assets.map((asset, idx) => {
              const isSelected = asset.id === selectedAsset;
              return (
                <div 
                  key={asset.id}
                  onClick={() => {
                    if (!audioMuted) playTacticalSound('blip');
                    setSelectedAsset(asset.id);
                  }}
                  className={`asset-card p-2 border transition cursor-pointer ${
                    isSelected 
                      ? 'bg-[#151c28] border-cyan-500/80' 
                      : 'bg-[#0f141d] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-200 text-xs flex items-center gap-1">
                      <span className="px-1 bg-black border border-slate-700 text-[8px] text-slate-400">{idx + 1}</span>
                      {asset.name}
                    </span>
                    <span className="px-1 border border-slate-700 bg-black text-[8px] text-slate-400">
                      {asset.natoRole}
                    </span>
                  </div>

                  <div className="text-[9px] text-slate-400 mb-1.5">{asset.status}</div>

                  <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-slate-800/80 text-[9px] text-slate-400">
                    <div>ALT: <span className="text-slate-200 font-bold">{asset.alt}m</span></div>
                    <div>VEL: <span className="text-slate-200 font-bold">{asset.speed}kts</span></div>
                    <div>BAT: <span className="text-emerald-400 font-bold">{asset.battery}%</span></div>
                  </div>
                </div>
              );
            })}

            {/* Radar Track List (Hostile Track Files) */}
            <div className="mt-3 pt-2 border-t border-slate-800">
              <div className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>RADAR TRACK FILES ({threats.length})</span>
                <span className="text-[9px] text-slate-500">IFF: ENEMY/UNKNOWN</span>
              </div>

              {threats.map(t => (
                <div key={t.id} className={`p-2 mb-1.5 border ${
                  t.isNeutralized 
                    ? 'bg-black border-slate-800 opacity-60' 
                    : 'bg-[#1c0f12] border-red-800/70'
                }`}>
                  <div className="flex items-center justify-between mb-1 text-[10px]">
                    <span className="font-bold text-red-400 flex items-center gap-1">
                      <AlertOctagon className="w-3 h-3 text-red-500" /> {t.id}
                    </span>
                    <span className="text-[8px] px-1 bg-black border border-slate-700 text-slate-400 font-bold">
                      {t.status}
                    </span>
                  </div>

                  <div className="text-[9px] text-slate-400 mb-1">{t.type}</div>
                  <div className="text-[8px] text-slate-500 grid grid-cols-2 gap-1 mb-1.5">
                    <div>RCS: {t.rcs}</div>
                    <div>FREQ: {t.frequency}</div>
                  </div>

                  {/* Actions */}
                  {!t.isNeutralized && (
                    <div className="grid grid-cols-2 gap-1 pt-1 border-t border-slate-800/60">
                      <button
                        onClick={handleScrambleInterceptor}
                        className="py-1 bg-black hover:bg-slate-900 border border-amber-600/80 text-amber-300 font-bold text-[8px] flex items-center justify-center gap-1"
                      >
                        <Zap className="w-2.5 h-2.5 text-amber-400" /> SCRAMBLE
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleJamThreat(t.id);
                        }}
                        disabled={isJammingActive}
                        className="py-1 bg-red-950 hover:bg-red-900 border border-red-600 text-red-200 font-bold text-[8px] flex items-center justify-center gap-1"
                        title="Hotkey: J"
                      >
                        <Radio className={`w-2.5 h-2.5 ${isJammingActive ? 'animate-spin' : ''}`} />
                        <span>ENGAGE [J]</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* REAL ELECTRONIC WARFARE (EW) COCKPIT RACK */}
            <div className="p-2 bg-black border border-slate-800 space-y-2 mt-2">
              <div className="flex justify-between items-center text-[9px] text-slate-300 font-bold border-b border-slate-800 pb-1">
                <span className="flex items-center gap-1 text-red-400">
                  <Radio className="w-3 h-3" /> RF EW SUITE (JAMMER RACK)
                </span>
                <span className="text-[8px] text-slate-500">STANAG 4609</span>
              </div>

              {/* Band Select */}
              <div className="space-y-1 text-[8px]">
                <div className="text-slate-400">DISRUPTION TARGET BAND:</div>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { id: '2.4_GHZ', label: '2.4G C2' },
                    { id: '5.8_GHZ', label: '5.8G FPV' },
                    { id: 'GNSS_L1', label: 'GNSS L1' }
                  ].map(b => (
                    <button
                      key={b.id}
                      onClick={() => setEwBand(b.id)}
                      className={`py-0.5 border text-center font-bold ${
                        ewBand === b.id 
                          ? 'bg-red-950 border-red-500 text-red-200' 
                          : 'bg-[#121620] border-slate-800 text-slate-400'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode Select */}
              <div className="flex justify-between items-center text-[8px]">
                <span className="text-slate-400">TECHNIQUE:</span>
                <div className="flex gap-1">
                  <button 
                    onClick={() => setEwMode('SPOT')}
                    className={`px-1.5 py-0.5 border ${ewMode === 'SPOT' ? 'bg-cyan-950 border-cyan-500 text-cyan-200' : 'border-slate-800 text-slate-500'}`}
                  >
                    SPOT
                  </button>
                  <button 
                    onClick={() => setEwMode('BARRAGE')}
                    className={`px-1.5 py-0.5 border ${ewMode === 'BARRAGE' ? 'bg-cyan-950 border-cyan-500 text-cyan-200' : 'border-slate-800 text-slate-500'}`}
                  >
                    BARRAGE
                  </button>
                </div>
              </div>

              {/* Power Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[8px] text-slate-400">
                  <span>RF POWER (ERP): <strong className="text-amber-400">{ewPower}W</strong></span>
                  <span>ENVELOPE: <strong className="text-red-400">{calculatedJammingRadius}M</strong></span>
                </div>
                <input 
                  type="range" 
                  min="10" 
                  max="100" 
                  step="5"
                  value={ewPower} 
                  onChange={(e) => setEwPower(Number(e.target.value))}
                  className="w-full h-1 bg-slate-800 appearance-none cursor-pointer accent-red-500"
                />
              </div>
            </div>

            {/* Perimeter Radius */}
            <div className="p-2 bg-black border border-slate-800 space-y-1.5 mt-2">
              <div className="flex justify-between items-center text-[9px] text-slate-400">
                <span>SURVEILLANCE BUFFER</span>
                <span className="text-emerald-400 font-bold">{(geofenceRadius / 1000).toFixed(1)} KM</span>
              </div>
              <input 
                type="range" 
                min="800" 
                max="3500" 
                step="100"
                value={geofenceRadius} 
                onChange={(e) => setGeofenceRadius(Number(e.target.value))}
                className="w-full h-1 bg-slate-800 appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

          </div>

          {/* Asset Deep Telemetry Block */}
          <div className="p-2 border-t border-slate-800 bg-[#0a0d13] space-y-1 text-[9px] text-slate-400">
            <div className="text-slate-200 font-bold flex items-center justify-between mb-1">
              <span>PHYSICAL TELEMETRY</span>
              <span className="text-emerald-400">{currentAsset.name}</span>
            </div>
            <div className="flex justify-between">
              <span>WGS84 LAT/LNG:</span>
              <span className="text-slate-300">{currentAsset.lat.toFixed(5)}, {currentAsset.lng.toFixed(5)}</span>
            </div>
            <div className="flex justify-between">
              <span>MGRS GRID:</span>
              <span className="text-slate-300">{toMGRS(currentAsset.lat, currentAsset.lng)}</span>
            </div>
            <div className="flex justify-between">
              <span>RF LINK MARGIN:</span>
              <span className="text-slate-300">RSSI {currentAsset.rssi} dBm (SNR {currentAsset.snr} dB)</span>
            </div>
            <div className="flex justify-between">
              <span>BIT ERROR RATE:</span>
              <span className="text-slate-300">{currentAsset.ber}</span>
            </div>
          </div>
        </aside>

        {/* CENTER COLUMN: TACTICAL MAP & MULTI-WAYPOINT PLANNER (FLEX-1) */}
        <main className={`app-map flex-1 flex flex-col relative bg-[#090c12] overflow-hidden ${mapLayer === 'satellite' ? 'map-satellite' : 'map-tactical-night'}`}>
          
          {/* Top-Left Status & Route Planning Banner */}
          <div className="map-toolbar absolute top-2 left-2 z-[1000] flex items-center gap-2">
            <div className="bg-black/90 border border-slate-700 px-2.5 py-1 flex items-center gap-2 text-[10px]">
              <span className="w-1.5 h-1.5 bg-emerald-400 animate-ping"></span>
              <span className="text-slate-200 font-bold">GRID: IMSEC-GHAZIABAD</span>
            </div>

            {/* FLIGHT CORRIDOR PLANNER CONTROLS */}
            <div className="bg-black/95 border border-cyan-500/80 px-2 py-0.5 flex items-center gap-2 text-[9px]">
              <span className="text-cyan-300 font-bold flex items-center gap-1">
                <Route className="w-3 h-3 text-cyan-400" /> FLIGHT PLAN:
              </span>

              {plannerMode === 'OFF' ? (
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => {
                      setPlannerMode('RECORDING');
                      setMissionWaypoints([]);
                      if (!audioMuted) playTacticalSound('blip');
                    }}
                    className="px-2 py-0.5 bg-cyan-950 border border-cyan-500 text-cyan-200 font-bold hover:bg-cyan-900"
                  >
                    [+] PLOT WAYPOINTS
                  </button>
                  {missionWaypoints.length > 0 && (
                    <button onClick={() => setActiveTab('missions')} className="px-1.5 py-0.5 border border-slate-700 text-slate-300 hover:text-white" title="Open saved missions">
                      <FolderOpen className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ) : plannerMode === 'RECORDING' ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-400 animate-pulse font-bold">
                    CLICK MAP TO ADD PTS ({missionWaypoints.length})
                  </span>
                  <button 
                    disabled={missionWaypoints.length === 0}
                    onClick={() => {
                      setPlannerMode('EXECUTING');
                      setCurrentLegIndex(0);
                      speakTactical(`Flight corridor mission engaged with ${missionWaypoints.length} waypoints.`, audioMuted);
                    }}
                    className="px-2 py-0.5 bg-emerald-950 border border-emerald-500 text-emerald-200 font-bold disabled:opacity-40"
                  >
                    EXECUTE MISSION
                  </button>
                  <button 
                    onClick={() => {
                      setPlannerMode('OFF');
                      setMissionWaypoints([]);
                    }}
                    className="px-1.5 py-0.5 bg-slate-800 text-slate-400 hover:text-white"
                  >
                    CANCEL
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-400 animate-pulse font-bold">
                    EXECUTING LEG {currentLegIndex + 1}/{missionWaypoints.length}
                  </span>
                  <button 
                    onClick={() => {
                      setPlannerMode('OFF');
                      setMissionWaypoints([]);
                      setCurrentLegIndex(0);
                    }}
                    className="px-1.5 py-0.5 bg-red-950 border border-red-500 text-red-200 font-bold"
                  >
                    ABORT MISSION
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Top-Right Doppler Sweeper */}
          <div className="absolute top-2 right-2 z-[1000] bg-black/90 border border-slate-700 p-1.5 flex items-center gap-2 text-[9px]">
            <div className="relative w-7 h-7 border border-emerald-500/70 bg-emerald-950/30 overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 border-t border-emerald-400 animate-radar"></div>
              <div className="w-1 h-1 bg-emerald-400"></div>
            </div>
            <div>
              <div className="text-emerald-400 font-bold">RADAR 360°</div>
              <div className="text-slate-400">TRACKS: {assets.length + threats.length}</div>
            </div>
          </div>

          <button
            onClick={() => setShowPredictions(!showPredictions)}
            className={`prediction-control absolute right-2 top-14 z-[1000] flex items-center gap-1 border px-2 py-1 text-[9px] font-bold transition ${showPredictions ? 'border-amber-500/80 bg-amber-950/90 text-amber-200' : 'border-slate-700 bg-black/90 text-slate-400'}`}
            title="Toggle projected contact tracks"
          >
            <Activity className="w-3 h-3" />
            PREDICT
          </button>

          {/* Leaflet Map */}
          <div className="flex-1 relative z-0">
            <MapContainer 
              center={BASE_COORDS} 
              zoom={14} 
              scrollWheelZoom={true} 
              className="h-full w-full"
            >
              {mapLayer === 'satellite' ? (
                <TileLayer
                  attribution='&copy; Esri &mdash; High-Resolution Satellite'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />
              ) : (
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                  maxZoom={19}
                />
              )}

              <MapController center={[currentAsset.lat, currentAsset.lng]} focusKey={selectedAsset} />
              <MapClickHandler onMapClick={handleMapClick} />

              {/* Range Rings (1.0 KM, 2.0 KM) */}
              <Circle 
                center={BASE_COORDS} 
                radius={1000} 
                pathOptions={{ color: '#475569', fillColor: 'transparent', weight: 0.8, dashArray: '2, 6' }} 
              />
              <Circle 
                center={BASE_COORDS} 
                radius={2000} 
                pathOptions={{ color: '#475569', fillColor: 'transparent', weight: 0.8, dashArray: '2, 6' }} 
              />

              {/* Dynamic Adjustable Geofence Perimeter */}
              <Circle 
                center={BASE_COORDS} 
                radius={geofenceRadius} 
                pathOptions={{ 
                  color: activeThreatsCount > 0 ? '#ef4444' : '#10b981', 
                  fillColor: activeThreatsCount > 0 ? '#ef4444' : '#10b981', 
                  fillOpacity: 0.05, 
                  weight: 1.2, 
                  dashArray: '4, 6' 
                }} 
              />

              {/* Real Jamming Envelope Circle (Calculated from RF Wattage) */}
              {isJammingActive && (
                <Circle 
                  center={[assets[1].lat, assets[1].lng]} 
                  radius={calculatedJammingRadius} 
                  pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.25, weight: 2 }} 
                />
              )}

              {/* MULTI-WAYPOINT MISSION FLIGHT CORRIDOR (Markers & Connected Polyline) */}
              {missionWaypoints.map((wp, idx) => (
                <Marker 
                  key={wp.id} 
                  position={[wp.lat, wp.lng]} 
                  icon={createNumberedWaypointIcon(idx)}
                />
              ))}

              {missionWaypoints.length > 0 && (
                <Polyline 
                  positions={[
                    [currentAsset.lat, currentAsset.lng],
                    ...missionWaypoints.map(wp => [wp.lat, wp.lng])
                  ]} 
                  pathOptions={{ color: '#10b981', weight: 2, dashArray: '4, 6' }} 
                />
              )}

              {/* Projected hostile paths provide a short-horizon visual cue; they are estimates, not a firing solution. */}
              {showPredictions && threats.filter(threat => !threat.isNeutralized).map(threat => {
                const closestAsset = assets.reduce((closest, asset) => {
                  const candidateDistance = calculateDistanceKm(threat.lat, threat.lng, asset.lat, asset.lng);
                  const closestDistance = calculateDistanceKm(threat.lat, threat.lng, closest.lat, closest.lng);
                  return Number(candidateDistance) < Number(closestDistance) ? asset : closest;
                }, assets[0]);
                const interceptEstimate = [
                  (threat.lat + closestAsset.lat) / 2,
                  (threat.lng + closestAsset.lng) / 2
                ];
                const inferredHeading = (Math.atan2(threat.lng - BASE_COORDS[1], threat.lat - BASE_COORDS[0]) * 180 / Math.PI + 360) % 360;
                const predictedPosition = projectTrack(threat.lat, threat.lng, inferredHeading);
                return (
                  <React.Fragment key={`${threat.id}-prediction`}>
                    <Polyline positions={[[threat.lat, threat.lng], predictedPosition]} pathOptions={{ color: '#f59e0b', weight: 1.5, opacity: 0.85, dashArray: '6, 7' }} />
                    <Circle center={predictedPosition} radius={85} pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.12, weight: 1, dashArray: '3, 4' }} />
                    <Polyline positions={[[closestAsset.lat, closestAsset.lng], interceptEstimate]} pathOptions={{ color: '#38bdf8', weight: 1, opacity: 0.5, dashArray: '3, 7' }} />
                    <Circle center={interceptEstimate} radius={55} pathOptions={{ color: '#38bdf8', fillOpacity: 0, weight: 1, dashArray: '2, 4' }} />
                  </React.Fragment>
                );
              })}

              {/* Friendly Assets (MIL-STD-2525 Symbology) */}
              {assets.map(asset => (
                <React.Fragment key={asset.id}>
                  <SmoothVehicleMarker
                    vehicle={asset}
                    type={asset.id === 'UGV-01' ? 'UGV' : asset.id === 'UAV-02' ? 'INTERCEPTOR' : 'RECON'}
                    selected={asset.id === selectedAsset}
                    scrambled={asset.id === 'UAV-02' && asset.isScrambled}
                    onClick={() => {
                      if (!audioMuted) playTacticalSound('blip');
                      setSelectedAsset(asset.id);
                    }}
                  >
                    <Popup>
                      <div className="font-mono text-[10px] space-y-1">
                        <strong className="text-cyan-400">{asset.name} // {asset.callsign}</strong><br />
                        <span>MGRS: {toMGRS(asset.lat, asset.lng)}</span><br />
                        <span>ALT: {asset.alt}M | VEL: {asset.speed} KTS</span><br />
                        <span>PAYLOAD: {asset.payload}</span>
                      </div>
                    </Popup>
                  </SmoothVehicleMarker>
                  <Polyline 
                    positions={asset.path} 
                    pathOptions={{ color: asset.id === 'UAV-02' && asset.isScrambled ? '#f59e0b' : '#38bdf8', weight: 1.5, opacity: 0.6, dashArray: '2, 4' }} 
                  />
                </React.Fragment>
              ))}

              {/* Hostile Threat Markers (MIL-STD-2525 Red Diamonds) */}
              {threats.map(threat => (
                <SmoothVehicleMarker
                  key={threat.id}
                  vehicle={threat}
                  type="HOSTILE"
                  hostile
                  neutralized={threat.isNeutralized}
                >
                  <Popup>
                    <div className="font-mono text-[10px] space-y-1">
                      <strong className={threat.isNeutralized ? 'text-slate-400' : 'text-red-400'}>
                        {threat.isNeutralized ? 'NEUTRALIZED' : '⚠️ ' + threat.type}
                      </strong><br />
                      <span>RCS: {threat.rcs} | FREQ: {threat.frequency}</span><br />
                      <span>IFF: {threat.iffStatus}</span>
                    </div>
                  </Popup>
                </SmoothVehicleMarker>
              ))}
            </MapContainer>
          </div>

          {/* Bottom Coordinates & Scale Bar */}
          <div className="h-7 bg-[#0c1017] border-t border-slate-800 px-3 flex items-center justify-between text-[9px] text-slate-400">
            <div className="flex items-center gap-4">
              <span>TRACKED: <strong className="text-cyan-400">{currentAsset.name}</strong></span>
              <span>LAT/LON: {currentAsset.lat.toFixed(5)}°N, {currentAsset.lng.toFixed(5)}°E</span>
              <span>ALT: {currentAsset.alt}M MSL</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-emerald-400"></span>
              <span>HOTKEYS: [SPC] BREACH | [J] ENGAGE | [S] SITREP | [1-3] SELECT</span>
            </div>
          </div>
        </main>

        {/* RIGHT COLUMN: REAL WEBCAM/SYNTHETIC CANVAS & SITREP (380px) */}
        <aside className="app-sidebar app-right-sidebar w-96 border-l border-slate-800 bg-[#0c1017] flex flex-col shrink-0">
          
          {/* Sub-header Tabs */}
          <div className="h-9 border-b border-slate-800 flex items-center bg-[#10141e] text-[10px]">
            <button 
              onClick={() => { setActiveTab('overview'); if (!audioMuted) playTacticalSound('blip'); }}
              className={`flex-1 h-full font-bold flex items-center justify-center gap-1.5 transition ${
                activeTab === 'overview' 
                  ? 'border-b-2 border-cyan-400 text-white bg-slate-900/80' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Video className="w-3 h-3 text-cyan-400" /> OPTICAL SENSORS
            </button>
            <button 
              onClick={() => { setActiveTab('sitrep'); if (!audioMuted) playTacticalSound('blip'); }}
              className={`flex-1 h-full font-bold flex items-center justify-center gap-1.5 transition ${
                activeTab === 'sitrep' 
                  ? 'border-b-2 border-cyan-400 text-white bg-slate-900/80' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3 h-3 text-cyan-400" /> MISSION SITREP
            </button>
            <button
              onClick={() => { setActiveTab('missions'); if (!audioMuted) playTacticalSound('blip'); }}
              className={`flex-1 h-full font-bold flex items-center justify-center gap-1.5 transition ${
                activeTab === 'missions'
                  ? 'border-b-2 border-cyan-400 text-white bg-slate-900/80'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3 h-3 text-cyan-400" /> ACTIVITY
            </button>
          </div>

          {/* TAB 1: OPTICAL VIEW & REAL AUDIT LOG */}
          {activeTab === 'overview' && (
            <div className="panel-enter flex-1 flex flex-col overflow-hidden p-2 space-y-2">
              
              {/* Tactical Viewfinder Canvas (Supports Real Webcam + Synthetic Fallback) */}
              <div className="relative h-56 w-full border border-slate-700 bg-black">
                <TacticalCanvas 
                  cameraMode={cameraMode} 
                  zoom={cameraZoom} 
                  asset={currentAsset} 
                  targetLocked={activeThreatsCount > 0} 
                  useWebcam={useWebcam}
                />

                {/* Sensor Mode Switchers */}
                <div className="absolute bottom-2 left-2 flex gap-1 z-10">
                  {['thermal', 'nvg', 'optical'].map(m => (
                    <button
                      key={m}
                      onClick={() => { setCameraMode(m); if (!audioMuted) playTacticalSound('blip'); }}
                      className={`px-1.5 py-0.5 text-[8px] font-bold uppercase border ${
                        cameraMode === m 
                          ? 'bg-black border-cyan-400 text-cyan-300' 
                          : 'bg-black/60 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                {/* Live Webcam Toggle Button */}
                <button
                  onClick={() => setUseWebcam(!useWebcam)}
                  className={`absolute bottom-2 right-2 px-1.5 py-0.5 text-[8px] font-bold uppercase border z-10 flex items-center gap-1 ${
                    useWebcam 
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-300' 
                      : 'bg-black/70 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                  title="Toggle Real Laptop Webcam / Video Feed with Shader Processing"
                >
                  <Camera className="w-2.5 h-2.5" />
                  <span>{useWebcam ? 'WEBCAM ON' : 'ENABLE WEBCAM'}</span>
                </button>
              </div>

              {/* Military Audit Event Log with DTG */}
              <div className="flex-1 flex flex-col overflow-hidden border border-slate-800 bg-black">
                <div className="p-1.5 border-b border-slate-800 bg-[#121620] text-[9px] font-bold text-slate-300 flex items-center justify-between">
                  <span>AUDIT EVENT LEDGER (DTG ORDER)</span>
                  <span className="w-1.5 h-1.5 bg-emerald-400"></span>
                </div>
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1 text-[9px]">
                  {eventLogs.map((log, idx) => (
                    <div key={idx} className="pb-1 border-b border-slate-900 leading-tight">
                      <span className="text-slate-500 mr-1">[{log.dtg}]</span>
                      <span className={`font-bold mr-1 ${
                        log.level === 'DANGER' ? 'text-red-400' :
                        log.level === 'WARNING' ? 'text-amber-400' :
                        log.level === 'SUCCESS' ? 'text-emerald-400' : 'text-cyan-400'
                      }`}>
                        {log.source}:
                      </span>
                      <span className="text-slate-300">{log.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <button 
                onClick={handleGenerateSITREP}
                disabled={sitrepLoading}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 font-bold text-[10px] tracking-wider transition flex items-center justify-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                <span>{sitrepLoading ? 'COMPILING SITREP...' : 'GENERATE MISSION SITREP'}</span>
              </button>
            </div>
          )}

          {/* TAB 2: SITREP EXPORT */}
          {activeTab === 'sitrep' && (
            <div className="panel-enter flex-1 flex flex-col p-2 space-y-2 overflow-hidden">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-bold text-slate-200">MILITARY SITUATION REPORT</span>
                <button 
                  onClick={handleGenerateSITREP}
                  disabled={sitrepLoading}
                  className="px-1.5 py-0.5 bg-black border border-slate-700 text-slate-300 text-[9px]"
                >
                  RECOMPILE
                </button>
              </div>

              <div className="flex-1 p-2 bg-black border border-slate-800 text-[9px] text-slate-300 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {sitrepText ? sitrepText : 'Click below to compile operational SITREP.'}
              </div>

              {sitrepText && (
                <div className="grid grid-cols-2 gap-1.5">
                  <button 
                    onClick={handleCopySITREP}
                    className="py-1.5 bg-[#151c28] hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-[9px] flex items-center justify-center gap-1"
                  >
                    <Copy className="w-3 h-3 text-cyan-400" />
                    <span>{copiedToast ? 'COPIED' : 'COPY'}</span>
                  </button>
                  <button 
                    onClick={handleDownloadSITREP}
                    className="py-1.5 bg-black hover:bg-slate-900 border border-emerald-500 text-emerald-300 font-bold text-[9px] flex items-center justify-center gap-1"
                  >
                    <Download className="w-3 h-3 text-emerald-400" />
                    <span>SAVE .TXT</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MISSION LIBRARY & OPERATIONAL TIMELINE */}
          {activeTab === 'missions' && (
            <div className="panel-enter flex-1 flex flex-col p-2 space-y-2 overflow-hidden">
              <div className="border border-slate-800 bg-black p-2 space-y-2">
                <div className="flex items-center justify-between text-[9px] font-bold text-slate-200">
                  <span className="flex items-center gap-1"><FolderOpen className="w-3 h-3 text-cyan-400" /> MISSION LIBRARY</span>
                  <span className="text-slate-500">{savedMissions.length}/8 SAVED</span>
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={missionName}
                    onChange={(event) => setMissionName(event.target.value.toUpperCase())}
                    maxLength={28}
                    className="min-w-0 flex-1 border border-slate-700 bg-[#101722] px-2 py-1 text-[9px] text-slate-100 placeholder:text-slate-600"
                    placeholder="MISSION NAME"
                    aria-label="Mission name"
                  />
                  <button
                    onClick={handleSaveMission}
                    disabled={missionWaypoints.length === 0}
                    className="flex items-center gap-1 border border-emerald-600 bg-emerald-950/40 px-2 py-1 text-[9px] font-bold text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Save className="w-3 h-3" /> SAVE
                  </button>
                </div>
                <div className="text-[8px] text-slate-500">CURRENT ROUTE: {missionWaypoints.length} WAYPOINTS {plannerMode === 'EXECUTING' ? `· LEG ${currentLegIndex + 1}` : ''}</div>
              </div>

              <div className="max-h-36 overflow-y-auto border border-slate-800 bg-black">
                {savedMissions.length > 0 ? savedMissions.map(mission => (
                  <div key={mission.id} className="flex items-center gap-2 border-b border-slate-900 p-2 last:border-0">
                    <button onClick={() => handleLoadMission(mission)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-[9px] font-bold text-cyan-300">{mission.name}</div>
                      <div className="text-[8px] text-slate-500">{mission.waypoints.length} WPTS · {mission.createdAt}</div>
                    </button>
                    <button onClick={() => handleDeleteMission(mission.id)} className="p-1 text-slate-500 hover:text-red-300" title={`Delete ${mission.name}`} aria-label={`Delete ${mission.name}`}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )) : (
                  <div className="p-3 text-center text-[9px] text-slate-500">Save a plotted waypoint route to build your mission library.</div>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col border border-slate-800 bg-black">
                <div className="flex items-center justify-between border-b border-slate-800 bg-[#121620] px-2 py-1.5 text-[9px] font-bold text-slate-300">
                  <span className="flex items-center gap-1"><Activity className="w-3 h-3 text-cyan-400" /> OPERATIONAL TIMELINE</span>
                  <span className="text-slate-500">LIVE</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  {eventLogs.map((log, index) => (
                    <div key={`${log.dtg}-${index}`} className="timeline-event relative border-l border-slate-800 py-1 pl-3 text-[9px] leading-relaxed">
                      <span className={`timeline-dot absolute -left-[3px] top-2 h-1.5 w-1.5 rounded-full ${log.level === 'DANGER' ? 'bg-red-400' : log.level === 'SUCCESS' ? 'bg-emerald-400' : 'bg-cyan-400'}`} />
                      <span className="mr-1 text-slate-500">{log.dtg}</span>
                      <span className={log.level === 'DANGER' ? 'text-red-300' : log.level === 'SUCCESS' ? 'text-emerald-300' : 'text-cyan-300'}>{log.source}</span>
                      <span className="text-slate-300"> · {log.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </aside>

      </div>

      {/* 4. BOTTOM CLASSIFICATION BANNER */}
      <div className="h-5 bg-[#7f1d1d] text-white text-[9px] font-bold tracking-widest flex items-center justify-between px-3 border-t border-red-950">
        <span>AUTHENTICATION: TYPE-1 KEK // MIL-STD-2525D COMPLIANT</span>
        <span>SECURITY INTEGRITY: VERIFIED // NO COMPROMISE</span>
      </div>

    </div>
  );
}
