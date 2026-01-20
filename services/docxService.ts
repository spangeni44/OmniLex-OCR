
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ImageRun } from "docx";
import { PageResult, OCRBlock, BlockType } from '../types';

/**
 * Helper to crop a base64 image using canvas.
 */
async function cropImage(base64: string, box: [number, number, number, number]): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('No context');

      const [ymin, xmin, ymax, xmax] = box;
      const width = ((xmax - xmin) / 1000) * img.width;
      const height = ((ymax - ymin) / 1000) * img.height;
      const x = (xmin / 1000) * img.width;
      const y = (ymin / 1000) * img.height;

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, x, y, width, height, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (!blob) return reject('No blob');
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(new Uint8Array(reader.result as ArrayBuffer));
        };
        reader.readAsArrayBuffer(blob);
      }, 'image/png');
    };
    img.onerror = reject;
    img.src = base64;
  });
}

/**
 * Generates a professional DOCX file from processed OCR results.
 */
export async function generateDocx(pages: PageResult[], exportAll: boolean = false) {
    try {
        const sections = [];

        for (const p of pages) {
            const blocksToExport = exportAll ? p.blocks : p.blocks.filter(b => b.isSelected);
            if (blocksToExport.length === 0) continue;

            // Sort blocks by their vertical position (ymin) primarily, then horizontal (xmin)
            const sortedBlocks = [...blocksToExport].sort((a, b) => {
                const diff = a.box_2d[0] - b.box_2d[0];
                if (Math.abs(diff) < 20) { // Same line roughly
                    return a.box_2d[1] - b.box_2d[1];
                }
                return diff;
            });

            const children: (Paragraph | Table)[] = [];

            for (const block of sortedBlocks) {
                // 1. Handle Images
                if (block.type === BlockType.IMAGE_PLACEHOLDER) {
                    try {
                        const imageBuffer = await cropImage(p.imageUrl, block.box_2d);
                        children.push(new Paragraph({
                            children: [
                                new ImageRun({
                                    data: imageBuffer,
                                    transformation: {
                                        width: (block.box_2d[3] - block.box_2d[1]) * 0.5, // Simple scaling
                                        height: (block.box_2d[2] - block.box_2d[0]) * 0.5,
                                    },
                                }),
                            ],
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 200, after: 200 },
                        }));
                    } catch (e) {
                        console.warn("Failed to crop image block", e);
                    }
                }
                // 2. Handle Tables
                else if (block.type === BlockType.TABLE && block.tableData && block.tableData.length > 0) {
                    const maxRow = Math.max(...block.tableData.map(d => d.row));
                    const maxCol = Math.max(...block.tableData.map(d => d.col));
                    
                    const rows: TableRow[] = [];
                    for (let r = 0; r <= maxRow; r++) {
                        const cells: TableCell[] = [];
                        for (let c = 0; c <= maxCol; c++) {
                            const cellData = block.tableData.find(td => td.row === r && td.col === c);
                            cells.push(new TableCell({
                                children: [
                                    new Paragraph({
                                        children: [
                                            new TextRun({ 
                                                text: cellData?.text || "", 
                                                font: "Nirmala UI", 
                                                size: 20 
                                            })
                                        ],
                                        alignment: AlignmentType.LEFT,
                                    })
                                ],
                                width: { size: 100 / (maxCol + 1), type: WidthType.PERCENTAGE },
                            }));
                        }
                        rows.push(new TableRow({ children: cells }));
                    }

                    children.push(new Table({
                        rows: rows,
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        borders: {
                            top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                            bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                            left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                            right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                        }
                    }));
                    children.push(new Paragraph({ spacing: { before: 200, after: 200 } }));
                } 
                // 3. Handle Text
                else {
                    const lines = block.text.split('\n');
                    
                    lines.forEach((line, index) => {
                        // Handle horizontal offset roughly by adding leading spaces if xmin is large
                        const leadingSpaces = block.box_2d[1] > 400 ? '\t\t' : block.box_2d[1] > 200 ? '\t' : '';
                        const formattedLine = leadingSpaces + line.replace(/\t/g, '    ');
                        
                        children.push(new Paragraph({
                            children: [
                                new TextRun({ 
                                    text: formattedLine, 
                                    font: "Nirmala UI", 
                                    size: block.type === BlockType.HEADER ? 28 : 22,
                                    bold: block.type === BlockType.HEADER || block.isBold
                                })
                            ],
                            alignment: block.box_2d[1] > 600 ? AlignmentType.RIGHT : block.box_2d[1] > 300 && block.box_2d[3] < 700 ? AlignmentType.CENTER : AlignmentType.LEFT,
                            spacing: { 
                                after: (index === lines.length - 1) ? 200 : 50,
                                line: 320 
                            },
                        }));
                    });
                }
            }

            sections.push({
                properties: {
                    page: {
                        margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
                    },
                },
                children: children,
            });
        }

        if (sections.length === 0) return;

        const doc = new Document({
            sections: sections,
            title: "OmniLex Digitation",
            creator: "OmniLex Engine",
            styles: {
                default: {
                    document: {
                        run: { font: "Nirmala UI", size: 22 },
                        paragraph: { spacing: { line: 240 } }
                    }
                }
            }
        });

        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `OmniLex_Export_${new Date().getTime()}.docx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (error) {
        console.error("OmniLex DOCX Engine Error:", error);
        alert("Failed to generate DOCX file.");
    }
}
