import React, { useRef, useEffect, useState } from 'react';

/**
 * TacticalCanvas - Military HUD Optical Viewfinder
 * Supports:
 * 1. Live Optical Webcam Video Ingestion with Real-Time Pixel Shader Filters (Thermal / NVG)
 * 2. High-Tech Synthetic Military EO/IR HUD Fallback
 */
export default function TacticalCanvas({ cameraMode, zoom, asset, targetLocked, useWebcam = false }) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const [webcamActive, setWebcamActive] = useState(false);

  // Initialize or teardown webcam stream
  useEffect(() => {
    let stream = null;
    if (useWebcam) {
      navigator.mediaDevices?.getUserMedia({ video: { width: 640, height: 480 } })
        .then(s => {
          stream = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            videoRef.current.play();
            setWebcamActive(true);
          }
        })
        .catch(() => {
          setWebcamActive(false);
        });
    } else {
      setWebcamActive(false);
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [useWebcam]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let animationFrameId;
    let time = 0;

    const render = () => {
      time += 0.025;
      const width = canvas.width = canvas.offsetWidth;
      const height = canvas.height = canvas.offsetHeight;
      const cx = width / 2;
      const cy = height / 2;

      // 1. Draw Background: Either real webcam feed with pixel manipulation or synthetic terrain
      if (useWebcam && webcamActive && videoRef.current && videoRef.current.readyState >= 2) {
        // Draw real camera video frame
        ctx.drawImage(videoRef.current, 0, 0, width, height);
        
        // Pixel Shader Processing (Real-time Thermal / NVG manipulation)
        try {
          const frame = ctx.getImageData(0, 0, width, height);
          const data = frame.data;
          const len = data.length;

          if (cameraMode === 'thermal') {
            // Pseudo-FLIR thermal false-color mapping
            for (let i = 0; i < len; i += 4) {
              const luminance = (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
              if (luminance > 160) {
                // High thermal intensity (white-hot)
                data[i] = 255;
                data[i+1] = 255;
                data[i+2] = 255;
              } else if (luminance > 90) {
                // Mid heat signature (red/orange)
                data[i] = 230;
                data[i+1] = 70;
                data[i+2] = 20;
              } else {
                // Cold ambient background (dark purple/black)
                data[i] = luminance * 0.3;
                data[i+1] = luminance * 0.1;
                data[i+2] = luminance * 0.5;
              }
            }
            ctx.putImageData(frame, 0, 0);
          } else if (cameraMode === 'nvg') {
            // Night-Vision Phosphor Green matrix grading
            for (let i = 0; i < len; i += 4) {
              const lum = (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114) * 1.3;
              data[i] = lum * 0.15;
              data[i+1] = Math.min(255, lum * 1.2); // Intense phosphor green
              data[i+2] = lum * 0.25;
            }
            ctx.putImageData(frame, 0, 0);
          }
        } catch (e) {
          // Fallback if cross-origin or buffer access blocked
        }
      } else {
        // Synthetic EO/IR FLIR / NVG view
        if (cameraMode === 'thermal') {
          ctx.fillStyle = '#080a0f';
        } else if (cameraMode === 'nvg') {
          ctx.fillStyle = '#010d05';
        } else {
          ctx.fillStyle = '#06090f';
        }
        ctx.fillRect(0, 0, width, height);

        // Rolling terrain wireframe
        ctx.lineWidth = 1;
        ctx.strokeStyle = cameraMode === 'thermal' 
          ? 'rgba(239, 68, 68, 0.22)' 
          : cameraMode === 'nvg' 
            ? 'rgba(34, 197, 94, 0.22)' 
            : 'rgba(56, 189, 248, 0.2)';

        ctx.beginPath();
        const gridSize = 24 * (zoom / 2);
        const offsetY = (time * 18) % gridSize;
        for (let x = 0; x < width; x += gridSize) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
        }
        for (let y = offsetY; y < height; y += gridSize) {
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
        }
        ctx.stroke();

        // Simulated Thermal Hotspots
        if (cameraMode === 'thermal') {
          const spots = [
            { x: cx - 45 + Math.sin(time) * 12, y: cy - 25, r: 9 },
            { x: cx + 70, y: cy + 35 + Math.cos(time) * 6, r: 14 }
          ];
          spots.forEach(s => {
            const grad = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, s.r * 2);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.35, '#ef4444');
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r * 2, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      }

      // 2. HUD Reticle & Symbology Overlay
      const hudColor = cameraMode === 'nvg' ? '#22c55e' : cameraMode === 'thermal' ? '#f87171' : '#38bdf8';
      ctx.strokeStyle = hudColor;
      ctx.fillStyle = hudColor;
      ctx.lineWidth = 1;

      // Mil-dot Crosshair
      const rSize = 16;
      ctx.beginPath();
      ctx.moveTo(cx - rSize, cy);
      ctx.lineTo(cx - 4, cy);
      ctx.moveTo(cx + 4, cy);
      ctx.lineTo(cx + rSize, cy);
      ctx.moveTo(cx, cy - rSize);
      ctx.lineTo(cx, cy - 4);
      ctx.moveTo(cx, cy + 4);
      ctx.lineTo(cx, cy + rSize);
      for (let o = -70; o <= 70; o += 18) {
        if (o === 0) continue;
        ctx.moveTo(cx + o, cy - 2);
        ctx.lineTo(cx + o, cy + 2);
      }
      ctx.stroke();

      // Artificial Horizon Pitch Bar
      const pitchRoll = Math.sin(time * 0.4) * 3;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((pitchRoll * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(-45, 0);
      ctx.lineTo(-18, 0);
      ctx.moveTo(18, 0);
      ctx.lineTo(45, 0);
      ctx.stroke();
      ctx.restore();

      // Heading Tape (Top)
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(`MAG [${Math.round(asset?.heading || 42)}°]`, cx - 24, 16);
      ctx.beginPath();
      ctx.moveTo(cx - 50, 20);
      ctx.lineTo(cx + 50, 20);
      for (let x = -40; x <= 40; x += 10) {
        ctx.moveTo(cx + x, 20);
        ctx.lineTo(cx + x, x % 20 === 0 ? 25 : 22);
      }
      ctx.stroke();

      // Airspeed & Altitude Tapes
      ctx.fillText(`IAS`, 8, cy - 20);
      ctx.fillText(`${asset?.speed || 46} KTS`, 8, cy - 8);
      ctx.strokeRect(6, cy - 6, 42, 14);

      ctx.fillText(`ALT MSL`, width - 56, cy - 20);
      ctx.fillText(`${asset?.alt || 145} M`, width - 56, cy - 8);
      ctx.strokeRect(width - 58, cy - 6, 52, 14);

      // Target Tracking Gate Bracket (MIL-STD tracking gate)
      if (targetLocked) {
        const tx = cx + Math.sin(time * 1.2) * 26;
        const ty = cy - 18 + Math.cos(time * 1.2) * 14;
        const gateSize = 34;

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        const c = 6;
        ctx.beginPath();
        ctx.moveTo(tx - gateSize/2, ty - gateSize/2 + c);
        ctx.lineTo(tx - gateSize/2, ty - gateSize/2);
        ctx.lineTo(tx - gateSize/2 + c, ty - gateSize/2);

        ctx.moveTo(tx + gateSize/2 - c, ty - gateSize/2);
        ctx.lineTo(tx + gateSize/2, ty - gateSize/2);
        ctx.lineTo(tx + gateSize/2, ty - gateSize/2 + c);

        ctx.moveTo(tx - gateSize/2, ty + gateSize/2 - c);
        ctx.lineTo(tx - gateSize/2, ty + gateSize/2);
        ctx.lineTo(tx - gateSize/2 + c, ty + gateSize/2);

        ctx.moveTo(tx + gateSize/2 - c, ty + gateSize/2);
        ctx.lineTo(tx + gateSize/2, ty + gateSize/2);
        ctx.lineTo(tx + gateSize/2, ty + gateSize/2 - c);
        ctx.stroke();

        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ef4444';
        ctx.fillText('TRK-LOCK // HOSTILE UAV', tx - gateSize/2, ty - gateSize/2 - 4);
        ctx.fillText('RNG: 1,420M // CONF: 98%', tx - gateSize/2, ty + gateSize/2 + 12);
      }

      // Sensor Status Footprint
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillStyle = hudColor;
      ctx.fillText(`STREAM: ${useWebcam && webcamActive ? 'LIVE WEBCAM INPUT' : 'SYNTHETIC EO/IR'} // ZOOM: ${zoom.toFixed(1)}X`, 8, height - 10);
      ctx.fillText(`SENSOR: ${cameraMode.toUpperCase()} // 60 FPS`, width - 128, height - 10);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [cameraMode, zoom, asset, targetLocked, useWebcam, webcamActive]);

  return (
    <div className="w-full h-full relative">
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
