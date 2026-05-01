import { Canvas, FabricImage, IText, Rect, filters } from 'fabric';

/**
 * Utility to render a Fabric.js JSON state to a high-resolution DataURL.
 * This runs in the browser.
 */
export async function exportDesignToHighRes(json: string, multiplier: number = 4): Promise<string> {
  // Create a temporary canvas element
  const tempElement = document.createElement('canvas');
  
  // Fabric.js needs the width/height to match the original design's base size
  const CANVAS_WIDTH = 400;
  const CANVAS_HEIGHT = 560;

  const canvas = new Canvas(tempElement, {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
  });

  try {
    // Load the JSON data
    // Note: We need to pass the same custom properties we used during saving (isFrame, customColor)
    await canvas.loadFromJSON(JSON.parse(json));
    
    // Ensure all images/filters are rendered
    canvas.renderAll();

    // Export with multiplier for high resolution
    const dataUrl = canvas.toDataURL({
      format: 'png',
      multiplier: multiplier,
      enableRetinaScaling: true,
    });

    return dataUrl;
  } finally {
    // Clean up to prevent memory leaks
    canvas.dispose();
    tempElement.remove();
  }
}
