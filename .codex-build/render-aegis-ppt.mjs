import fs from 'node:fs/promises';
import { FileBlob, PresentationFile } from 'file:///C:/Users/neuzb/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const file='C:/Users/neuzb/Downloads/hackthon project/output/AEGIS-C2_Hackathon_Presentation.pptx';
const out='C:/Users/neuzb/Downloads/hackthon project/.codex-build/rendered';
await fs.mkdir(out,{recursive:true});
const p=await PresentationFile.importPptx(await FileBlob.load(file));
for (const [i,slide] of p.slides.items.entries()) { const b=await p.export({slide,format:'png',scale:1}); await fs.writeFile(`${out}/slide-${String(i+1).padStart(2,'0')}.png`,new Uint8Array(await b.arrayBuffer())); }
console.log(`Rendered ${p.slides.items.length} slides`);
