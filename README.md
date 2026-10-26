# 🛡️ AEGIS-C2 // Unified Battlefield Management & Drone Recon Center
> **Official Submission for FALLING SUN 2026 × IMSEC GHAZIABAD**  
> **Track:** Web Development (Track 02)  
> **Themes Targeted:**  
> - **Theme 13:** Battlefield Management & Tactical Coordination  
> - **Theme 07:** Surveillance, Reconnaissance & Threat Detection  
> - **Theme 12:** AI-Powered Defence Intelligence & Decision Support  
> - **Theme 16:** Unmanned Aerial Systems & Counter-Drone Technology  

---

## ⚡ What Makes AEGIS-C2 The Best-In-Class Defense Web Grid?

1. **Multi-Waypoint Flight Corridor Planner (STANAG 4586):** Click `[+] PLOT WAYPOINTS` on top of the map to plot sequential waypoints (`WP1 -> WP2 -> WP3`), draw flight paths, and execute sequential autonomous waypoint missions.
2. **Interactive Electronic Warfare (EW) Tuning Console:** Select RF Target Band (`2.4 GHz ISM`, `5.8 GHz FPV`, `GNSS L1`), choose technique (`Spot` vs `Barrage`), and dial Effective Radiated Power (10W - 100W) which dynamically calculates jamming envelope radius in meters.
3. **Live Camera & Shader Processing:** Toggle `ENABLE WEBCAM` in Optical Sensors to ingest real live camera video and run real-time pixel shader filters (`Thermal False-Color`, `NVG Phosphor Green`) directly on camera frames!
4. **Real Time-Series Telemetry Export (CSV):** Click `EXPORT CSV` to download real STANAG-compliant flight logs (`Timestamp, Lat, Lng, Alt, Speed, Battery, RSSI, SNR, BER`).
5. **Interactive Threat Injection (Judge's Challenge):** Click `INJECT THREAT` and click anywhere on the map to drop a hostile radar contact, calculate its MGRS grid, and engage intercept vectors!
6. **Clean High-Res Geospatial Satellite Recon:** Real Esri World Imagery satellite map (centered on IMSEC Ghaziabad sector) with zero API keys and zero watermarks.
7. **Autonomous Dogfight / Interceptor Scramble:** Clicking `SCRAMBLE` vectors `VAJRA-02` at 138 kts to dogfight, chase, and intercept hostile drones in real time.
8. **Tactical Military Voice Synthesizer:** Browser native voice assistant speaks critical combat updates (*"Alert: Airspace breach detected."*, *"Threat neutralized."*).
9. **ISRO NavIC Satellite Constellation Sync:** Real-time satellite health indicators (7 Indian NavIC geo-sats locked, GDOP: 1.1).

---

## 🚀 Quick Start (Local Run)

```bash
cd aegis-tactical
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.
