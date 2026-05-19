/** Frame styles available in the editor (shared desktop panel + mobile dock). */
export const EDITOR_FRAME_CHOICES = [
  { id: 'none', label: 'None', src: null as string | null },
  { id: 'standard', label: '01', src: '/frames/01.svg?v=8' },
  { id: 'fade', label: '02', src: '/frames/02.svg?v=8' },
  { id: 'torn1', label: '03', src: '/frames/03.svg?v=8' },
  { id: 'torn2', label: '04', src: '/frames/04.svg?v=8' },
  { id: 'wobble', label: '05', src: '/frames/05.svg?v=8' },
  { id: 'floral', label: '06', src: '/frames/06.svg?v=8' },
  { id: 'scallop', label: '07', src: '/frames/07.svg?v=8' },
  { id: 'stamp', label: '08', src: '/frames/08.svg?v=8' },
  { id: 'wavy', label: '09', src: '/frames/09.svg?v=8' },
  { id: 'zigzag', label: '10', src: '/frames/10.svg?v=8' },
] as const;
