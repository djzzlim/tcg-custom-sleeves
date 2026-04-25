const fs = require('fs');
const path = require('path');

const width = 400;
const height = 560;
const thickness = 10;

const dir = path.join(__dirname, '../public/frames');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

function wrapSVG(content, id) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <defs>
      <filter id="shadow">
        <feDropShadow dx="0" dy="0" stdDeviation="4" flood-opacity="0.3"/>
      </filter>
      ${id === 'fade' ? `
      <filter id="inner-glow">
        <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="blur"/>
        <feFlood flood-color="black" flood-opacity="0.8"/>
        <feComposite operator="in" in2="blur"/>
        <feComposite operator="arithmetic" k2="-1" k3="1" result="shadowDiff"/>
        <feFlood flood-color="white" flood-opacity="1"/>
        <feComposite operator="in" in2="SourceAlpha"/>
        <feComposite operator="arithmetic" k2="1" k3="1" in2="shadowDiff"/>
      </filter>
      ` : ''}
    </defs>
    ${content}
  </svg>`;
}

function makePath(d, id) {
  return wrapSVG(`<path d="${d}" fill="white" fill-rule="evenodd" ${id === 'fade' ? 'filter="url(#inner-glow)"' : 'filter="url(#shadow)"'} />`, id);
}

// 1. Standard
const standardPath = `M0,0 H${width} V${height} H0 Z M${thickness},${thickness} V${height-thickness} H${width-thickness} V${thickness} Z`;
fs.writeFileSync(path.join(dir, '01.svg'), standardPath.replace('M0,0', wrapSVG(`<path d="${standardPath}" fill="white"/>`, 'standard'))); // Standard has no shadow usually, or wait, let's use the helper.
fs.writeFileSync(path.join(dir, '01.svg'), wrapSVG(`<path d="${standardPath}" fill="white"/>`, 'standard'));

// 2. Fade (Standard with shadow)
const fadeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8"/>
    </filter>
  </defs>
  <!-- Blurred inner white glow fading inwards -->
  <rect x="${thickness}" y="${thickness}" width="${width - 2*thickness}" height="${height - 2*thickness}" fill="none" stroke="white" stroke-width="12" filter="url(#blur)" opacity="0.8" />
  <!-- Solid white border on top -->
  <path d="${standardPath}" fill="white" fill-rule="evenodd" />
</svg>`;
fs.writeFileSync(path.join(dir, '02.svg'), fadeSvg);

// Helper for complex outer+inner boundaries
function generateOuterAndInner(innerGenerator) {
  let outer = `M0,0 H${width} V${height} H0 Z`;
  let inner = innerGenerator();
  return `${outer} ${inner}`;
}

// 3. Torn 1
fs.writeFileSync(path.join(dir, '03.svg'), makePath(generateOuterAndInner(() => {
  let d = `M${thickness},${thickness}`;
  for(let x = thickness; x < width - thickness; x+=10) d += ` L${x + Math.random()*5},${thickness + Math.random()*4 - 2}`;
  d += ` L${width-thickness},${thickness}`;
  for(let y = thickness; y < height - thickness; y+=10) d += ` L${width-thickness + Math.random()*4 - 2},${y + Math.random()*5}`;
  d += ` L${width-thickness},${height-thickness}`;
  for(let x = width - thickness; x > thickness; x-=10) d += ` L${x - Math.random()*5},${height-thickness + Math.random()*4 - 2}`;
  d += ` L${thickness},${height-thickness}`;
  for(let y = height - thickness; y > thickness; y-=10) d += ` L${thickness + Math.random()*4 - 2},${y - Math.random()*5}`;
  d += ` Z`;
  return d;
}), 'torn1'));

// 4. Rough (Torn 2)
fs.writeFileSync(path.join(dir, '04.svg'), makePath(generateOuterAndInner(() => {
  let d = `M${thickness},${thickness}`;
  for(let x = thickness; x < width - thickness; x+=5) d += ` L${x},${thickness + Math.random()*6 - 3}`;
  d += ` L${width-thickness},${thickness}`;
  for(let y = thickness; y < height - thickness; y+=5) d += ` L${width-thickness + Math.random()*6 - 3},${y}`;
  d += ` L${width-thickness},${height-thickness}`;
  for(let x = width - thickness; x > thickness; x-=5) d += ` L${x},${height-thickness + Math.random()*6 - 3}`;
  d += ` L${thickness},${height-thickness}`;
  for(let y = height - thickness; y > thickness; y-=5) d += ` L${thickness + Math.random()*6 - 3},${y}`;
  d += ` Z`;
  return d;
}), 'torn2'));

// 5. Wobble
fs.writeFileSync(path.join(dir, '05.svg'), makePath(generateOuterAndInner(() => {
  let d = `M${thickness},${thickness}`;
  for(let x = thickness; x < width - thickness; x+=20) d += ` Q${x+10},${thickness+5} ${x+20},${thickness}`;
  for(let y = thickness; y < height - thickness; y+=20) d += ` Q${width-thickness-5},${y+10} ${width-thickness},${y+20}`;
  for(let x = width - thickness; x > thickness; x-=20) d += ` Q${x-10},${height-thickness-5} ${x-20},${height-thickness}`;
  for(let y = height - thickness; y > thickness; y-=20) d += ` Q${thickness+5},${y-10} ${thickness},${y-20}`;
  return d + ` Z`;
}), 'wobble'));

// 6. Floral (Simple ornate corners)
fs.writeFileSync(path.join(dir, '06.svg'), makePath(generateOuterAndInner(() => {
  return `M${thickness+20},${thickness} 
    H${width-thickness-20} Q${width-thickness},${thickness} ${width-thickness},${thickness+20}
    V${height-thickness-20} Q${width-thickness},${height-thickness} ${width-thickness-20},${height-thickness}
    H${thickness+20} Q${thickness},${height-thickness} ${thickness},${height-thickness-20}
    V${thickness+20} Q${thickness},${thickness} ${thickness+20},${thickness} Z`;
}), 'floral'));

// 7. Leaves (Directional Thorns)
fs.writeFileSync(path.join(dir, '07.svg'), makePath(generateOuterAndInner(() => {
  let d = `M${thickness+10},${thickness}`;
  for(let x = thickness+10; x < width - thickness - 10; x+=20) d += ` C${x+5},${thickness+8} ${x+12},${thickness+8} ${x+18},${thickness+6} Q${x+15},${thickness+2} ${x+20},${thickness}`;
  d += ` A10,10 0 0,1 ${width-thickness},${thickness+10}`;
  for(let y = thickness+10; y < height - thickness - 10; y+=20) d += ` C${width-thickness-8},${y+5} ${width-thickness-8},${y+12} ${width-thickness-6},${y+18} Q${width-thickness-2},${y+15} ${width-thickness},${y+20}`;
  d += ` A10,10 0 0,1 ${width-thickness-10},${height-thickness}`;
  for(let x = width - thickness - 10; x > thickness + 10; x-=20) d += ` C${x-5},${height-thickness-8} ${x-12},${height-thickness-8} ${x-18},${height-thickness-6} Q${x-15},${height-thickness-2} ${x-20},${height-thickness}`;
  d += ` A10,10 0 0,1 ${thickness},${height-thickness-10}`;
  for(let y = height - thickness - 10; y > thickness + 10; y-=20) d += ` C${thickness+8},${y-5} ${thickness+8},${y-12} ${thickness+6},${y-18} Q${thickness+2},${y-15} ${thickness},${y-20}`;
  d += ` A10,10 0 0,1 ${thickness+10},${thickness}`;
  return d + ` Z`;
}), 'leaves'));

// 8. Clouds (Asymmetrical Scallops / Icing)
fs.writeFileSync(path.join(dir, '08.svg'), makePath(generateOuterAndInner(() => {
  let d = `M${thickness+10},${thickness}`;
  for(let x = thickness+10; x < width - thickness - 10; x+=20) d += ` C${x+8},${thickness+14} ${x+18},${thickness+8} ${x+20},${thickness}`;
  d += ` A10,10 0 0,1 ${width-thickness},${thickness+10}`;
  for(let y = thickness+10; y < height - thickness - 10; y+=20) d += ` C${width-thickness-14},${y+8} ${width-thickness-8},${y+18} ${width-thickness},${y+20}`;
  d += ` A10,10 0 0,1 ${width-thickness-10},${height-thickness}`;
  for(let x = width - thickness - 10; x > thickness + 10; x-=20) d += ` C${x-8},${height-thickness-14} ${x-18},${height-thickness-8} ${x-20},${height-thickness}`;
  d += ` A10,10 0 0,1 ${thickness},${height-thickness-10}`;
  for(let y = height - thickness - 10; y > thickness + 10; y-=20) d += ` C${thickness+14},${y-8} ${thickness+8},${y-18} ${thickness},${y-20}`;
  d += ` A10,10 0 0,1 ${thickness+10},${thickness}`;
  return d + ` Z`;
}), 'clouds'));

// 9. Wavy (Deep smooth waves)
fs.writeFileSync(path.join(dir, '09.svg'), makePath(generateOuterAndInner(() => {
  let d = `M${thickness},${thickness}`;
  for(let x = thickness; x < width - thickness; x+=20) d += ` Q${x+5},${thickness+5} ${x+10},${thickness} T${x+20},${thickness}`;
  for(let y = thickness; y < height - thickness; y+=20) d += ` Q${width-thickness-5},${y+5} ${width-thickness},${y+10} T${width-thickness},${y+20}`;
  for(let x = width - thickness; x > thickness; x-=20) d += ` Q${x-5},${height-thickness-5} ${x-10},${height-thickness} T${x-20},${height-thickness}`;
  for(let y = height - thickness; y > thickness; y-=20) d += ` Q${thickness+5},${y-5} ${thickness},${y-10} T${thickness},${y-20}`;
  return d + ` Z`;
}), 'wavy'));

// 10. Zigzag
fs.writeFileSync(path.join(dir, '10.svg'), makePath(generateOuterAndInner(() => {
  let d = `M${thickness},${thickness}`;
  for(let x = thickness; x < width - thickness; x+=10) d += ` L${x+5},${thickness+5} L${x+10},${thickness}`;
  for(let y = thickness; y < height - thickness; y+=10) d += ` L${width-thickness-5},${y+5} L${width-thickness},${y+10}`;
  for(let x = width - thickness; x > thickness; x-=10) d += ` L${x-5},${height-thickness-5} L${x-10},${height-thickness}`;
  for(let y = height - thickness; y > thickness; y-=10) d += ` L${thickness+5},${y-5} L${thickness},${y-10}`;
  return d + ` Z`;
}), 'zigzag'));

console.log('SVGs generated successfully!');
