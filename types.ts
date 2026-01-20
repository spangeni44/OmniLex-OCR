
export enum BlockType {
  PARAGRAPH = 'paragraph',
  HEADER = 'header',
  TABLE = 'table',
  LIST = 'list',
  IMAGE_PLACEHOLDER = 'image_placeholder'
}

export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface TableCell {
  text: string;
  row: number;
  col: number;
  rowSpan?: number;
  colSpan?: number;
}

export interface OCRBlock {
  id: string;
  type: BlockType;
  text: string;
  confidence: number;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
  tableData?: TableCell[];
  fontSize?: number;
  isBold?: boolean;
  isSelected?: boolean; // New: For selective export
}

export interface PageResult {
  pageNumber: number;
  imageUrl: string;
  blocks: OCRBlock[];
  width: number;
  height: number;
}

export interface DocumentResult {
  fileName: string;
  pages: PageResult[];
}
