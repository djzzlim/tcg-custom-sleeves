# Custom TCG Sleeve Editor

A high-fidelity, interactive Custom Sleeve Editor designed for creating and previewing custom Trading Card Game (TCG) sleeves in real-time. Built with a robust 2D canvas editor and a stunning 3D interactive mockup viewer, this platform allows users to design professional-grade card sleeves with ease.

## Key Features

- **2D Canvas Editor:** Powered by Fabric.js. Users can upload images, add typography, and apply custom SVG frames. Features smart bounding constraints so uploaded backgrounds perfectly cover the sleeve without leaking the background.
- **Real-time 3D Preview:** Powered by Three.js and React Three Fiber. Instantly view the 2D canvas design seamlessly wrapped onto a 3D sleeve model. Includes continuous slow rotation for a premium viewing experience.
- **Custom SVG Frame Engine:** Includes a custom Node.js script that procedurally generates 10 unique, scale-independent SVG borders (Standard, Fade, Torn, Leaves, Clouds, Wavy, Checkerboard, etc.). 
- **Global State Management:** Utilizes Zustand to maintain a highly performant and seamless sync between the 2D UI, the 2D canvas, and the 3D viewer.

## Tech Stack

- **Framework:** Next.js (App Router), React
- **Styling:** Tailwind CSS, Lucide React (Icons)
- **2D Engine:** Fabric.js
- **3D Engine:** Three.js, `@react-three/fiber`, `@react-three/drei`
- **State Management:** Zustand

## Project Structure

```text
├── public/
│   ├── frames/                 # Generated SVG frame assets (01.svg to 10.svg)
│   └── models/                 # 3D assets (e.g., sleeve.glb)
├── scripts/
│   └── generate-frames.js      # Procedural geometry script to generate the SVG frames
├── src/
│   ├── app/                    # Next.js App Router (page.tsx, layout.tsx, globals.css)
│   ├── components/
│   │   ├── Editor/             # 2D Canvas & Editor UI
│   │   │   ├── CanvasEditor.tsx  # Core Fabric.js engine (Panning, Text, Frames)
│   │   │   ├── EditorSidebar.tsx # Main sidebar navigation
│   │   │   └── EditorSubPanel.tsx# Contextual panels (Image Upload, Text Controls, Frame Grid)
│   │   ├── Layout/             # Global layout wrappers
│   │   └── Preview/            # 3D Render space
│   │       └── Mockup3D.tsx      # React Three Fiber canvas mapping the 2D texture to 3D
│   ├── lib/
│   │   └── events.ts           # Event dispatchers for decoupling UI from the Canvas
│   └── store/
│       └── useStore.ts         # Zustand global state (tracks selected items, text props, etc.)
```

## Getting Started

First, ensure you have dependencies installed:

```bash
npm install
```

### Generating Frames
If you need to regenerate the mathematically perfect SVG frames, run the generation script:
```bash
node scripts/generate-frames.js
```
*This will output the 10 SVG files into the `public/frames/` directory.*

### Running the App
Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Future Integration

- **Order Processing:** The `src/app/api/checkout/route.ts` endpoint acts as a skeleton for pushing final designs to Shopify / Google Sheets via webhooks when a user checks out.
